import { timingSafeEqual } from "node:crypto"
import { Readable } from "node:stream"
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { and, db, desc, desktopBuilds, eq, ne } from "@workspace/db"
import {
  type AuthContext,
  type CreateDesktopBuildInput,
  type DesktopBuild,
  type DesktopBuildArtifact,
  type DesktopBuildCallbackInput,
  DesktopBuildSchema,
} from "@workspace/types"
import { z } from "zod"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AuditService } from "../audit/audit.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { NotificationsService } from "../notifications/notifications.service"

const GithubEnvSchema = z.object({
  GITHUB_INSTALLER_TOKEN: z.string().min(1),
  GITHUB_INSTALLER_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/u, "Expected owner/repo"),
  GITHUB_INSTALLER_WORKFLOW: z
    .string()
    .min(1)
    .default("custom-desktop-installer.yml"),
  GITHUB_INSTALLER_REF: z.string().min(1).default("main"),
  // Public base URL of this API that the CI runner can reach to post results.
  GITHUB_INSTALLER_CALLBACK_BASE_URL: z.string().url(),
})

const DesktopArtifactProxyEnvSchema = z.object({
  HELM_AUTH_BASE_URL: z.string().url().default("http://localhost:3003"),
  STORAGE_DENIZ_CLOUD_URL: z.string().url(),
  STORAGE_DENIZ_CLOUD_API_KEY: z.string().min(1),
})

const DISPATCH_FAILURE_MESSAGE =
  "Could not start the installer build. Please try again."

type DesktopBuildRow = typeof desktopBuilds.$inferSelect

interface ProxiedArtifact {
  filename: string
  stream: Readable
  contentType: string
  contentLength: number | null
  isPartial: boolean
  contentRange: string | null
}

@Injectable()
export class DesktopInstallerService {
  constructor(
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService
  ) {}

  async list(authContext: AuthContext): Promise<DesktopBuild[]> {
    const rows = await db
      .select()
      .from(desktopBuilds)
      .where(
        and(
          eq(desktopBuilds.workspaceId, authContext.workspaceId),
          eq(desktopBuilds.userId, authContext.userId)
        )
      )
      .orderBy(desc(desktopBuilds.createdAt))

    return rows.map((row) => toDesktopBuild(row))
  }

  async get(authContext: AuthContext, buildId: string): Promise<DesktopBuild> {
    const row = await this.findOwnedRow(authContext, buildId)
    return toDesktopBuild(row)
  }

  // Latest desktop version published as a GitHub Release (`desktop-v{semver}`),
  // or null when the repo has no release yet. Surfaced to the console so it can
  // compare against a build's stored appVersion and offer an update.
  async getLatestVersion(): Promise<{ version: string | null }> {
    const config = this.parseConfig()
    return { version: await this.fetchLatestVersion(config) }
  }

  async getBuildWorkspaceId(buildId: string): Promise<{ workspaceId: string }> {
    const [row] = await db
      .select({ workspaceId: desktopBuilds.workspaceId })
      .from(desktopBuilds)
      .where(eq(desktopBuilds.id, buildId))
      .limit(1)

    if (!row) {
      throw new NotFoundException("Build not found")
    }
    return row
  }

