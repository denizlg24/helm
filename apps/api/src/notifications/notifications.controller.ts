import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common"
import {
  type AuthContext,
  CreateNotificationInputSchema,
  MarkAllNotificationsReadInputSchema,
  MarkNotificationsReadInputSchema,
  type NotificationStreamEvent,
  NotificationsQuerySchema,
  UpdateNotificationPreferencesInputSchema,
} from "@workspace/types"
import type { FastifyReply } from "fastify"
import { z } from "zod"
import {
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
import { RateLimit } from "../rate-limit/rate-limit.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { NotificationsService } from "./notifications.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { NotificationsEventsService } from "./notifications-events.service"

const IdParamSchema = z.string().min(1)

const HEARTBEAT_INTERVAL_MS = 25_000

// Core infrastructure: no @RequireModule — billing and system notifications
// must reach the user regardless of module configuration.
@Controller("api/notifications")
@RequireWorkspace()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly events: NotificationsEventsService
  ) {}

  @Get()
  @RequireScopes("notifications:read")
  async list(
    @CurrentAuthContext() actor: AuthContext,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.notifications.list(actor, NotificationsQuerySchema.parse(query))
  }

  @Get("unread-count")
  @RequireScopes("notifications:read")
  async unreadCount(@CurrentAuthContext() actor: AuthContext) {
    return this.notifications.unreadCount(actor)
  }

  @Post()
  @RequireScopes("notifications:write")
  @RateLimit({ max: 240, windowMs: 10 * 60 * 1000 })
  async create(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.notifications.createFromClient(
      actor,
      CreateNotificationInputSchema.parse(body)
    )
  }

  @Post("read")
  @RequireScopes("notifications:write")
  async markRead(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.notifications.markRead(
      actor,
      MarkNotificationsReadInputSchema.parse(body)
    )
  }

  @Post("read-all")
  @RequireScopes("notifications:write")
  async markAllRead(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.notifications.markAllRead(
      actor,
      MarkAllNotificationsReadInputSchema.parse(body ?? {})
    )
  }

  @Post(":id/archive")
  @RequireScopes("notifications:write")
  async archive(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string
  ) {
    return this.notifications.archive(actor, IdParamSchema.parse(id))
  }

  @Get("preferences")
  @RequireScopes("notifications:read")
  async getPreferences(@CurrentAuthContext() actor: AuthContext) {
    return this.notifications.getPreferences(actor)
  }

  @Put("preferences")
  @RequireScopes("notifications:write")
  async updatePreferences(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.notifications.updatePreferences(
      actor,
      UpdateNotificationPreferencesInputSchema.parse(body)
    )
  }

  @Post("stream")
  @RequireScopes("notifications:read")
  @RateLimit({ max: 120, windowMs: 10 * 60 * 1000 })
  async stream(
    @CurrentAuthContext() actor: AuthContext,
    @Res() reply: FastifyReply
  ) {
    const emit = this.openStream(reply)
    let unsubscribe: (() => void) | null = null
    let heartbeat: NodeJS.Timeout | null = null

    try {
      unsubscribe = this.events.subscribe(
        actor.workspaceId,
        actor.userId,
        (event) => {
          try {
            emit.send(event)
          } catch (error) {
            // Serialization or send failure — log but do not throw.
            reply.log?.error?.({
              error,
              msg: "Failed to send notification event to stream",
            })
          }
        }
      )
      heartbeat = setInterval(() => emit.ping(), HEARTBEAT_INTERVAL_MS)
      reply.raw.on("close", () => {
        if (heartbeat) clearInterval(heartbeat)
        if (unsubscribe) unsubscribe()
      })
    } catch (error) {
      if (heartbeat) clearInterval(heartbeat)
      if (unsubscribe) unsubscribe()
      reply.log?.error?.({
        error,
        msg: "Failed to establish notification stream subscription",
      })
      if (!reply.raw.headersSent) {
        reply.status(500).send({ error: "Failed to open notification stream" })
      } else {
        reply.raw.end()
      }
    }
  }

  // Opens an SSE response on the raw socket. Merges headers already set by the
  // Fastify CORS plugin (bypassed by writing to reply.raw directly) and hijacks
  // the reply so Fastify does not also try to send a body.
  private openStream(reply: FastifyReply): {
    send: (event: NotificationStreamEvent) => void
    ping: () => void
  } {
    reply.hijack()
    for (const [key, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(key, value)
    }
    reply.raw.setHeader("content-type", "text/event-stream")
    reply.raw.setHeader("cache-control", "no-cache, no-transform")
    reply.raw.setHeader("connection", "keep-alive")
    reply.raw.setHeader("x-accel-buffering", "no")
    reply.raw.writeHead(200)

    let closed = false
    reply.raw.on("close", () => {
      closed = true
    })

    return {
      send: (event: NotificationStreamEvent) => {
        if (closed || reply.raw.writableEnded) return
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      },
      ping: () => {
        if (closed || reply.raw.writableEnded) return
        reply.raw.write(": ping\n\n")
      },
    }
  }
}
