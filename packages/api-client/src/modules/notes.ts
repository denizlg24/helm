import {
  type CreateNoteGroupInput,
  CreateNoteGroupInputSchema,
  type CreateNoteInput,
  CreateNoteInputSchema,
  NoteDetailResponseSchema,
  NoteGroupSchema,
  NoteGroupsResponseSchema,
  NotesFoldersResponseSchema,
  NotesGraphResponseSchema,
  NotesListResponseSchema,
  type NotesQuery,
  NotesQuerySchema,
  NoteTagsResponseSchema,
  type UpdateNoteGroupInput,
  UpdateNoteGroupInputSchema,
  type UpdateNoteInput,
  UpdateNoteInputSchema,
} from "@workspace/types"
import { z } from "zod"
import type { HelmApiRequestClient } from "../types"

const NoteGroupDetailResponseSchema = z.object({
  group: NoteGroupSchema,
})

const IdResponseSchema = z.object({
  id: z.string().min(1),
})

const addQuery = (path: string, query?: NotesQuery): string => {
  if (!query) return path
  const parsed = NotesQuerySchema.parse(query)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const serialized = params.toString()
  return serialized ? `${path}?${serialized}` : path
}

const idPath = (base: string, id: string): string =>
  `${base}/${encodeURIComponent(id)}`

export const createNotesModule = ({
  request,
  jsonRequest,
}: HelmApiRequestClient) => ({
  list: (query?: NotesQuery) =>
    request(addQuery("/api/notes", query), {}, (value) =>
      NotesListResponseSchema.parse(value)
    ),
  graph: () =>
    request("/api/notes/graph", {}, (value) =>
      NotesGraphResponseSchema.parse(value)
    ),
  folders: () =>
    request("/api/notes/folders", {}, (value) =>
      NotesFoldersResponseSchema.parse(value)
    ),
  tags: () =>
    request("/api/notes/tags", {}, (value) =>
      NoteTagsResponseSchema.parse(value)
    ),
  get: (id: string) =>
    request(idPath("/api/notes", id), {}, (value) =>
      NoteDetailResponseSchema.parse(value)
    ),
  create: (input: CreateNoteInput) =>
    jsonRequest("/api/notes", CreateNoteInputSchema.parse(input), (value) =>
      NoteDetailResponseSchema.parse(value)
    ),
  update: (id: string, input: UpdateNoteInput) =>
    request(
      idPath("/api/notes", id),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(UpdateNoteInputSchema.parse(input)),
      },
      (value) => NoteDetailResponseSchema.parse(value)
    ),
  delete: (id: string) =>
    request(idPath("/api/notes", id), { method: "DELETE" }, (value) =>
      IdResponseSchema.parse(value)
    ),
  groups: {
    list: () =>
      request("/api/note-groups", {}, (value) =>
        NoteGroupsResponseSchema.parse(value)
      ),
    create: (input: CreateNoteGroupInput) =>
      jsonRequest(
        "/api/note-groups",
        CreateNoteGroupInputSchema.parse(input),
        (value) => NoteGroupDetailResponseSchema.parse(value)
      ),
    update: (id: string, input: UpdateNoteGroupInput) =>
      request(
        idPath("/api/note-groups", id),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(UpdateNoteGroupInputSchema.parse(input)),
        },
        (value) => NoteGroupDetailResponseSchema.parse(value)
      ),
    delete: (id: string) =>
      request(idPath("/api/note-groups", id), { method: "DELETE" }, (value) =>
        IdResponseSchema.parse(value)
      ),
  },
})

export type NotesModule = ReturnType<typeof createNotesModule>
