import {
  type CreatePomodoroSessionInput,
  CreatePomodoroSessionInputSchema,
  PomodoroSessionDetailResponseSchema,
  type PomodoroSessionsQuery,
  PomodoroSessionsQuerySchema,
  PomodoroSessionsResponseSchema,
  PomodoroSettingsResponseSchema,
  type UpdatePomodoroSessionInput,
  UpdatePomodoroSessionInputSchema,
  type UpdatePomodoroSettingsInput,
  UpdatePomodoroSettingsInputSchema,
} from "@workspace/types"
import { z } from "zod"
import type { HelmApiRequestClient } from "../types"

const IdResponseSchema = z.object({
  id: z.string().min(1),
})

const addQuery = (path: string, query?: PomodoroSessionsQuery): string => {
  if (!query) return path
  const parsed = PomodoroSessionsQuerySchema.parse(query)
  const params = new URLSearchParams()
  if (parsed.from) params.set("from", parsed.from.toISOString())
  if (parsed.to) params.set("to", parsed.to.toISOString())
  params.set("limit", String(parsed.limit))
  const serialized = params.toString()
  return serialized ? `${path}?${serialized}` : path
}

const idPath = (base: string, id: string): string =>
  `${base}/${encodeURIComponent(id)}`

export const createPomodoroModule = ({
  request,
  jsonRequest,
}: HelmApiRequestClient) => ({
  settings: {
    get: () =>
      request("/api/pomodoro/settings", {}, (value) =>
        PomodoroSettingsResponseSchema.parse(value)
      ),
    update: (input: UpdatePomodoroSettingsInput) =>
      request(
        "/api/pomodoro/settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(UpdatePomodoroSettingsInputSchema.parse(input)),
        },
        (value) => PomodoroSettingsResponseSchema.parse(value)
      ),
  },
  sessions: {
    list: (query?: PomodoroSessionsQuery) =>
      request(addQuery("/api/pomodoro/sessions", query), {}, (value) =>
        PomodoroSessionsResponseSchema.parse(value)
      ),
    create: (input: CreatePomodoroSessionInput) =>
      jsonRequest(
        "/api/pomodoro/sessions",
        CreatePomodoroSessionInputSchema.parse(input),
        (value) => PomodoroSessionDetailResponseSchema.parse(value)
      ),
    update: (id: string, input: UpdatePomodoroSessionInput) =>
      request(
        idPath("/api/pomodoro/sessions", id),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(UpdatePomodoroSessionInputSchema.parse(input)),
        },
        (value) => PomodoroSessionDetailResponseSchema.parse(value)
      ),
    delete: (id: string) =>
      request(
        idPath("/api/pomodoro/sessions", id),
        { method: "DELETE" },
        (value) => IdResponseSchema.parse(value)
      ),
  },
})

export type PomodoroModule = ReturnType<typeof createPomodoroModule>
