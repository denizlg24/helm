import { openAsBlob } from "node:fs"
import { readdir, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const TUS_VERSION = "1.0.0"
const PATCH_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000
const PATCH_UPLOAD_RETRY_COUNT = 3

const ARTIFACT_EXTENSIONS = new Set([
  ".appimage",
  ".deb",
  ".dmg",
  ".exe",
  ".msi",
  ".rpm",
  ".tar.gz",
  ".zip",
])

interface FolderRef {
  id: string
  path: string
}

interface UploadedArtifact {
  id: string
  filename: string
  path: string
  sizeBytes: number
  downloadUrl: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

function toSnakeCase(input: string): string {
  return input
    .replace(/[\s-]+/g, "_")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

function isArtifact(path: string): boolean {
  const lower = path.toLowerCase()
  return Array.from(ARTIFACT_EXTENSIONS).some((extension) =>
    lower.endsWith(extension)
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function collectArtifacts(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (isArtifact(absolute)) {
        files.push(absolute)
      }
    }
  }
  await walk(root)
  return files.sort()
}

class DenizCloudClient {
  private projectRoot?: FolderRef
  private readonly folderCache = new Map<string, FolderRef>()

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  async uploadFile(folderSegments: string[], filePath: string) {
    const folder = await this.resolveFolder(folderSegments)
    const fileStat = await stat(filePath)
    const size = fileStat.size
    const filename = basename(filePath)
    const uploadId = await this.createUploadSession(folder.path, filename, size)
    if (uploadId) {
      await this.patchUpload(uploadId, filePath)
    }
    const id = await this.findFileIdByName(folder.id, filename)
    if (!id) {
      throw new Error(
        `Uploaded artifact was not found after finalize: ${filename}`
      )
    }
    return {
      id,
      filename,
      path: `${folder.path}/${filename}`,
      sizeBytes: size,
      downloadUrl: `${this.baseUrl}/api/files/${encodeURIComponent(id)}/download`,
    } satisfies UploadedArtifact
  }

  private async createUploadSession(
    targetFolderPath: string,
    filename: string,
    size: number
  ) {
    const metadata = [
      `filename ${Buffer.from(filename).toString("base64")}`,
      `filetype ${Buffer.from("application/octet-stream").toString("base64")}`,
      `targetFolder ${Buffer.from(targetFolderPath).toString("base64")}`,
    ].join(",")

    const response = await fetch(`${this.baseUrl}/api/uploads`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Tus-Resumable": TUS_VERSION,
        "Upload-Length": String(size),
        "Upload-Metadata": metadata,
      },
    })
    if (response.status === 409) {
      return null
    }
    if (response.status !== 201) {
      throw await this.toError(response)
    }
    const location = response.headers.get("location")
    const uploadId = location?.split("/").pop()
    if (!uploadId) {
      throw new Error("Upload session response was missing Location")
    }
    return uploadId
  }

  private async patchUpload(uploadId: string, filePath: string) {
    const url = `${this.baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`
    const body = await openAsBlob(filePath)

    for (let attempt = 1; attempt <= PATCH_UPLOAD_RETRY_COUNT; attempt += 1) {
      let response: Response
      try {
        response = await fetch(url, {
          method: "PATCH",
          headers: {
            ...this.authHeaders(),
            "Content-Type": "application/offset+octet-stream",
            "Tus-Resumable": TUS_VERSION,
            "Upload-Offset": "0",
          },
          body,
          signal: AbortSignal.timeout(PATCH_UPLOAD_TIMEOUT_MS),
        })
      } catch (error) {
        if (attempt === PATCH_UPLOAD_RETRY_COUNT) {
          throw error
        }
        console.warn(
          `Upload PATCH errored on attempt ${attempt}; retrying: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        await delay(1000 * attempt)
        continue
      }

      if (response.status === 204) {
        return
      }

      const error = await this.toError(response)
      if (
        attempt === PATCH_UPLOAD_RETRY_COUNT ||
        !isRetryableStatus(response.status)
      ) {
        throw error
      }
      console.warn(
        `Upload PATCH failed on attempt ${attempt}; retrying: ${error.message}`
      )
      await delay(1000 * attempt)
    }
  }

  private async resolveFolder(segments: string[]) {
    const cacheKey = segments.join("/")
    const cached = this.folderCache.get(cacheKey)
    if (cached) {
      return cached
    }
    let parent = await this.getProjectRoot()
    for (const segment of segments) {
      parent = await this.ensureChildFolder(parent, segment)
    }
    this.folderCache.set(cacheKey, parent)
    return parent
  }

  private async getProjectRoot() {
    if (this.projectRoot) {
      return this.projectRoot
    }
    const response = await fetch(`${this.baseUrl}/api/folders/roots`, {
      headers: this.authHeaders(),
    })
    if (!response.ok) {
      throw await this.toError(response)
    }
    const body = (await response.json()) as {
      data: { projectRoot: FolderRef }
    }
    this.projectRoot = body.data.projectRoot
    return this.projectRoot
  }

  private async ensureChildFolder(parent: FolderRef, rawName: string) {
    const normalized = toSnakeCase(rawName)
    const contents = await this.listContents(parent.id)
    const existing = contents.data.subfolders.find(
      (folder) => folder.name === normalized
    )
    if (existing) {
      return { id: existing.id, path: existing.path }
    }
    const response = await fetch(`${this.baseUrl}/api/folders`, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: rawName, parentId: parent.id }),
    })
    if (response.status === 409) {
      const retry = await this.listContents(parent.id)
      const found = retry.data.subfolders.find(
        (folder) => folder.name === normalized
      )
      if (found) {
        return { id: found.id, path: found.path }
      }
    }
    if (response.status !== 201) {
      throw await this.toError(response)
    }
    const body = (await response.json()) as { data: FolderRef }
    return body.data
  }

  private async listContents(folderId: string, page = 1) {
    const response = await fetch(
      `${this.baseUrl}/api/folders/${encodeURIComponent(folderId)}/contents?page=${page}&limit=100`,
      { headers: this.authHeaders() }
    )
    if (!response.ok) {
      throw await this.toError(response)
    }
    return (await response.json()) as {
      data: {
        subfolders: Array<{ id: string; name: string; path: string }>
        files: Array<{ id: string; filename: string }>
      }
      pagination: { totalPages: number }
    }
  }

  private async findFileIdByName(folderId: string, filename: string) {
    let page = 1
    for (;;) {
      const contents = await this.listContents(folderId, page)
      const found = contents.data.files.find(
        (file) => file.filename === filename
      )
      if (found) {
        return found.id
      }
      if (page >= contents.pagination.totalPages) {
        return null
      }
      page += 1
    }
  }

  private authHeaders() {
    return { "X-API-Key": this.apiKey }
  }

  private async toError(response: Response) {
    let message = response.statusText
    try {
      const body = (await response.json()) as {
        error?: { message?: string; code?: string }
      }
      message = body.error?.message ?? message
    } catch {
      // Keep status text for non-JSON responses.
    }
    return new Error(`Deniz Cloud ${response.status}: ${message}`)
  }
}

async function main() {
  const baseUrl = requiredEnv("STORAGE_DENIZ_CLOUD_URL").replace(/\/$/, "")
  const apiKey = requiredEnv("STORAGE_DENIZ_CLOUD_API_KEY")
  const buildId = requiredEnv("HELM_CUSTOM_BUILD_ID")
  const artifactDir = resolve(
    repoRoot,
    optionalEnv(
      "HELM_DESKTOP_ARTIFACT_DIR",
      "apps/desktop/src-tauri/target/release/bundle"
    )
  )
  const uploadFolder = optionalEnv(
    "HELM_DESKTOP_UPLOAD_FOLDER",
    `desktop-installers/${buildId}`
  )
    .split("/")
    .filter(Boolean)

  const artifactDirStat = await stat(artifactDir)
  if (!artifactDirStat.isDirectory()) {
    throw new Error(`Artifact directory does not exist: ${artifactDir}`)
  }

  const artifacts = await collectArtifacts(artifactDir)
  if (artifacts.length === 0) {
    throw new Error(`No desktop installer artifacts found in ${artifactDir}`)
  }

  const client = new DenizCloudClient(baseUrl, apiKey)
  const uploaded: UploadedArtifact[] = []
  for (const artifact of artifacts) {
    const relativePath = relative(artifactDir, artifact).split(sep).join("/")
    console.log(`Uploading ${relativePath}`)
    uploaded.push(await client.uploadFile(uploadFolder, artifact))
  }

  const output = {
    buildId,
    folder: uploadFolder.join("/"),
    artifacts: uploaded,
  }
  const outputPath = resolve(
    repoRoot,
    optionalEnv("HELM_DESKTOP_UPLOAD_MANIFEST", "desktop-upload-manifest.json")
  )
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)

  const githubOutput = process.env.GITHUB_OUTPUT
  if (githubOutput) {
    await writeFile(
      githubOutput,
      `manifest=${outputPath}\nartifact_count=${uploaded.length}\n`,
      { flag: "a" }
    )
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
