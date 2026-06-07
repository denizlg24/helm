import type Anthropic from "@anthropic-ai/sdk"
import { Injectable } from "@nestjs/common"
import type {
  Note,
  NotesQuery,
  UpdateNoteGroupInput,
  UpdateNoteInput,
} from "@workspace/types"
import { z } from "zod"
import {
  type AssistantServerToolHandler,
  type AssistantToolProvider,
  RegisterAssistantTools,
} from "../assistant/assistant-tool.types"
import type { LlmResult } from "../llm/llm.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { NotesService } from "./notes.service"

const LIST_SNIPPET_CHARS = 200
const GET_CONTENT_CHARS = 20_000
const SUMMARY_INPUT_CHARS = 24_000
const SUMMARY_SYSTEM =
  "You write concise, faithful summaries of a single note. Capture the key points and any action items in a few sentences or short bullets. Do not invent details that are not in the note."

const createNoteToolInput = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(100_000).optional(),
  tags: z.array(z.string().max(64)).max(64).optional(),
  groupId: z.string().min(1).optional(),
  url: z.string().url().optional(),
})

const noteSort = z
  .enum([
    "updated-desc",
    "updated-asc",
    "created-desc",
    "created-asc",
    "title-asc",
    "title-desc",
  ])
  .optional()

const listNotesToolInput = z.object({
  q: z.string().max(200).optional(),
  groupId: z.string().min(1).optional(),
  tag: z.string().max(64).optional(),
  status: z.enum(["open", "archived", "all"]).optional(),
  sourceType: z.enum(["manual", "url", "import", "all"]).optional(),
  sort: noteSort,
  limit: z.number().int().min(1).max(50).optional(),
})

const getNoteToolInput = z.object({ id: z.string().min(1) })

const updateNoteToolInput = z.object({
  id: z.string().min(1),
  title: z.string().max(240).optional(),
  content: z.string().max(100_000).optional(),
  tags: z.array(z.string().max(64)).max(64).optional(),
  groupIds: z.array(z.string().min(1)).max(64).optional(),
  status: z.enum(["open", "archived"]).optional(),
  class: z.string().max(80).optional(),
  summary: z.string().max(2000).optional(),
})

const createGroupToolInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  color: z.string().max(40).optional(),
  parentId: z.string().min(1).optional(),
})

const updateGroupToolInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
})

const summarizeNoteToolInput = z.object({
  id: z.string().min(1),
  persist: z.boolean().optional(),
})

const compactNote = (note: Note) => ({
  id: note.id,
  title: note.title,
  snippet: note.contentPlainText.slice(0, LIST_SNIPPET_CHARS),
  tags: note.tags,
  groupIds: note.groupIds,
  status: note.status,
  sourceType: note.sourceType,
  url: note.url,
  updatedAt: note.updatedAt,
})

// Pulls plain text out of either provider's response shape without casting.
const extractText = (message: LlmResult["message"]): string => {
  if ("content" in message && Array.isArray(message.content)) {
    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim()
  }
  if ("output_text" in message && typeof message.output_text === "string") {
    return message.output_text.trim()
  }
  return ""
}

// Binds notes server tools to the NotesService (seam A). Discovered by the
// assistant registry via the @RegisterAssistantTools() marker.
@RegisterAssistantTools()
@Injectable()
export class NotesAssistantToolProvider implements AssistantToolProvider {
  constructor(private readonly notes: NotesService) {}

