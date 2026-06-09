import { Injectable } from "@nestjs/common"
import type { PomodoroSession } from "@workspace/types"
import { z } from "zod"
import {
  type AssistantServerToolHandler,
  type AssistantToolProvider,
  RegisterAssistantTools,
} from "../assistant/assistant-tool.types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { PomodoroService } from "./pomodoro.service"

const NOTES_SNIPPET_CHARS = 200
const DEFAULT_LIST_LIMIT = 50

const updateSettingsToolInput = z.object({
  focusMinutes: z.number().int().min(1).max(180).optional(),
  shortBreakMinutes: z.number().int().min(1).max(60).optional(),
  longBreakMinutes: z.number().int().min(1).max(120).optional(),
  longBreakEvery: z.number().int().min(1).max(12).optional(),
  autoStartBreaks: z.boolean().optional(),
  autoStartFocus: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  dailyGoalSessions: z.number().int().min(1).max(24).optional(),
})

const listSessionsToolInput = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

const updateSessionToolInput = z.object({
  id: z.string().min(1),
  subject: z.string().max(200).nullable().optional(),
  topics: z.array(z.string().min(1).max(60)).max(20).optional(),
  notes: z.string().max(20_000).optional(),
})

const deleteSessionToolInput = z.object({
  id: z.string().min(1),
})

const compactSession = (session: PomodoroSession) => ({
  id: session.id,
  status: session.status,
  startedAt: session.startedAt,
  plannedMinutes: session.plannedMinutes,
  completedSeconds: session.completedSeconds,
  subject: session.subject,
  topics: session.topics,
  notesSnippet: session.notes.slice(0, NOTES_SNIPPET_CHARS),
})

// Binds pomodoro server tools to the PomodoroService (seam A). Timer-control
// tools are client-side and have no handler here.
@RegisterAssistantTools()
@Injectable()
export class PomodoroAssistantToolProvider implements AssistantToolProvider {
  constructor(private readonly pomodoro: PomodoroService) {}

  assistantTools(): AssistantServerToolHandler[] {
    return [
      {
        name: "pomodoro_get_settings",
        run: async (ctx) => {
          const { settings } = await this.pomodoro.getSettings(ctx.actor)
          return JSON.stringify(settings)
        },
      },
      {
        name: "pomodoro_update_settings",
        run: async (ctx, input) => {
          const parsed = updateSettingsToolInput.parse(input)
          const { settings } = await this.pomodoro.updateSettings(
            ctx.actor,
            parsed
          )
          return JSON.stringify(settings)
        },
      },
      {
        name: "pomodoro_list_sessions",
        run: async (ctx, input) => {
          const parsed = listSessionsToolInput.parse(input)
          const { sessions } = await this.pomodoro.listSessions(ctx.actor, {
            ...(parsed.from ? { from: parsed.from } : {}),
            ...(parsed.to ? { to: parsed.to } : {}),
            limit: parsed.limit ?? DEFAULT_LIST_LIMIT,
          })
          return JSON.stringify({
            count: sessions.length,
            sessions: sessions.map(compactSession),
          })
        },
      },
      {
        name: "pomodoro_update_session",
        run: async (ctx, input) => {
          const { id, ...changes } = updateSessionToolInput.parse(input)
          const { session } = await this.pomodoro.updateSession(
            ctx.actor,
            id,
            changes
          )
          return JSON.stringify(compactSession(session))
        },
      },
      {
        name: "pomodoro_delete_session",
        run: async (ctx, input) => {
          const { id } = deleteSessionToolInput.parse(input)
          await this.pomodoro.deleteSession(ctx.actor, id)
          return JSON.stringify({ deleted: true, id })
        },
      },
    ]
  }
}
