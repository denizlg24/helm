import {
  type CreateDesktopBuildInput,
  CreateDesktopBuildInputSchema,
  DesktopBuildListResponseSchema,
  DesktopBuildSchema,
} from "@workspace/types"
import { z } from "zod"
import type { HelmApiRequestClient } from "../types"

const idSchema = z.string().min(1)
const encodeId = (id: string) => encodeURIComponent(idSchema.parse(id))

export const createDesktopInstallerModule = ({
  request,
  jsonRequest,
}: HelmApiRequestClient) => ({
  list: () =>
    request("/api/desktop-installer/builds", {}, (value) =>
      DesktopBuildListResponseSchema.parse(value)
    ),
  get: (id: string) =>
    request(`/api/desktop-installer/builds/${encodeId(id)}`, {}, (value) =>
      DesktopBuildSchema.parse(value)
    ),
  create: (input: CreateDesktopBuildInput) =>
    jsonRequest(
      "/api/desktop-installer/builds",
      CreateDesktopBuildInputSchema.parse(input),
      (value) => DesktopBuildSchema.parse(value)
    ),
})

export type DesktopInstallerModule = ReturnType<
  typeof createDesktopInstallerModule
>