  assistantTools(): AssistantServerToolHandler[] {
    return [
      {
        name: "notes_list",
        run: async (ctx, input) => {
          const parsed = listNotesToolInput.parse(input)
          const query: NotesQuery = {
            ...(parsed.q ? { q: parsed.q } : {}),
            ...(parsed.groupId ? { groupId: parsed.groupId } : {}),
            ...(parsed.tag ? { tag: parsed.tag } : {}),
            status: parsed.status ?? "open",
            sourceType: parsed.sourceType ?? "all",
            sort: parsed.sort ?? "updated-desc",
          }
          const { notes } = await this.notes.list(ctx.actor, query)
          const limit = parsed.limit ?? 20
          const rows = notes.slice(0, limit).map(compactNote)
          return JSON.stringify({
            count: rows.length,
            total: notes.length,
            notes: rows,
          })
        },
      },
      {
        name: "notes_get",
        run: async (ctx, input) => {
          const { id } = getNoteToolInput.parse(input)
          const { note } = await this.notes.get(ctx.actor, id)
          const truncated = note.content.length > GET_CONTENT_CHARS
          return JSON.stringify({
            id: note.id,
            title: note.title,
            content: note.content.slice(0, GET_CONTENT_CHARS),
            contentTruncated: truncated,
            tags: note.tags,
            groupIds: note.groupIds,
            status: note.status,
            sourceType: note.sourceType,
            url: note.url,
            summary: note.summary,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          })
        },
      },
      {
        name: "notes_create",
        run: async (ctx, input) => {
          const parsed = createNoteToolInput.parse(input)
          const { note } = await this.notes.create(ctx.actor, {
            ...(parsed.title ? { title: parsed.title } : {}),
            ...(parsed.content ? { content: parsed.content } : {}),
            ...(parsed.url ? { url: parsed.url } : {}),
            ...(parsed.tags ? { tags: parsed.tags } : {}),
            ...(parsed.groupId ? { groupIds: [parsed.groupId] } : {}),
          })
          return JSON.stringify({ ok: true, id: note.id, title: note.title })
        },
      },
      {
        name: "notes_update",
        run: async (ctx, input) => {
          const parsed = updateNoteToolInput.parse(input)
          const patch: UpdateNoteInput = {}
          if (parsed.title !== undefined) patch.title = parsed.title
          if (parsed.content !== undefined) patch.content = parsed.content
          if (parsed.tags !== undefined) patch.tags = parsed.tags
          if (parsed.groupIds !== undefined) patch.groupIds = parsed.groupIds
          if (parsed.status !== undefined) patch.status = parsed.status
          if (parsed.class !== undefined) patch.class = parsed.class
          if (parsed.summary !== undefined) patch.summary = parsed.summary
          if (Object.keys(patch).length === 0) {
            return JSON.stringify({
              ok: false,
              message: "Provide at least one field to update.",
            })
          }
          const { note } = await this.notes.update(ctx.actor, parsed.id, patch)
          return JSON.stringify({
            ok: true,
            id: note.id,
            title: note.title,
            status: note.status,
          })
        },
      },
      {
        name: "notes_delete",
        run: async (ctx, input) => {
          const { id } = getNoteToolInput.parse(input)
          const result = await this.notes.delete(ctx.actor, id)
          return JSON.stringify({ ok: true, id: result.id })
        },
      },
      {
        name: "notes_list_groups",
        run: async (ctx) => {
          const { folders, ungroupedNoteCount } = await this.notes.folders(
            ctx.actor
          )
          return JSON.stringify({
            groups: folders.flatMap((folder) =>
              folder.group
                ? [
                    {
                      id: folder.group.id,
                      name: folder.group.name,
                      parentId: folder.group.parentId,
                      color: folder.group.color,
                      noteCount: folder.noteCount,
                      directNoteCount: folder.directNoteCount,
                      childGroupIds: folder.children,
                    },
                  ]
                : []
            ),
            ungroupedNoteCount,
          })
        },
      },
      {
        name: "notes_create_group",
        run: async (ctx, input) => {
          const parsed = createGroupToolInput.parse(input)
          const { group } = await this.notes.createGroup(ctx.actor, {
            name: parsed.name,
            ...(parsed.description ? { description: parsed.description } : {}),
            ...(parsed.color ? { color: parsed.color } : {}),
            ...(parsed.parentId ? { parentId: parsed.parentId } : {}),
          })
          return JSON.stringify({ ok: true, id: group.id, name: group.name })
        },
      },
      {
        name: "notes_update_group",
        run: async (ctx, input) => {
          const parsed = updateGroupToolInput.parse(input)
          const patch: UpdateNoteGroupInput = {}
          if (parsed.name !== undefined) patch.name = parsed.name
          if (parsed.description !== undefined) {
            patch.description = parsed.description
          }
          if (parsed.color !== undefined) patch.color = parsed.color
          if (parsed.parentId !== undefined) patch.parentId = parsed.parentId
          if (Object.keys(patch).length === 0) {
            return JSON.stringify({
              ok: false,
              message: "Provide at least one field to update.",
            })
          }
          const { group } = await this.notes.updateGroup(
            ctx.actor,
            parsed.id,
            patch
          )
          return JSON.stringify({ ok: true, id: group.id, name: group.name })
        },
      },
      {
        name: "notes_delete_group",
        run: async (ctx, input) => {
          const { id } = getNoteToolInput.parse(input)
          const result = await this.notes.deleteGroup(ctx.actor, id)
          return JSON.stringify({ ok: true, id: result.id })
        },
      },
      {
        name: "notes_list_tags",
        run: async (ctx) => {
          const { tags } = await this.notes.tags(ctx.actor)
          return JSON.stringify({ count: tags.length, tags })
        },
      },
      {
        name: "notes_summarize",
        run: async (ctx, input) => {
          const { id, persist } = summarizeNoteToolInput.parse(input)
          const { note } = await this.notes.get(ctx.actor, id)
          const body = note.content.trim()
          if (!body) {
            return JSON.stringify({
              ok: false,
              message: "Note has no content to summarize.",
            })
          }
          const result = await ctx.llm.complete(
            ctx.actor,
            [
              {
                role: "user",
                content: `Summarize this note.\n\nTitle: ${note.title}\n\n${body.slice(
                  0,
                  SUMMARY_INPUT_CHARS
                )}`,
              },
            ],
            { system: SUMMARY_SYSTEM, maxTokens: 600, feature: "assistant" }
          )
          const summary = extractText(result.message)
          if (!summary) {
            return JSON.stringify({
              ok: false,
              message: "The model returned an empty summary.",
            })
          }
          if (persist) {
            await this.notes.update(ctx.actor, id, { summary })
          }
          return JSON.stringify({
            ok: true,
            id,
            persisted: Boolean(persist),
            summary,
          })
        },
      },
    ]
  }
}
