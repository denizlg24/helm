import { Injectable, NotFoundException } from "@nestjs/common"
import type { AuthContext } from "@workspace/types"
import { type Model, Schema } from "mongoose"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { MongoService } from "../mongo/mongo.service"

export interface PomodoroSettingsDocument {
  id: string
  tenantId: string
  workspaceId: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakEvery: number
  autoStartBreaks: boolean
  autoStartFocus: boolean
  soundEnabled: boolean
  notificationsEnabled: boolean
  dailyGoalSessions: number
  createdAt: Date
  updatedAt: Date
}

export interface PomodoroSessionDocument {
  id: string
  tenantId: string
  workspaceId: string
  status: "completed" | "abandoned"
  startedAt: Date
  endedAt: Date
  plannedMinutes: number
  completedSeconds: number
  subject: string | null
  topics: string[]
  notes: string
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
}

type WorkspaceFilter = {
  tenantId: string
  workspaceId: string
}

const baseFields = {
  id: { type: String, default: () => crypto.randomUUID(), unique: true },
  tenantId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
} as const

const pomodoroSettingsSchema = new Schema<PomodoroSettingsDocument>(
  {
    ...baseFields,
    focusMinutes: { type: Number, default: 25 },
    shortBreakMinutes: { type: Number, default: 5 },
    longBreakMinutes: { type: Number, default: 15 },
    longBreakEvery: { type: Number, default: 4 },
    autoStartBreaks: { type: Boolean, default: false },
    autoStartFocus: { type: Boolean, default: false },
    soundEnabled: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },
    dailyGoalSessions: { type: Number, default: 4 },
  },
  { timestamps: true, versionKey: false }
)

const pomodoroSessionSchema = new Schema<PomodoroSessionDocument>(
  {
    ...baseFields,
    status: {
      type: String,
      enum: ["completed", "abandoned"],
      required: true,
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    plannedMinutes: { type: Number, required: true },
    completedSeconds: { type: Number, required: true },
    subject: { type: String, default: null },
    topics: { type: [String], default: [] },
    notes: { type: String, default: "" },
    createdByUserId: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
)

pomodoroSettingsSchema.index({ tenantId: 1, workspaceId: 1 }, { unique: true })
pomodoroSessionSchema.index({ tenantId: 1, workspaceId: 1, startedAt: -1 })

@Injectable()
export class PomodoroRepository {
  constructor(private readonly mongo: MongoService) {}

  get settings(): Model<PomodoroSettingsDocument> {
    const connection = this.mongo.getConnection()
    return (
      connection.models.PomodoroSettings ??
      connection.model<PomodoroSettingsDocument>(
        "PomodoroSettings",
        pomodoroSettingsSchema
      )
    )
  }

  get sessions(): Model<PomodoroSessionDocument> {
    const connection = this.mongo.getConnection()
    return (
      connection.models.PomodoroSession ??
      connection.model<PomodoroSessionDocument>(
        "PomodoroSession",
        pomodoroSessionSchema
      )
    )
  }

  workspaceFilter(actor: AuthContext): WorkspaceFilter {
    return {
      tenantId: actor.tenantId,
      workspaceId: actor.workspaceId,
    }
  }

  async findSessionOrThrow(
    actor: AuthContext,
    id: string
  ): Promise<PomodoroSessionDocument> {
    const session = await this.sessions
      .findOne({ ...this.workspaceFilter(actor), id })
      .lean<PomodoroSessionDocument>()
      .exec()
    if (!session) {
      throw new NotFoundException("Pomodoro session not found")
    }
    return session
  }
}
