import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import {
  type NotificationStreamEvent,
  NotificationStreamEventSchema,
} from "@workspace/types"
import type { Redis } from "ioredis"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { RedisService } from "../redis/redis.service"

type StreamEventHandler = (event: NotificationStreamEvent) => void

// Fans notification events out across API instances. A Polar webhook can land
// on a different instance than the one holding the user's SSE connection, so
// in-process dispatch is not enough.
@Injectable()
export class NotificationsEventsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsEventsService.name)
  private subscriber: Redis | null = null
  private readonly handlers = new Map<string, Set<StreamEventHandler>>()

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    const subscriber = this.redis.client.duplicate()
    subscriber.on("message", (channel: string, message: string) => {
      this.dispatch(channel, message)
    })
    subscriber.on("error", (error: Error) => {
      this.logger.error(`Redis subscriber error: ${error.message}`)
    })
    try {
      await subscriber.connect()
      this.subscriber = subscriber
    } catch (error) {
      this.logger.error(
        `Failed to connect Redis subscriber: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      throw error
    }
  }

  async onModuleDestroy() {
    await this.subscriber?.quit()
  }

  async publish(
    workspaceId: string,
    userId: string,
    event: NotificationStreamEvent
  ): Promise<void> {
    await this.redis.client.publish(
      this.channel(workspaceId, userId),
      JSON.stringify(event)
    )
  }

  subscribe(
    workspaceId: string,
    userId: string,
    handler: StreamEventHandler
  ): () => void {
    const channel = this.channel(workspaceId, userId)
    let channelHandlers = this.handlers.get(channel)
    if (!channelHandlers) {
      channelHandlers = new Set()
      this.handlers.set(channel, channelHandlers)
      // Subscribe asynchronously; on failure clean up the channel entry so
      // callers are not left believing they are subscribed.
      void (async () => {
        try {
          await this.subscriber?.subscribe(channel)
        } catch (error) {
          this.logger.error(
            `Failed to subscribe to ${channel}: ${error instanceof Error ? error.message : String(error)}`
          )
          this.handlers.delete(channel)
        }
      })()
    }
    channelHandlers.add(handler)

    return () => {
      const current = this.handlers.get(channel)
      if (!current) return
      current.delete(handler)
      if (current.size === 0) {
        // Await unsubscribe before removing the channel from handlers so local
        // state stays consistent with Redis; restore the handler set on failure.
        void (async () => {
          try {
            await this.subscriber?.unsubscribe(channel)
            this.handlers.delete(channel)
          } catch (error) {
            this.logger.error(
              `Failed to unsubscribe from ${channel}: ${error instanceof Error ? error.message : String(error)}`
            )
            // Leave handlers intact — local state must mirror Redis subscription.
          }
        })()
      }
    }
  }

  // ioredis keyPrefix does not apply to pub/sub channels, so the prefix from
  // the client options is included manually to keep the namespace consistent.
  private channel(workspaceId: string, userId: string): string {
    const prefix = this.redis.client.options.keyPrefix ?? ""
    return `${prefix}notify:${workspaceId}:${userId}`
  }

  private dispatch(channel: string, message: string) {
    const channelHandlers = this.handlers.get(channel)
    if (!channelHandlers || channelHandlers.size === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      this.logger.warn(`Dropped malformed notification event on ${channel}`)
      return
    }
    const event = NotificationStreamEventSchema.safeParse(parsed)
    if (!event.success) {
      this.logger.warn(`Dropped invalid notification event on ${channel}`)
      return
    }
    for (const handler of channelHandlers) {
      handler(event.data)
    }
  }
}