  async create(
    authContext: AuthContext,
    input: CreateDesktopBuildInput
  ): Promise<DesktopBuild> {
    const config = this.parseConfig()

    const id = crypto.randomUUID()
    const callbackToken = crypto.randomUUID()
    const now = new Date()
    // Snapshot the version this installer is built against so we can later tell
    // whether a newer release has shipped. Best-effort: a lookup failure just
    // stores null (no update prompt) rather than blocking the build.
    const appVersion = await this.fetchLatestVersion(config)

    const [row] = await db
      .insert(desktopBuilds)
      .values({
        id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        userId: authContext.userId,
        status: "queued",
        appName: input.appName,
        identifier: input.identifier ?? null,
        theme: input.theme,
        appVersion,
        features: input.features,
        artifactsJson: [],
        callbackToken,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!row) {
      throw new ServiceUnavailableException("Could not create build")
    }

    try {
      await this.dispatchWorkflow(config, row)
    } catch (error) {
      console.error("Failed to dispatch desktop installer workflow", {
        error,
        buildId: id,
        workspaceId: authContext.workspaceId,
        theme: input.theme,
      })
      await db
        .update(desktopBuilds)
        .set({
          status: "failed",
          error: DISPATCH_FAILURE_MESSAGE,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(desktopBuilds.id, id),
            eq(desktopBuilds.workspaceId, authContext.workspaceId)
          )
        )
      throw new ServiceUnavailableException(DISPATCH_FAILURE_MESSAGE)
    }

    const [building] = await db
      .update(desktopBuilds)
      .set({ status: "building", updatedAt: new Date() })
      .where(eq(desktopBuilds.id, id))
      .returning()

    // A workspace+user keeps exactly one installer at a time. Now that the new
    // build has been dispatched, drop every prior build and free its bytes from
    // storage. Done after a successful dispatch so a failed dispatch leaves the
    // previous working installer intact.
    await this.purgePreviousBuilds(authContext, id)

    try {
      await this.auditService.write(authContext, {
        action: "desktop_installer.build.created",
        resourceType: "desktop_build",
        resourceId: id,
        metadataJson: {
          appName: input.appName,
          theme: input.theme,
          features: input.features,
        },
      })
    } catch (error) {
      console.error("Failed to write audit log for desktop build", {
        error,
        buildId: id,
        authContext,
        appName: input.appName,
      })
    }

    return toDesktopBuild(building ?? row)
  }

  async downloadArtifact(
    authContext: AuthContext,
    buildId: string,
    artifactIndex: number,
    rangeHeader?: string
  ): Promise<ProxiedArtifact> {
    const row = await this.findOwnedRow(authContext, buildId)
    const artifact = row.artifactsJson[artifactIndex]
    if (!artifact) {
      throw new NotFoundException("Artifact not found")
    }

    const config = this.parseArtifactProxyConfig()
    const storageBaseUrl = config.STORAGE_DENIZ_CLOUD_URL.replace(/\/$/, "")
    if (!artifact.downloadUrl.startsWith(`${storageBaseUrl}/`)) {
      throw new ServiceUnavailableException("Artifact storage URL is invalid")
    }

    const headers: Record<string, string> = {
      "X-API-Key": config.STORAGE_DENIZ_CLOUD_API_KEY,
    }
    if (rangeHeader) {
      headers.Range = rangeHeader
    }

    const response = await fetch(artifact.downloadUrl, { headers })
    if (response.status === 404) {
      throw new NotFoundException("Artifact file not found")
    }
    if (response.status !== 200 && response.status !== 206) {
      throw new ServiceUnavailableException("Could not download artifact")
    }
    if (!response.body) {
      throw new ServiceUnavailableException("Artifact download had no body")
    }

    const contentLengthHeader = response.headers.get("content-length")
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : null
    return {
      filename: artifact.filename,
      stream: webStreamToReadable(response.body),
      contentType:
        response.headers.get("content-type") ?? "application/octet-stream",
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
      isPartial: response.status === 206,
      contentRange: response.headers.get("content-range"),
    }
  }

  async applyCallback(
    buildId: string,
    token: string,
    input: DesktopBuildCallbackInput,
    workspaceId: string
  ): Promise<{ received: true }> {
    // Wrapped in a transaction with a row lock so concurrent per-platform
    // callbacks (one per matrix OS) can't read-merge-write over each other and
    // drop artifacts.
    const readyTarget = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(desktopBuilds)
        .where(
          and(
            eq(desktopBuilds.id, buildId),
            eq(desktopBuilds.workspaceId, workspaceId)
          )
        )
        .limit(1)
        .for("update")

      if (!row) {
        throw new NotFoundException("Build not found")
      }
      if (!tokensMatch(row.callbackToken, token)) {
        throw new ForbiddenException("Invalid build callback token")
      }

      const mergedArtifacts = mergeArtifacts(
        row.artifactsJson,
        input.platform,
        input.artifacts
      )

      // A build is ready only when ALL matrix platforms have completed
      // successfully. Track which platforms have reported back.
      const reportedPlatforms = new Set(
        mergedArtifacts.map((artifact) => artifact.platform)
      )
      const expectedPlatforms: string[] = ["linux", "windows", "macos"]
      const allPlatformsCompleted = expectedPlatforms.every((platform) =>
        reportedPlatforms.has(platform)
      )

      const hasArtifacts = mergedArtifacts.length > 0
      const nextStatus =
        input.status === "failed"
          ? "failed"
          : allPlatformsCompleted && hasArtifacts
            ? "ready"
            : row.status === "ready"
              ? "ready"
              : row.status

      await tx
        .update(desktopBuilds)
        .set({
          status: nextStatus,
          artifactsJson: mergedArtifacts,
          error:
            nextStatus === "ready"
              ? null
              : input.status === "failed"
                ? (input.error ?? `Build failed on ${input.platform}`)
                : row.error,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(desktopBuilds.id, buildId),
            eq(desktopBuilds.workspaceId, workspaceId)
          )
        )

      // Notification target is returned so the emit happens after commit —
      // never inside the transaction.
      if (row.status !== "ready" && nextStatus === "ready") {
        return {
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          userId: row.userId,
        }
      }
      return null
    })

