import { Readable } from "node:stream"
import { Injectable, Logger } from "@nestjs/common"
import { z } from "zod"
import type {
  ByteRange,
  GetObjectResult,
  PutObjectInput,
  PutObjectResult,
  StorageAdapter,
} from "./storage-adapter.interface"

const DenizCloudEnvSchema = z.object({
  STORAGE_DENIZ_CLOUD_URL: z.string().url(),
  STORAGE_DENIZ_CLOUD_API_KEY: z.string().min(1),
})

const TUS_VERSION = "1.0.0"

// Mirror of the storage server's folder/file name normalization
// (deniz-cloud `toSnakeCase`). We must compute the same value the server will
// store so we can match folders/files we created by name.
function toSnakeCase(input: string): string {
  return input
    .replace(/[\s-]+/g, "_")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

// Bridge a WHATWG fetch body into a Node Readable without `Readable.fromWeb`,
// whose lib.dom vs node:stream/web typings clash under TS strict mode.
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

class StorageBackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = "StorageBackendError"
  }
}

interface FolderRef {
  id: string
  path: string
}

const RootFoldersSchema = z.object({
  data: z.object({
    projectRoot: z.object({ id: z.string(), path: z.string() }),
  }),
})

const FolderContentsSchema = z.object({
  data: z.object({
    subfolders: z.array(
      z.object({ id: z.string(), name: z.string(), path: z.string() })
    ),
    files: z.array(
      z.object({
        id: z.string(),
        filename: z.string(),
        mimeType: z.string().nullable().optional(),
        sizeBytes: z.number(),
      })
    ),
  }),
  pagination: z.object({ page: z.number(), totalPages: z.number() }),
})

const CreatedFolderSchema = z.object({
  data: z.object({ id: z.string(), path: z.string() }),
})

