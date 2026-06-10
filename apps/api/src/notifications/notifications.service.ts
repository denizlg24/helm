import { Injectable, NotFoundException } from "@nestjs/common"
import type {
  AuthContext,
  CreateNotificationInput,
  MarkAllNotificationsReadInput,
  MarkNotificationsReadInput,
  Notification,
  NotificationAction,
  NotificationCategory,
  NotificationDetailResponse,
  NotificationListResponse,
  NotificationPreferences,
  NotificationPreferencesResponse,
  NotificationSeverity,
  NotificationSource,
  NotificationsQuery,
  NotificationUnreadCountResponse,
  UpdateNotificationPreferencesInput,
} from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import {
  type NotificationDocument,
  NotificationsRepository,
} from "./notifications.repository"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { NotificationsEventsService } from "./notifications-events.service"

export interface NotificationTarget {
  tenantId: string
  workspaceId: string
  userId: string
}

export interface EmitNotificationInput {
  category: NotificationCategory
  severity?: NotificationSeverity
  title: string
  body?: string | null
  actions?: NotificationAction[]
  dedupeKey?: string
}

// Low-value categories expire automatically; durable ones (billing, system)
// stay until archived.
const CATEGORY_TTL_MS: Partial<Record<NotificationCategory, number>> = {
  pomodoro: 7 * 24 * 60 * 60 * 1000,
}

const mapNotification = (doc: NotificationDocument): Notification => ({
  id: doc.id,
  tenantId: doc.tenantId,
  workspaceId: doc.workspaceId,
  userId: doc.userId,
  category: doc.category,
  severity: doc.severity,
  title: doc.title,
  body: doc.body,
  actions: doc.actions,
  source: doc.source,
  dedupeKey: doc.dedupeKey,
  readAt: doc.readAt,
  archivedAt: doc.archivedAt,
  expiresAt: doc.expiresAt,
  createdAt: doc.createdAt,
})

const encodeCursor = (doc: NotificationDocument): string =>
  Buffer.from(`${doc.createdAt.toISOString()}|${doc.id}`).toString("base64url")