    if (readyTarget) {
      await this.notificationsService.emit(readyTarget, {
        category: "system",
        severity: "success",
        title: "Desktop installer ready",
        body: "Your custom desktop installer finished building and is ready to download.",
        dedupeKey: `installer:${buildId}:ready`,
        actions: [
          {
            kind: "navigate",
            id: "download-installer",
            label: "Download",
            route: "/desktop",
            app: "console",
          },
        ],
      })
    }

    return { received: true }
  }

  // Deletes every build for this workspace+user except `keepBuildId`, removing
  // each one's uploaded artifacts from storage first. Best-effort: a storage
  // delete failure is logged but never blocks the new build (the bytes can be
  // reaped later; the row is still removed so the single-build invariant holds).
  private async purgePreviousBuilds(
    authContext: AuthContext,
    keepBuildId: string
  ): Promise<void> {
    const stale = await db
      .select()
      .from(desktopBuilds)
      .where(
        and(
          eq(desktopBuilds.workspaceId, authContext.workspaceId),
          eq(desktopBuilds.userId, authContext.userId),
          ne(desktopBuilds.id, keepBuildId)
        )
      )

    if (stale.length === 0) {
      return
    }

    const storage = this.tryParseArtifactProxyConfig()
    if (storage) {
      for (const row of stale) {
        await this.deleteArtifactBytes(storage, row)
      }
    }

    await db
      .delete(desktopBuilds)
      .where(
        and(
          eq(desktopBuilds.workspaceId, authContext.workspaceId),
          eq(desktopBuilds.userId, authContext.userId),
          ne(desktopBuilds.id, keepBuildId)
        )
      )
  }

  private async deleteArtifactBytes(
    config: z.infer<typeof DesktopArtifactProxyEnvSchema>,
    row: DesktopBuildRow
  ): Promise<void> {
    const storageBaseUrl = config.STORAGE_DENIZ_CLOUD_URL.replace(/\/$/, "")
    for (const artifact of row.artifactsJson) {
      const fileId = parseStorageFileId(artifact.downloadUrl, storageBaseUrl)
      if (!fileId) {
        continue
      }
      try {
        const response = await fetch(
          `${storageBaseUrl}/api/files/${encodeURIComponent(fileId)}`,
          {
            method: "DELETE",
            headers: { "X-API-Key": config.STORAGE_DENIZ_CLOUD_API_KEY },
          }
        )
        // 404 means the bytes are already gone — treat as success.
        if (!response.ok && response.status !== 404) {
          console.error("Failed to delete desktop installer artifact", {
            buildId: row.id,
            fileId,
            status: response.status,
          })
        }
      } catch (error) {
        console.error("Errored deleting desktop installer artifact", {
          error,
          buildId: row.id,
          fileId,
        })
      }
    }
  }

  private async findOwnedRow(
    authContext: AuthContext,
    buildId: string
  ): Promise<DesktopBuildRow> {
    const [row] = await db
      .select()
      .from(desktopBuilds)
      .where(
        and(
          eq(desktopBuilds.id, buildId),
          eq(desktopBuilds.workspaceId, authContext.workspaceId),
          eq(desktopBuilds.userId, authContext.userId)
        )
      )
      .limit(1)

    if (!row) {
      throw new NotFoundException("Build not found")
    }
    return row
  }

  private parseConfig() {
    const result = GithubEnvSchema.safeParse(process.env)
    if (!result.success) {
      throw new ServiceUnavailableException(
        "Custom desktop installers are not configured on this server."
      )
    }
    return result.data
  }

  private parseArtifactProxyConfig() {
    const result = DesktopArtifactProxyEnvSchema.safeParse(process.env)
    if (!result.success) {
      throw new ServiceUnavailableException(
        "Desktop artifact downloads are not configured on this server."
      )
    }
    return result.data
  }

  // Same config as parseArtifactProxyConfig but non-throwing: used by the
  // best-effort purge so a server without storage configured still cleans up
  // database rows without aborting a build.
  private tryParseArtifactProxyConfig() {
    const result = DesktopArtifactProxyEnvSchema.safeParse(process.env)
    return result.success ? result.data : null
  }

  // Reads the repo's latest GitHub Release and returns its semver, stripping the
  // `desktop-v` tag prefix. Returns null on any failure (no release, network,
  // bad shape) so callers can degrade gracefully.
  private async fetchLatestVersion(
    config: z.infer<typeof GithubEnvSchema>
  ): Promise<string | null> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.GITHUB_INSTALLER_REPO}/releases/latest`,
        {
          headers: {
            Authorization: `Bearer ${config.GITHUB_INSTALLER_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          signal: controller.signal,
        }
      )
      if (!response.ok) {
        return null
      }
      const body = (await response.json()) as { tag_name?: unknown }
      const parsed = z.string().min(1).safeParse(body.tag_name)
      if (!parsed.success) {
        return null
      }
      return parsed.data.replace(/^desktop-v/u, "")
    } catch (error) {
      console.error("Failed to fetch latest desktop version", { error })
      return null
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async dispatchWorkflow(
    config: z.infer<typeof GithubEnvSchema>,
    row: DesktopBuildRow
  ) {
    const callbackUrl = config.GITHUB_INSTALLER_CALLBACK_BASE_URL.replace(
      /\/$/,
      ""
    )
    const inputs: Record<string, string> = {
      build_id: row.id,
      app_name: row.appName,
      theme: row.theme,
      features: row.features.join(","),
      upload_folder: `desktop-installers/${row.id}`,
      callback_url: callbackUrl,
      callback_token: row.callbackToken,
    }
    if (row.identifier) {
      inputs.app_identifier = row.identifier
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.GITHUB_INSTALLER_REPO}/actions/workflows/${config.GITHUB_INSTALLER_WORKFLOW}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.GITHUB_INSTALLER_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: config.GITHUB_INSTALLER_REF, inputs }),
          signal: controller.signal,
        }
      )

      // GitHub returns 204 No Content on a successful dispatch.
      if (response.status !== 204) {
        const detail = await response.text().catch(() => response.statusText)
        throw new Error(
          `GitHub dispatch failed (${response.status}): ${detail}`
        )
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          "GitHub workflow dispatch timed out after 10 seconds. Please try again."
        )
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

