import {
  type CreateNotificationInput,
  CreateNotificationInputSchema,
  type MarkAllNotificationsReadInput,
  MarkAllNotificationsReadInputSchema,
  MarkNotificationsReadInputSchema,
  NotificationDetailResponseSchema,
  NotificationListResponseSchema,
  NotificationPreferencesResponseSchema,
  type NotificationStreamEvent,
  NotificationStreamEventSchema,
  type NotificationsQuery,
  NotificationsQuerySchema,
  NotificationUnreadCountResponseSchema,
  type UpdateNotificationPreferencesInput,
  UpdateNotificationPreferencesInputSchema,
} from "@workspace/types"
import { z } from "zod"
import type { HelmApiRequestClient } from "../types"

const CountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
})

const addQuery = (path: string, query?: NotificationsQuery): string => {
  if (!query) return path
  const parsed = NotificationsQuerySchema.parse(query)
  const params = new URLSearchParams()
  params.set("status", parsed.status)
  if (parsed.category) params.set("category", parsed.category)
  if (parsed.cursor) params.set("cursor", parsed.cursor)
  params.set("limit", String(parsed.limit))
  const serialized = params.toString()
  return serialized ? `${path}?${serialized}` : path
}

const idPath = (base: string, id: string): string =>
  `${base}/${encodeURIComponent(id)}`

export const createNotificationsModule = ({
  request,
  jsonRequest,
  stream,
}: HelmApiRequestClient) => ({
  list: (query?: NotificationsQuery) =>
    request(addQuery("/api/notifications", query), {}, (value) =>
      NotificationListResponseSchema.parse(value)
    ),
  unreadCount: () =>
    request("/api/notifications/unread-count", {}, (value) =>
      NotificationUnreadCountResponseSchema.parse(value)
    ),
  create: (input: CreateNotificationInput) =>
    jsonRequest(
      "/api/notifications",
      CreateNotificationInputSchema.parse(input),
      (value) => NotificationDetailResponseSchema.parse(value)
    ),
  markRead: (ids: string[]) =>
    jsonRequest(
      "/api/notifications/read",
      MarkNotificationsReadInputSchema.parse({ ids }),
      (value) => CountResponseSchema.parse(value)
    ),
  markAllRead: (input?: MarkAllNotificationsReadInput) =>
    jsonRequest(
      "/api/notifications/read-all",
      MarkAllNotificationsReadInputSchema.parse(input ?? {}),
      (value) => CountResponseSchema.parse(value)
    ),
  archive: (id: string) =>
    jsonRequest(`${idPath("/api/notifications", id)}/archive`, {}, (value) =>
      NotificationDetailResponseSchema.parse(value)
    ),
  preferences: {
    get: () =>
      request("/api/notifications/preferences", {}, (value) =>
        NotificationPreferencesResponseSchema.parse(value)
      ),
    update: (input: UpdateNotificationPreferencesInput) =>
      request(
        "/api/notifications/preferences",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            UpdateNotificationPreferencesInputSchema.parse(input)
          ),
        },
        (value) => NotificationPreferencesResponseSchema.parse(value)
      ),
  },
  streamEvents: (
    signal?: AbortSignal
  ): AsyncGenerator<NotificationStreamEvent, void, unknown> =>
    stream(
      "/api/notifications/stream",
      {},
      (value) => NotificationStreamEventSchema.parse(value),
      signal
    ),
})

export type NotificationsModule = ReturnType<typeof createNotificationsModule>
