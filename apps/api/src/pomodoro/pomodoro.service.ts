import { BadRequestException, Injectable } from "@nestjs/common"
import type {
  AuthContext,
  CreatePomodoroSessionInput,
  PomodoroSession,
  PomodoroSessionsQuery,
  PomodoroSettings,
  UpdatePomodoroSessionInput,
  UpdatePomodoroSettingsInput,
} from "@workspace/types"
import { PomodoroSettingsSchema } from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AuditService } from "../audit/audit.service"
import type {
  PomodoroSessionDocument,
  PomodoroSettingsDocument,
} from "./pomodoro.repository"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { PomodoroRepository } from "./pomodoro.repository"

const DEFAULT_SETTINGS = PomodoroSettingsSchema.parse({})

const unique = (values: string[]): string[] => [...new Set(values)]

const normalizeTopics = (topics: string[] | undefined): string[] =>
  unique((topics ?? []).map((topic) => topic.trim()).filter(Boolean))

const normalizeSubject = (subject: string | null | undefined): string | null =>
  subject?.trim() || null

const mapSettings = (
  settings: PomodoroSettingsDocument | null
): PomodoroSettings =>
  settings
    ? {
        focusMinutes: settings.focusMinutes,
        shortBreakMinutes: settings.shortBreakMinutes,
        longBreakMinutes: settings.longBreakMinutes,
        longBreakEvery: settings.longBreakEvery,
        autoStartBreaks: settings.autoStartBreaks,
        autoStartFocus: settings.autoStartFocus,
        soundEnabled: settings.soundEnabled,
        notificationsEnabled: settings.notificationsEnabled,
        dailyGoalSessions: settings.dailyGoalSessions,
      }
    : DEFAULT_SETTINGS

const mapSession = (session: PomodoroSessionDocument): PomodoroSession => ({
  id: session.id,
  tenantId: session.tenantId,
  workspaceId: session.workspaceId,
  status: session.status,
  startedAt: session.startedAt,
  endedAt: session.endedAt,
  plannedMinutes: session.plannedMinutes,
  completedSeconds: session.completedSeconds,
  subject: session.subject,
  topics: session.topics,
  notes: session.notes,
  createdByUserId: session.createdByUserId,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
})

@Injectable()
export class PomodoroService {
  constructor(
    private readonly repository: PomodoroRepository,
    private readonly audit: AuditService
  ) {}

  async getSettings(actor: AuthContext) {
    const settings = await this.repository.settings
      .findOne(this.repository.workspaceFilter(actor))
      .lean<PomodoroSettingsDocument>()
      .exec()
    return { settings: mapSettings(settings) }
  }

  async updateSettings(actor: AuthContext, input: UpdatePomodoroSettingsInput) {
    const settings = await this.repository.settings
      .findOneAndUpdate(
        this.repository.workspaceFilter(actor),
        {
          $set: input,
          $setOnInsert: this.repository.workspaceFilter(actor),
        },
        { new: true, upsert: true }
      )
      .lean<PomodoroSettingsDocument>()
      .exec()
    return { settings: mapSettings(settings) }
  }

  async listSessions(actor: AuthContext, query: PomodoroSessionsQuery) {
    const startedAt: Record<string, Date> = {}
    if (query.from) startedAt.$gte = query.from
    if (query.to) startedAt.$lte = query.to

    const sessions = await this.repository.sessions
      .find({
        ...this.repository.workspaceFilter(actor),
        ...(Object.keys(startedAt).length > 0 ? { startedAt } : {}),
      })
      .sort({ startedAt: -1 })
      .limit(query.limit)
      .lean<PomodoroSessionDocument[]>()
      .exec()

    return { sessions: sessions.map(mapSession) }
  }

  async createSession(actor: AuthContext, input: CreatePomodoroSessionInput) {
    if (input.endedAt.getTime() < input.startedAt.getTime()) {
      throw new BadRequestException("Session cannot end before it starts")
    }

    const created = await this.repository.sessions.create({
      ...this.repository.workspaceFilter(actor),
      status: input.status,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      plannedMinutes: input.plannedMinutes,
      completedSeconds: input.completedSeconds,
      subject: normalizeSubject(input.subject),
      topics: normalizeTopics(input.topics),
      notes: input.notes ?? "",
      createdByUserId: actor.userId,
    })

    const session = await this.repository.findSessionOrThrow(actor, created.id)
    return { session: mapSession(session) }
  }

  async updateSession(
    actor: AuthContext,
    id: string,
    input: UpdatePomodoroSessionInput
  ) {
    await this.repository.findSessionOrThrow(actor, id)

    const updates: Partial<PomodoroSessionDocument> = {}
    if (input.subject !== undefined) {
      updates.subject = normalizeSubject(input.subject)
    }
    if (input.topics !== undefined) {
      updates.topics = normalizeTopics(input.topics)
    }
    if (input.notes !== undefined) {
      updates.notes = input.notes
    }

    await this.repository.sessions.updateOne(
      { ...this.repository.workspaceFilter(actor), id },
      { $set: updates }
    )

    const session = await this.repository.findSessionOrThrow(actor, id)
    return { session: mapSession(session) }
  }

  async deleteSession(actor: AuthContext, id: string) {
    await this.repository.findSessionOrThrow(actor, id)
    await this.repository.sessions.deleteOne({
      ...this.repository.workspaceFilter(actor),
      id,
    })
    await this.audit.write(actor, {
      action: "pomodoro-session.delete",
      resourceType: "pomodoro-session",
      resourceId: id,
    })
    return { id }
  }
}
