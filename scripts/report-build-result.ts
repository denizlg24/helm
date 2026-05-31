import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

// Hand-written validation: this script runs via `bun run` from the repo root
// in CI, where workspace dependencies like zod are not resolvable. Keep it to
// Node builtins only, like the sibling desktop build scripts.

interface ManifestArtifact {
  filename: string
  sizeBytes: number
  downloadUrl: string
}

interface UploadManifest {
  artifacts: ManifestArtifact[]
}

type Platform = "linux" | "windows" | "macos"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseManifest(raw: string): UploadManifest | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(data) || !Array.isArray(data.artifacts)) {
    return null
  }

  const artifacts: ManifestArtifact[] = []
  for (const item of data.artifacts) {
    if (!isRecord(item)) {
      return null
    }
    const { filename, sizeBytes, downloadUrl } = item
    if (
      typeof filename !== "string" ||
      filename.length === 0 ||
      typeof sizeBytes !== "number" ||
      !Number.isFinite(sizeBytes) ||
      sizeBytes < 0 ||
      typeof downloadUrl !== "string" ||
      downloadUrl.length === 0
    ) {
      return null
    }
    artifacts.push({ filename, sizeBytes, downloadUrl })
  }

  return { artifacts }
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ""
}

function platformFromRunnerOs(runnerOs: string): Platform {
  switch (runnerOs.toLowerCase()) {
    case "linux":
      return "linux"
    case "windows":
      return "windows"
    case "macos":
      return "macos"
    default:
      throw new Error(`Unknown runner OS: ${runnerOs}`)
  }
}

async function readManifest(): Promise<UploadManifest | null> {
  const manifestPath = resolve(
    process.cwd(),
    env("HELM_DESKTOP_UPLOAD_MANIFEST") || "desktop-upload-manifest.json"
  )
  let raw: string
  try {
    raw = await readFile(manifestPath, "utf8")
  } catch {
    return null
  }

  const manifest = parseManifest(raw)
  if (!manifest) {
    console.warn(`Invalid upload manifest at ${manifestPath}`)
    return null
  }
  return manifest
}

async function main() {
  const callbackUrl = env("HELM_INSTALLER_CALLBACK_URL").replace(/\/$/, "")
  const callbackToken = env("HELM_INSTALLER_CALLBACK_TOKEN")
  const buildId = env("HELM_CUSTOM_BUILD_ID")

  if (!(callbackUrl && callbackToken && buildId)) {
    console.log("Callback not configured; skipping result report.")
    return
  }

  const platform = platformFromRunnerOs(env("HELM_INSTALLER_RUNNER_OS"))
  const jobStatus = env("HELM_INSTALLER_JOB_STATUS").toLowerCase()
  const manifest = await readManifest()

  const succeeded = jobStatus === "success" && manifest !== null
  const artifacts =
    succeeded && manifest
      ? manifest.artifacts.map((artifact: ManifestArtifact) => ({
          platform,
          filename: artifact.filename,
          downloadUrl: artifact.downloadUrl,
          sizeBytes: artifact.sizeBytes,
        }))
      : []

  const body = {
    status: succeeded ? ("ready" as const) : ("failed" as const),
    platform,
    artifacts,
    error: succeeded
      ? null
      : `Build job ${platform} finished as "${jobStatus}"`,
  }

  const response = await fetch(
    `${callbackUrl}/api/desktop-installer/builds/${encodeURIComponent(buildId)}/callback`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-helm-build-token": callbackToken,
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText)
    throw new Error(`Callback failed (${response.status}): ${detail}`)
  }

  console.log(
    `Reported ${platform} build as "${body.status}" with ${artifacts.length} artifact(s).`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
