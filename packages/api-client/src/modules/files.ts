import {
  type FileRef,
  FileRefSchema,
  type UploadFileMetadata,
  UploadFileMetadataSchema,
} from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export interface UploadFileInput {
  file: Blob
  filename: string
  metadata?: UploadFileMetadata
}

export const createFilesModule = ({ request }: HelmApiRequestClient) => ({
  upload: ({ file, filename, metadata }: UploadFileInput): Promise<FileRef> => {
    const form = new FormData()
    form.append("file", file, filename)
    const parsedMetadata = metadata
      ? UploadFileMetadataSchema.parse(metadata)
      : undefined
    if (parsedMetadata?.ownerModule) {
      form.append("ownerModule", parsedMetadata.ownerModule)
    }
    if (parsedMetadata?.linkedEntityId) {
      form.append("linkedEntityId", parsedMetadata.linkedEntityId)
    }

    return request(
      "/api/files",
      {
        method: "POST",
        body: form,
      },
      (value) => FileRefSchema.parse(value)
    )
  },

  getMetadata: (id: string): Promise<FileRef> =>
    request(
      `/api/files/${encodeURIComponent(id)}`,
      { method: "GET" },
      (value) => FileRefSchema.parse(value)
    ),

  delete: (id: string): Promise<void> =>
    request(
      `/api/files/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      () => undefined
    ),
})

export type FilesModule = ReturnType<typeof createFilesModule>
