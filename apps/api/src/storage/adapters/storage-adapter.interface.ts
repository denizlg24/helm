import type { Readable } from "node:stream"

// Injection token for the active storage adapter. The factory in
// storage.module.ts binds this to a concrete adapter based on STORAGE_DRIVER.
export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER")

export interface PutObjectInput {
  // Logical, backend-agnostic key. The service builds this as
  // `{workspaceId}/blobs/{sha256}`; each adapter maps it to its own layout
  // (folder chain for deniz-cloud, object key for S3/R2).
  key: string
  body: Readable
  size: number
  contentType: string
}

export interface PutObjectResult {
  // Opaque handle the adapter later uses to fetch/delete the bytes. Stored on
  // the blob document. For deniz-cloud this is the remote file UUID.
  backendId: string
}

export interface ByteRange {
  start: number
  // Inclusive end. Omitted means "to end of file".
  end?: number
}

export interface GetObjectResult {
  stream: Readable
  // Size of the returned body (the range length for partial responses, else
  // the full object size).
  contentLength: number
  // Total object size regardless of range, for Content-Range headers.
  totalSize: number
  mimeType: string
  // True when the adapter honored a requested range and returned partial data.
  isPartial: boolean
}

// A swappable storage backend. Implementations own all backend-specific
// concerns (auth, upload protocol, path layout). The StorageService is the
// only caller and treats every adapter identically.
export interface StorageAdapter {
  put(input: PutObjectInput): Promise<PutObjectResult>
  get(backendId: string, range?: ByteRange): Promise<GetObjectResult>
  delete(backendId: string): Promise<void>
}
