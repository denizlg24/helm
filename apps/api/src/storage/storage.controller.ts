import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common"
import { type AuthContext, UploadFileMetadataSchema } from "@workspace/types"
import type { FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"
import {
  AuditSensitive,
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
import type { ByteRange } from "./adapters/storage-adapter.interface"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { StorageService } from "./storage.service"

const RefIdSchema = z.string().min(1)
const RANGE_PATTERN = /^bytes=(\d+)-(\d*)$/u

const ByteRangeSchema = z
  .object({
    start: z.coerce.number().int().nonnegative(),
    end: z.coerce.number().int().nonnegative().optional(),
  })
  .refine((data) => data.end === undefined || data.end >= data.start, {
    message: "end must be >= start",
  })

function parseRange(header: string | undefined): ByteRange | undefined {
  if (!header) {
    return undefined
  }
  const match = RANGE_PATTERN.exec(header)
  if (!match) {
    return undefined
  }
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : undefined
  return ByteRangeSchema.parse({ start, end })
}

function fieldValue(
  fields: Record<string, unknown> | undefined,
  name: string
): string | undefined {
  const field = fields?.[name]
  if (
    typeof field === "object" &&
    field !== null &&
    "value" in field &&
    typeof field.value === "string"
  ) {
    return field.value
  }
  return undefined
}

@Controller("api/files")
@RequireWorkspace()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @RequireScopes("files:write")
  async upload(
    @CurrentAuthContext() actor: AuthContext,
    @Req() request: FastifyRequest
  ) {
    if (!request.isMultipart()) {
      throw new BadRequestException("Expected multipart/form-data")
    }
    const file = await request.file()
    if (!file) {
      throw new BadRequestException("No file part in request")
    }

    return this.storage.upload(actor, {
      stream: file.file,
      isTruncated: () => file.file.truncated,
      metadata: () =>
        UploadFileMetadataSchema.parse({
          ownerModule: fieldValue(file.fields, "ownerModule"),
          linkedEntityId: fieldValue(file.fields, "linkedEntityId"),
        }),
      filename: file.filename,
      mimeType: file.mimetype || "application/octet-stream",
    })
  }

  @Get(":id")
  @RequireScopes("files:read")
  async getMetadata(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string
  ) {
    return this.storage.getMetadata(actor, RefIdSchema.parse(id))
  }

  @Get(":id/download")
  @RequireScopes("files:read")
  async download(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    const range = parseRange(request.headers.range)
    const { ref, object } = await this.storage.download(
      actor,
      RefIdSchema.parse(id),
      range
    )

    const disposition =
      request.query &&
      typeof request.query === "object" &&
      "download" in request.query
        ? "attachment"
        : "inline"

    reply
      .header("Content-Type", object.mimeType)
      .header("Content-Length", String(object.contentLength))
      .header(
        "Content-Disposition",
        `${disposition}; filename="${encodeURIComponent(ref.filename)}"`
      )
      .header("Accept-Ranges", "bytes")

    if (object.isPartial && range) {
      const end = range.end ?? object.totalSize - 1
      reply
        .status(206)
        .header(
          "Content-Range",
          `bytes ${range.start}-${end}/${object.totalSize}`
        )
    }

    return reply.send(object.stream)
  }

  @Delete(":id")
  @RequireScopes("files:delete")
  @AuditSensitive("file.delete")
  async delete(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string
  ) {
    await this.storage.delete(actor, RefIdSchema.parse(id))
    return { id }
  }
}
