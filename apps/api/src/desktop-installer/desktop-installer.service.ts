import { timingSafeEqual } from "node:crypto"
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { and, db, desc, desktopBuilds, eq } from "@workspace/db"
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

type DesktopBuildRow = typeof desktopBuilds.$inferSelect

@Injectable()
export class DesktopInstallerService {
  constructor(private readonly auditService: AuditService) {}

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

    return rows.map(toDesktopBuild)
  }

  async get(authContext: AuthContext, buildId: string): Promise<DesktopBuild> {
    const row = await this.findOwnedRow(authContext, buildId)
    return toDesktopBuild(row)
  }

  async create(
    authContext: AuthContext,
    input: CreateDesktopBuildInput
  ): Promise<DesktopBuild> {
    const config = this.parseConfig()

    const id = crypto.randomUUID()
    const callbackToken = crypto.randomUUID()
    const now = new Date()

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
      await this.dispatchWorkflow(config, { ...row, callbackToken })
    } catch (error) {
      await db
        .update(desktopBuilds)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Dispatch failed",
          updatedAt: new Date(),
        })
        .where(eq(desktopBuilds.id, id))
      throw new ServiceUnavailableException(
        "Could not start the installer build. Please try again."
      )
    }

    const [building] = await db
      .update(desktopBuilds)
      .set({ status: "building", updatedAt: new Date() })
      .where(eq(desktopBuilds.id, id))
      .returning()

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

    return toDesktopBuild(building ?? row)
  }

  async applyCallback(
    buildId: string,
    token: string,
    input: DesktopBuildCallbackInput
  ): Promise<{ received: true }> {
    // Wrapped in a transaction with a row lock so concurrent per-platform
    // callbacks (one per matrix OS) can't read-merge-write over each other and
    // drop artifacts.
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(desktopBuilds)
        .where(eq(desktopBuilds.id, buildId))
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

      // A successful platform callback marks the build ready and never
      // downgrades an already-ready build. A failure only fails the build if
      // nothing has been produced yet.
      const hasArtifacts = mergedArtifacts.length > 0
      const nextStatus =
        input.status === "ready" || hasArtifacts
          ? "ready"
          : row.status === "ready"
            ? "ready"
            : "failed"

      await tx
        .update(desktopBuilds)
        .set({
          status: nextStatus,
          artifactsJson: mergedArtifacts,
          error:
            input.status === "failed" && !hasArtifacts
              ? (input.error ?? `Build failed on ${input.platform}`)
              : row.error,
          updatedAt: new Date(),
        })
        .where(eq(desktopBuilds.id, buildId))

      return { received: true }
    })
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
      }
    )

    // GitHub returns 204 No Content on a successful dispatch.
    if (response.status !== 204) {
      const detail = await response.text().catch(() => response.statusText)
      throw new Error(`GitHub dispatch failed (${response.status}): ${detail}`)
    }
  }
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
    features: row.features,
    artifacts: row.artifactsJson,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}