@Injectable()
export class DenizCloudStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(DenizCloudStorageAdapter.name)
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchTimeoutMs = 30_000
  private projectRoot?: FolderRef
  // Resolved `{workspaceId}/blobs` folder per workspace. Cleared on process
  // restart; cold lookups re-resolve via the contents listing.
  private readonly blobsFolderCache = new Map<string, FolderRef>()

  constructor() {
    const env = DenizCloudEnvSchema.parse(process.env)
    this.baseUrl = env.STORAGE_DENIZ_CLOUD_URL.replace(/\/$/, "")
    this.apiKey = env.STORAGE_DENIZ_CLOUD_API_KEY
  }

  private async fetchWithTimeout(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, this.fetchTimeoutMs)
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  async put(input: PutObjectInput): Promise<PutObjectResult> {
    const { folderSegments, filename } = this.parseKey(input.key)
    const folder = await this.resolveFolder(folderSegments)

    const uploadId = await this.createUploadSession(
      folder.path,
      filename,
      input
    )
    if (uploadId) {
      await this.patchChunks(uploadId, input.body)
    }
    // The TUS finalize returns no file id (only 204 + Upload-Offset), and a
    // pre-existing object yields 409 with no id either. Either way the id is
    // resolved by scanning the folder for our deterministic filename.
    const backendId = await this.findFileIdByName(folder.id, filename)
    if (!backendId) {
      throw new StorageBackendError(
        `Uploaded blob ${filename} not found in folder after finalize`,
        500
      )
    }
    return { backendId }
  }

  async get(backendId: string, range?: ByteRange): Promise<GetObjectResult> {
    const headers = this.authHeaders()
    if (range) {
      headers.Range = `bytes=${range.start}-${range.end ?? ""}`
    }
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/files/${encodeURIComponent(backendId)}/download`,
      { headers }
    )
    if (res.status !== 200 && res.status !== 206) {
      throw await this.toError(res)
    }
    if (!res.body) {
      throw new StorageBackendError("Download response had no body", 502)
    }
    const totalSize =
      this.parseTotalSize(res) ?? Number(res.headers.get("content-length") ?? 0)
    return {
      stream: webStreamToReadable(res.body),
      contentLength: Number(res.headers.get("content-length") ?? 0),
      totalSize,
      mimeType: res.headers.get("content-type") ?? "application/octet-stream",
      isPartial: res.status === 206,
    }
  }

  async delete(backendId: string): Promise<void> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/files/${encodeURIComponent(backendId)}`,
      { method: "DELETE", headers: this.authHeaders() }
    )
    // Idempotent: a missing remote file means the bytes are already gone.
    if (res.status === 404) {
      return
    }
    if (!res.ok) {
      throw await this.toError(res)
    }
  }

  private parseKey(key: string): {
    folderSegments: string[]
    filename: string
  } {
    const segments = key.split("/").filter(Boolean)
    const filename = segments.at(-1)
    if (!filename || segments.length < 2) {
      throw new StorageBackendError(`Invalid storage key: ${key}`, 500)
    }
    return { folderSegments: segments.slice(0, -1), filename }
  }

  private async createUploadSession(
    targetFolderPath: string,
    filename: string,
    input: PutObjectInput
  ): Promise<string | null> {
    const metadata = [
      `filename ${Buffer.from(filename).toString("base64")}`,
      `filetype ${Buffer.from(input.contentType).toString("base64")}`,
      `targetFolder ${Buffer.from(targetFolderPath).toString("base64")}`,
    ].join(",")

    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/uploads`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Upload-Length": String(input.size),
        "Upload-Metadata": metadata,
        "Tus-Resumable": TUS_VERSION,
      },
    })

    // Bytes already present at this path (e.g. a previous upload whose Mongo
    // record was lost). Skip the PATCH and resolve the existing id.
    if (res.status === 409) {
      return null
    }
    if (res.status !== 201) {
      throw await this.toError(res)
    }
    const location = res.headers.get("location")
    const uploadId = location?.split("/").pop()
    if (!uploadId) {
      throw new StorageBackendError(
        "Upload session missing Location header",
        502
      )
    }
    return uploadId
  }

  private async patchChunks(uploadId: string, body: Readable): Promise<void> {
    let offset = 0
    for await (const chunk of body) {
      const bytes = this.toBytes(chunk)
      if (bytes.byteLength === 0) {
        continue
      }
      await this.patchChunk(uploadId, bytes, offset)
      offset += bytes.byteLength
    }
  }

  private async patchChunk(
    uploadId: string,
    body: Uint8Array,
    offset: number
  ): Promise<void> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/uploads/${encodeURIComponent(uploadId)}`,
      {
        method: "PATCH",
        headers: {
          ...this.authHeaders(),
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
          "Tus-Resumable": TUS_VERSION,
        },
        body: this.toArrayBuffer(body),
      }
    )
    if (res.status !== 204) {
      throw await this.toError(res)
    }
  }

  private toBytes(chunk: string | Buffer | Uint8Array): Uint8Array {
    if (typeof chunk === "string") {
      return Buffer.from(chunk)
    }
    return chunk instanceof Buffer ? new Uint8Array(chunk) : chunk
  }

  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    return buffer
  }

  private async resolveFolder(segments: string[]): Promise<FolderRef> {
    const cacheKey = segments.join("/")
    const cached = this.blobsFolderCache.get(cacheKey)
    if (cached) {
      return cached
    }
    let parent = await this.getProjectRoot()
    for (const segment of segments) {
      parent = await this.ensureChildFolder(parent, segment)
    }
    this.blobsFolderCache.set(cacheKey, parent)
    return parent
  }

  private async getProjectRoot(): Promise<FolderRef> {
    if (this.projectRoot) {
      return this.projectRoot
    }
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/folders/roots`,
      {
        headers: this.authHeaders(),
      }
    )
    if (!res.ok) {
      throw await this.toError(res)
    }
    const { data } = RootFoldersSchema.parse(await res.json())
    this.projectRoot = data.projectRoot
    return this.projectRoot
  }

  private async ensureChildFolder(
    parent: FolderRef,
    rawName: string
  ): Promise<FolderRef> {
    const normalized = toSnakeCase(rawName)
    const contents = await this.listContents(parent.id)
    const existing = contents.subfolders.find((f) => f.name === normalized)
    if (existing) {
      return { id: existing.id, path: existing.path }
    }
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/folders`, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: rawName, parentId: parent.id }),
    })
    // Lost a creation race; another request made it first. Re-list and resolve.
    if (res.status === 409) {
      const retry = await this.listContents(parent.id)
      const found = retry.subfolders.find((f) => f.name === normalized)
      if (found) {
        return { id: found.id, path: found.path }
      }
    }
    if (res.status !== 201) {
      throw await this.toError(res)
    }
    return CreatedFolderSchema.parse(await res.json()).data
  }

  private async listContents(
    folderId: string,
    page = 1
  ): Promise<
    z.infer<typeof FolderContentsSchema>["data"] & { totalPages: number }
  > {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/folders/${encodeURIComponent(folderId)}/contents?page=${page}&limit=100`,
      { headers: this.authHeaders() }
    )
    if (!res.ok) {
      throw await this.toError(res)
    }
    const parsed = FolderContentsSchema.parse(await res.json())
    return { ...parsed.data, totalPages: parsed.pagination.totalPages }
  }

  // Files are returned newest-first, so a just-uploaded blob is on page 1.
  // Falls back to paging for the cold-recovery (409) path on busy folders.
  private async findFileIdByName(
    folderId: string,
    filename: string
  ): Promise<string | null> {
    let page = 1
    for (;;) {
      const contents = await this.listContents(folderId, page)
      const match = contents.files.find((f) => f.filename === filename)
      if (match) {
        return match.id
      }
      if (page >= contents.totalPages) {
        return null
      }
      page += 1
    }
  }

  private authHeaders(): Record<string, string> {
    return { "X-API-Key": this.apiKey }
  }

  private parseTotalSize(res: Response): number | undefined {
    const contentRange = res.headers.get("content-range")
    const total = contentRange?.split("/").pop()
    const parsed = total ? Number(total) : Number.NaN
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private async toError(res: Response): Promise<StorageBackendError> {
    let code: string | undefined
    let message = res.statusText
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string }
      }
      code = body.error?.code
      message = body.error?.message ?? message
    } catch {
      // Non-JSON error body; keep the status text.
    }
    this.logger.error(
      `Storage backend error ${res.status} ${code ?? ""}: ${message}`
    )
    return new StorageBackendError(message, res.status, code)
  }
}