// Extracts the deniz-cloud file id from a stored artifact download URL of the
// form `${storageBaseUrl}/api/files/{id}/download`. Returns null when the URL
// doesn't belong to the configured storage host, so we never issue deletes
// against an unexpected origin.
function parseStorageFileId(
  downloadUrl: string,
  storageBaseUrl: string
): string | null {
  if (!downloadUrl.startsWith(`${storageBaseUrl}/`)) {
    return null
  }
  const match = downloadUrl.match(/\/api\/files\/([^/]+)\/download$/u)
  const encodedId = match?.[1]
  return encodedId ? decodeURIComponent(encodedId) : null
}

// Constant-time comparison so a caller can't probe the per-build token by
// measuring response timing.
function tokensMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }
  return timingSafeEqual(expectedBuffer, providedBuffer)
}

type StoredArtifact = DesktopBuildRow["artifactsJson"][number]

function mergeArtifacts(
  existing: DesktopBuildRow["artifactsJson"],
  platform: string,
  incoming: DesktopBuildArtifact[]
): StoredArtifact[] {
  // Replace any prior artifacts for this platform so a re-run is idempotent.
  const kept = existing.filter((artifact) => artifact.platform !== platform)
  return [...kept, ...incoming]
}

// Validates the stored row against the public schema, which also strips the
// internal callbackToken before the build reaches any client.
function toDesktopBuild(row: DesktopBuildRow): DesktopBuild {
  return DesktopBuildSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    tenantId: row.tenantId,
    userId: row.userId,
    status: row.status,
    appName: row.appName,
    identifier: row.identifier,
    theme: row.theme,
    appVersion: row.appVersion,
    features: row.features,
    artifacts: row.artifactsJson.map((artifact, index) => ({
      ...artifact,
      downloadUrl: artifactProxyUrl(row.id, index),
    })),
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function artifactProxyUrl(buildId: string, artifactIndex: number): string {
  const baseUrl = DesktopArtifactProxyEnvSchema.shape.HELM_AUTH_BASE_URL.parse(
    process.env.HELM_AUTH_BASE_URL
  ).replace(/\/$/, "")
  return `${baseUrl}/api/desktop-installer/builds/${encodeURIComponent(buildId)}/artifacts/${artifactIndex}/download`
}

function webStreamToReadable(body: ReadableStream<Uint8Array>): Readable {
  const reader = body.getReader()
  let inFlight = false
  return new Readable({
    read() {
      if (inFlight) {
        return
      }
      inFlight = true
      reader
        .read()
        .then(({ done, value }) => {
          inFlight = false
          this.push(done ? null : value)
        })
        .catch((error) => {
          inFlight = false
          this.destroy(
            error instanceof Error ? error : new Error(String(error))
          )
        })
    },
  })
}