const decodeCursor = (
  cursor: string
): { createdAt: Date; id: string } | null => {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8")
  const separator = decoded.lastIndexOf("|")
  if (separator === -1) return null
  const createdAt = new Date(decoded.slice(0, separator))
  const id = decoded.slice(separator + 1)
  if (Number.isNaN(createdAt.getTime()) || id.length === 0) return null
  return { createdAt, id }
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly events: NotificationsEventsService
  ) {}

  async emit(
    target: NotificationTarget,
    input: EmitNotificationInput,
    source: NotificationSource = "server"
  ): Promise<Notification | null> {
    const preferences = await this.loadPreferences(target)
    const muted = preferences.mutedCategories.includes(input.category)
    const now = new Date()
    const ttlMs = CATEGORY_TTL_MS[input.category]

    const fields = {
      tenantId: target.tenantId,
      workspaceId: target.workspaceId,
      userId: target.userId,
      category: input.category,
      severity: input.severity ?? "info",
      title: input.title,
      body: input.body ?? null,
      actions: input.actions ?? [],
      source,
      dedupeKey: input.dedupeKey ?? null,
      // Muted notifications are persisted pre-read so history survives without
      // producing a badge, toast, or live event.
      readAt: muted ? now : null,
      archivedAt: null,
      expiresAt: ttlMs ? new Date(now.getTime() + ttlMs) : null,
    }

    let doc: NotificationDocument | null
    if (input.dedupeKey) {
      const result = await this.repository.notifications.updateOne(
        {
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
          userId: target.userId,
          dedupeKey: input.dedupeKey,
        },
        { $setOnInsert: { ...fields, id: crypto.randomUUID() } },
        { upsert: true }
      )
      if (result.upsertedCount === 0) {
        // Idempotent re-emit (e.g. webhook redelivery) — nothing new to publish.
        return null
      }
      doc = await this.repository.notifications
        .findOne({
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
          userId: target.userId,
          dedupeKey: input.dedupeKey,
        })
        .lean<NotificationDocument>()
        .exec()
    } else {
      const created = await this.repository.notifications.create(fields)
      doc = created.toObject<NotificationDocument>()
    }

    if (!doc) return null
    const notification = mapNotification(doc)
    if (!muted) {
      await this.events.publish(target.workspaceId, target.userId, {
        type: "created",
        notification,
      })
    }
    return notification
  }

  async createFromClient(
    actor: AuthContext,
    input: CreateNotificationInput
  ): Promise<NotificationDetailResponse> {
    const notification = await this.emit(
      this.target(actor),
      {
        category: input.category,
        severity: input.severity,
        title: input.title,
        body: input.body,
        actions: input.actions,
        dedupeKey: input.dedupeKey,
      },
      "client"
    )
    if (notification) return { notification }

    // Dedupe collision — the notification already exists; return it unchanged.
    const existing = await this.repository.notifications
      .findOne({ ...this.target(actor), dedupeKey: input.dedupeKey })
      .lean<NotificationDocument>()
      .exec()
    if (!existing) {
      throw new NotFoundException("Notification not found")
    }
    return { notification: mapNotification(existing) }
  }

  async list(
    actor: AuthContext,
    query: NotificationsQuery
  ): Promise<NotificationListResponse> {
    const filter: Record<string, unknown> = {
      ...this.target(actor),
      archivedAt: null,
    }
    if (query.status === "unread") filter.readAt = null
    if (query.category) filter.category = query.category
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor)
      if (cursor) {
        filter.$or = [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { $lt: cursor.id } },
        ]
      }
    }

    const docs = await this.repository.notifications
      .find(filter)
      .sort({ createdAt: -1, id: -1 })
      .limit(query.limit + 1)
      .lean<NotificationDocument[]>()
      .exec()

    const page = docs.slice(0, query.limit)
    const last = page.at(-1)
    return {
      items: page.map(mapNotification),
      nextCursor: docs.length > query.limit && last ? encodeCursor(last) : null,
    }
  }

  async unreadCount(
    actor: AuthContext
  ): Promise<NotificationUnreadCountResponse> {
    const count = await this.repository.notifications.countDocuments({
      ...this.target(actor),
      readAt: null,
      archivedAt: null,
    })
    return { count }
  }

  async markRead(
    actor: AuthContext,
    input: MarkNotificationsReadInput
  ): Promise<{ count: number }> {
    const target = this.target(actor)
    const docs = await this.repository.notifications
      .find({ ...target, id: { $in: input.ids }, readAt: null })
      .lean<NotificationDocument[]>()
      .exec()
    if (docs.length === 0) return { count: 0 }

    const now = new Date()
    await this.repository.notifications.updateMany(
      { ...target, id: { $in: docs.map((doc) => doc.id) } },
      { $set: { readAt: now } }
    )
    for (const doc of docs) {
      await this.events.publish(target.workspaceId, target.userId, {
        type: "updated",
        notification: { ...mapNotification(doc), readAt: now },
      })
    }
    return { count: docs.length }
  }

  async markAllRead(
    actor: AuthContext,
    input: MarkAllNotificationsReadInput
  ): Promise<{ count: number }> {
    const target = this.target(actor)
    const filter: Record<string, unknown> = {
      ...target,
      readAt: null,
      archivedAt: null,
    }
    if (input.category) filter.category = input.category
    const result = await this.repository.notifications.updateMany(filter, {
      $set: { readAt: new Date() },
    })
    await this.events.publish(target.workspaceId, target.userId, {
      type: "read-all",
      category: input.category ?? null,
    })
    return { count: result.modifiedCount }
  }

  async archive(
    actor: AuthContext,
    id: string
  ): Promise<NotificationDetailResponse> {
    const target = this.target(actor)
    const doc = await this.repository.notifications
      .findOne({ ...target, id, archivedAt: null })
      .lean<NotificationDocument>()
      .exec()
    if (!doc) {
      throw new NotFoundException("Notification not found")
    }
    const now = new Date()
    const readAt = doc.readAt ?? now
    await this.repository.notifications.updateOne(
      { ...target, id },
      { $set: { archivedAt: now, readAt } }
    )
    const notification = { ...mapNotification(doc), archivedAt: now, readAt }
    await this.events.publish(target.workspaceId, target.userId, {
      type: "updated",
      notification,
    })
    return { notification }
  }

  async getPreferences(
    actor: AuthContext
  ): Promise<NotificationPreferencesResponse> {
    return { preferences: await this.loadPreferences(this.target(actor)) }
  }

  async updatePreferences(
    actor: AuthContext,
    input: UpdateNotificationPreferencesInput
  ): Promise<NotificationPreferencesResponse> {
    const target = this.target(actor)
    await this.repository.preferences.updateOne(
      target,
      { $set: { mutedCategories: input.mutedCategories } },
      { upsert: true }
    )
    return { preferences: { mutedCategories: input.mutedCategories } }
  }

  private async loadPreferences(
    target: NotificationTarget
  ): Promise<NotificationPreferences> {
    const doc = await this.repository.preferences
      .findOne(target)
      .lean<{ mutedCategories: NotificationCategory[] } | null>()
      .exec()
    return { mutedCategories: doc?.mutedCategories ?? [] }
  }

  private target(actor: AuthContext): NotificationTarget {
    return {
      tenantId: actor.tenantId,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
    }
  }
}
