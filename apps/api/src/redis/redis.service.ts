import { Injectable, type OnModuleDestroy } from "@nestjs/common"
import { Redis } from "ioredis"
import { z } from "zod"

const RedisEnvSchema = z.object({
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  // Transparently prepended to every key by ioredis (keyPrefix).
  REDIS_KEY_PREFIX: z.string().default("helm:"),
})

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis

  constructor() {
    const env = RedisEnvSchema.parse(process.env)
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      keyPrefix: env.REDIS_KEY_PREFIX,
    })
  }

  async onModuleDestroy() {
    await this.client.quit()
  }
}
