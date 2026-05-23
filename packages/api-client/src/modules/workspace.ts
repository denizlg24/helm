import {
  type CreateWorkspaceInput,
  CreateWorkspaceInputSchema,
  CurrentWorkspaceResponseSchema,
  type SetActiveWorkspaceInput,
  SetActiveWorkspaceInputSchema,
} from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createWorkspaceModule = ({
  request,
  jsonRequest,
}: HelmApiRequestClient) => ({
  current: () =>
    request("/api/workspaces/current", {}, (value) =>
      CurrentWorkspaceResponseSchema.parse(value)
    ),
  list: () => request("/api/workspaces", {}, (value) => value),
  create: (input: CreateWorkspaceInput) =>
    jsonRequest(
      "/api/workspaces",
      CreateWorkspaceInputSchema.parse(input),
      (value) => value
    ),
  setActive: (input: SetActiveWorkspaceInput) =>
    jsonRequest(
      "/api/workspaces/active",
      SetActiveWorkspaceInputSchema.parse(input),
      (value) => value
    ),
})

export type WorkspaceModule = ReturnType<typeof createWorkspaceModule>
