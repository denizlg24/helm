import {
  type CreateApiTokenInput,
  CreateApiTokenInputSchema,
  type UpdateApiTokenInput,
  UpdateApiTokenInputSchema,
} from "@workspace/types"
import { z } from "zod"
import type { HelmApiRequestClient } from "../types"

const idSchema = z.string().min(1)
const encodeId = (id: string) => encodeURIComponent(idSchema.parse(id))

export const createApiTokensModule = ({
  request,
  jsonRequest,
}: HelmApiRequestClient) => ({
  list: () => request("/api/api-tokens", {}, (value) => value),
  create: (input: CreateApiTokenInput) =>
    jsonRequest(
      "/api/api-tokens",
      CreateApiTokenInputSchema.parse(input),
      (value) => value
    ),
  update: (id: string, input: UpdateApiTokenInput) =>
    request(
      `/api/api-tokens/${encodeId(id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(UpdateApiTokenInputSchema.parse(input)),
      },
      (value) => value
    ),
  delete: (id: string) =>
    request(
      `/api/api-tokens/${encodeId(id)}`,
      { method: "DELETE" },
      (value) => value
    ),
})

export type ApiTokensModule = ReturnType<typeof createApiTokensModule>
