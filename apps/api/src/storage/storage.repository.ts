import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type { FileBlob, FileRef } from "@workspace/types"
import { type Model, Schema } from "mongoose"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { MongoService } from "../mongo/mongo.service"

interface BlobDoc {
  _id: string
  workspaceId: string
  tenantId: string
  sha256: string
  backendId: string
  sizeBytes: number
  mimeType: string
  refCount: number
  deletingAt?: Date
  createdAt: Date
  updatedAt: Date
}

interface RefDoc {
  _id: string
  workspaceId: string
  tenantId: string
  blobId: string
  filename: string
  mimeType: string
  sizeBytes: number
  sha256: string
  ownerModule: string | null
  linkedEntityId: string | null
  createdAt: Date
}

const blobSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true },
    sha256: { type: String, required: true },
    backendId: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    mimeType: { type: String, required: true },
    refCount: { type: Number, required: true, default: 0 },
    deletingAt: { type: Date, default: undefined },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false, collection: "file_blobs" }
)
// Content-addressing within a workspace. The unique constraint is what makes
// concurrent first-uploads of identical bytes converge on a single blob.
blobSchema.index({ workspaceId: 1, sha256: 1 }, { unique: true })

const refSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true },
    blobId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true },
    ownerModule: { type: String, default: null },
    linkedEntityId: { type: String, default: null, index: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false, collection: "file_refs" }
)

interface CreateBlobInput {
  workspaceId: string
  tenantId: string
  sha256: string
  backendId: string
  sizeBytes: number
  mimeType: string
}

interface CreateRefInput {
  workspaceId: string
  tenantId: string
  blobId: string
  filename: string
  mimeType: string
  sizeBytes: number
  sha256: string
  ownerModule: string | null
  linkedEntityId: string | null
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  )
}

@Injectable()
export class StorageRepository {
  constructor(private readonly mongo: MongoService) {}

  private blobs(): Model<BlobDoc> {
    const connection = this.mongo.getConnection()
    try {
      return connection.model<BlobDoc>("FileBlob")
    } catch {
      return connection.model<BlobDoc>("FileBlob", blobSchema)
    }
  }

  private refs(): Model<RefDoc> {
    const connection = this.mongo.getConnection()
    try {
      return connection.model<RefDoc>("FileRef")
    } catch {
      return connection.model<RefDoc>("FileRef", refSchema)
    }
  }

  // Atomically bumps refCount on an existing blob that is safe to reuse.
  // Blobs claimed for backend deletion are excluded so bytes cannot disappear
  // after an upload has re-referenced them.
  async incrementExistingBlob(
    workspaceId: string,
    sha256: string
  ): Promise<BlobDoc | null> {
    return this.blobs()
      .findOneAndUpdate(
        { workspaceId, sha256, deletingAt: { $exists: false } },
        { $inc: { refCount: 1 }, $set: { updatedAt: new Date() } },
        { returnDocument: "after" }
      )
      .lean()
      .exec()
  }

  // Inserts a new blob with refCount 1. Returns null on a unique-key collision
  // (a concurrent request created it first) so the caller can fall back to
  // incrementing the winner.
  async createBlob(input: CreateBlobInput): Promise<BlobDoc | null> {
    const now = new Date()
    const doc: BlobDoc = {
      _id: randomUUID(),
      ...input,
      refCount: 1,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await this.blobs().create(doc)
      return doc
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null
      }
      throw error
    }
  }

  async getBlobById(blobId: string): Promise<BlobDoc | null> {
    return this.blobs().findOne({ _id: blobId }).lean().exec()
  }

  async getBlobByWorkspaceAndHash(
    workspaceId: string,
    sha256: string
  ): Promise<BlobDoc | null> {
    return this.blobs().findOne({ workspaceId, sha256 }).lean().exec()
  }

  // Releases one reference. If it was the last reference, the blob is
  // atomically claimed for backend deletion and returned to the caller.
  async releaseBlobRef(blobId: string): Promise<BlobDoc | null> {
    const decremented = await this.blobs()
      .findOneAndUpdate(
        { _id: blobId, refCount: { $gt: 1 } },
        { $inc: { refCount: -1 }, $set: { updatedAt: new Date() } },
        { returnDocument: "after" }
      )
      .lean()
      .exec()
    if (decremented) {
      return null
    }
    const now = new Date()
    return this.blobs()
      .findOneAndUpdate(
        { _id: blobId, refCount: 1, deletingAt: { $exists: false } },
        {
          $inc: { refCount: -1 },
          $set: { deletingAt: now, updatedAt: now },
        },
        { returnDocument: "after" }
      )
      .lean()
      .exec()
  }

  async deleteClaimedBlob(blobId: string): Promise<void> {
    await this.blobs()
      .deleteOne({ _id: blobId, refCount: 0, deletingAt: { $exists: true } })
      .exec()
  }

  async releaseBlobDeleteClaim(blobId: string): Promise<void> {
    await this.blobs()
      .updateOne(
        { _id: blobId, refCount: 0, deletingAt: { $exists: true } },
        { $unset: { deletingAt: "" }, $set: { updatedAt: new Date() } }
      )
      .exec()
  }

  async createRef(input: CreateRefInput): Promise<RefDoc> {
    const doc: RefDoc = { _id: randomUUID(), ...input, createdAt: new Date() }
    await this.refs().create(doc)
    return doc
  }

  async getRef(workspaceId: string, id: string): Promise<RefDoc | null> {
    return this.refs().findOne({ _id: id, workspaceId }).lean().exec()
  }

  async deleteRef(workspaceId: string, id: string): Promise<boolean> {
    const result = await this.refs().deleteOne({ _id: id, workspaceId }).exec()
    return result.deletedCount > 0
  }

  toBlob(doc: BlobDoc): FileBlob {
    return {
      id: doc._id,
      workspaceId: doc.workspaceId,
      tenantId: doc.tenantId,
      sha256: doc.sha256,
      backendId: doc.backendId,
      sizeBytes: doc.sizeBytes,
      mimeType: doc.mimeType,
      refCount: doc.refCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }

  toRef(doc: RefDoc): FileRef {
    return {
      id: doc._id,
      workspaceId: doc.workspaceId,
      tenantId: doc.tenantId,
      blobId: doc.blobId,
      filename: doc.filename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      sha256: doc.sha256,
      ownerModule: doc.ownerModule,
      linkedEntityId: doc.linkedEntityId,
      createdAt: doc.createdAt,
    }
  }
}

export type { BlobDoc, RefDoc }
