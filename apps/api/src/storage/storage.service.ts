import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common"
import type { AuthContext, FileRef } from "@workspace/types"
import {
  type ByteRange,
  type GetObjectResult,
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "./adapters/storage-adapter.interface"
import type { StorageRepository } from "./storage.repository"

interface UploadMetadata {
  ownerModule?: string
  linkedEntityId?: string
}

interface UploadInput {
  stream: NodeJS.ReadableStream
  isTruncated: () => boolean
  metadata: () => UploadMetadata
  filename: string
  mimeType: string
}

interface StagedUpload {
  path: string
  size: number
  sha256: string
}

const ADOPT_DELETE_RETRY_COUNT = 50
const ADOPT_DELETE_RETRY_DELAY_MS = 100

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)

  constructor(
    private readonly repo: StorageRepository,
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter
  ) {}

  // Blobs are namespaced per workspace in the backend so a future migration to
  // per-workspace backends is a path change, not a data reshuffle.
  private blobKey(workspaceId: string, sha256: string): string {
    return `${workspaceId}/blobs/${sha256}`
  }

  async upload(actor: AuthContext, input: UploadInput): Promise<FileRef> {
    const tempDir = await mkdtemp(join(tmpdir(), "helm-upload-"))
    try {
      const staged = await this.stageUpload(input, tempDir)
      if (input.isTruncated()) {
        throw new PayloadTooLargeException(
          "File exceeds the maximum upload size"
        )
      }
      const metadata = input.metadata()

      const blob =
        (await this.findReusableBlob(actor.workspaceId, staged.sha256)) ??
        (await this.uploadNewBlob(actor, staged, input))

      const ref = await this.repo.createRef({
        workspaceId: actor.workspaceId,
        tenantId: actor.tenantId,
        blobId: blob._id,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: staged.size,
        sha256: staged.sha256,
        ownerModule: metadata.ownerModule ?? null,
        linkedEntityId: metadata.linkedEntityId ?? null,
      })
      return this.repo.toRef(ref)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  private async stageUpload(
    input: UploadInput,
    tempDir: string
  ): Promise<StagedUpload> {
    const hash = createHash("sha256")
    const path = join(tempDir, "body")
    let size = 0
    const hashingStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk)
        size += chunk.byteLength
        callback(null, chunk)
      },
    })
    await pipeline(input.stream, hashingStream, createWriteStream(path))
    return { path, size, sha256: hash.digest("hex") }
  }

  private async uploadNewBlob(
    actor: AuthContext,
    staged: StagedUpload,
    input: UploadInput
  ): Promise<{ _id: string }> {
    const { backendId } = await this.adapter.put({
      key: this.blobKey(actor.workspaceId, staged.sha256),
      body: createReadStream(staged.path),
      size: staged.size,
      contentType: input.mimeType,
    })

    const created = await this.repo.createBlob({
      workspaceId: actor.workspaceId,
      tenantId: actor.tenantId,
      sha256: staged.sha256,
      backendId,
      sizeBytes: staged.size,
      mimeType: input.mimeType,
    })
    if (created) {
      return created
    }

    const winner = await this.findReusableBlob(actor.workspaceId, staged.sha256)
    if (!winner) {
      throw new Error("Blob remained unavailable after a concurrent race")
    }
    return winner
  }

  private async findReusableBlob(
    workspaceId: string,
    sha256: string
  ): Promise<{ _id: string } | null> {
    for (let attempt = 0; attempt < ADOPT_DELETE_RETRY_COUNT; attempt += 1) {
      const winner = await this.repo.incrementExistingBlob(workspaceId, sha256)
      if (winner) {
        return winner
      }
      const existing = await this.repo.getBlobByWorkspaceAndHash(
        workspaceId,
        sha256
      )
      if (!existing) {
        return null
      }
      await this.delay(ADOPT_DELETE_RETRY_DELAY_MS)
    }
    throw new ServiceUnavailableException(
      "Blob deletion is still in progress; retry the upload"
    )
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  async getMetadata(actor: AuthContext, refId: string): Promise<FileRef> {
    const ref = await this.repo.getRef(actor.workspaceId, refId)
    if (!ref) {
      throw new NotFoundException("File not found")
    }
    return this.repo.toRef(ref)
  }

  async download(
    actor: AuthContext,
    refId: string,
    range?: ByteRange
  ): Promise<{ ref: FileRef; object: GetObjectResult }> {
    const ref = await this.repo.getRef(actor.workspaceId, refId)
    if (!ref) {
      throw new NotFoundException("File not found")
    }
    const blob = await this.repo.getBlobById(ref.blobId)
    if (!blob || blob.workspaceId !== actor.workspaceId) {
      throw new NotFoundException("File content not found")
    }
    const object = await this.adapter.get(blob.backendId, range)
    return { ref: this.repo.toRef(ref), object }
  }

  async delete(actor: AuthContext, refId: string): Promise<void> {
    const ref = await this.repo.getRef(actor.workspaceId, refId)
    if (!ref) {
      throw new NotFoundException("File not found")
    }
    const deleted = await this.repo.deleteRef(actor.workspaceId, refId)
    if (!deleted) {
      return
    }

    const blob = await this.repo.releaseBlobRef(ref.blobId)
    if (!blob) {
      return
    }
    try {
      await this.adapter.delete(blob.backendId)
    } catch (error) {
      this.logger.error(
        `Failed to delete backend object ${blob.backendId}; releasing delete claim for retry`,
        error instanceof Error ? error.stack : undefined
      )
      await this.repo.releaseBlobDeleteClaim(ref.blobId)
      return
    }
    await this.repo.deleteClaimedBlob(ref.blobId)
  }
}
