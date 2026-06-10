import { Injectable } from "@nestjs/common"
import type {
  NotificationAction,
  NotificationCategory,
  NotificationSeverity,
  NotificationSource,
} from "@workspace/types"
import { type Model, Schema } from "mongoose"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { MongoService } from "../mongo/mongo.service"

export interface NotificationDocument {
  id: string
  tenantId: string
  workspaceId: string
  userId: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  body: string | null
  actions: NotificationAction[]
  source: NotificationSource
  dedupeKey: string | null
  readAt: Date | null
  archivedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface NotificationPreferencesDocument {
  tenantId: string
  workspaceId: string
  userId: string
  mutedCategories: NotificationCategory[]
  createdAt: Date
  updatedAt: Date
}

const baseFields = {
  id: { type: String, default: () => crypto.randomUUID(), unique: true },
  tenantId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
} as const

// Superset of every NotificationAction variant; the Zod discriminated union in
// @workspace/types is the authoritative shape at the API boundary.
const notificationActionSchema = new Schema(
  {
    kind: { type: String, required: true },
    id: { type: String, required: true },
    label: { type: String, required: true },
    url: { type: String },
    route: { type: String },
    app: { type: String },
  },
  { _id: false, versionKey: false }
)

const notificationSchema = new Schema<NotificationDocument>(
  {
    ...baseFields,
    userId: { type: String, required: true },
    category: {
      type: String,
      enum: ["billing", "system", "pomodoro"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },
    title: { type: String, required: true },
    body: { type: String, default: null },
    actions: { type: [notificationActionSchema], default: [] },
    source: { type: String, enum: ["server", "client"], required: true },
    dedupeKey: { type: String, default: null },
    readAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
)

notificationSchema.index({
  tenantId: 1,
  workspaceId: 1,
  userId: 1,
  createdAt: -1,
})
notificationSchema.index({
  tenantId: 1,
  workspaceId: 1,
  userId: 1,
  readAt: 1,
  archivedAt: 1,
})
// Partial so documents without a dedupeKey never collide with each other.
notificationSchema.index(
  { tenantId: 1, workspaceId: 1, userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
)
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const notificationPreferencesSchema =
  new Schema<NotificationPreferencesDocument>(
    {
      tenantId: { type: String, required: true },
      workspaceId: { type: String, required: true },
      userId: { type: String, required: true },
      mutedCategories: { type: [String], default: [] },
    },
    { timestamps: true, versionKey: false }
  )

notificationPreferencesSchema.index(
  { tenantId: 1, workspaceId: 1, userId: 1 },
  { unique: true }
)

@Injectable()
export class NotificationsRepository {
  constructor(private readonly mongo: MongoService) {}

  get notifications(): Model<NotificationDocument> {
    const connection = this.mongo.getConnection()
    return (
      connection.models.Notification ??
      connection.model<NotificationDocument>("Notification", notificationSchema)
    )
  }

  get preferences(): Model<NotificationPreferencesDocument> {
    const connection = this.mongo.getConnection()
    return (
      connection.models.NotificationPreferences ??
      connection.model<NotificationPreferencesDocument>(
        "NotificationPreferences",
        notificationPreferencesSchema
      )
    )
  }
}
