import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { RedisService } from "../redis/redis.service"
import { WORKSPACE_LIMIT_CACHE_TTL_SECONDS } from "./rate-limit.constants"

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetMs: number
}

const toCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(
    identity: string,
    max: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - windowMs
    const redisKey = `ratelimit:${identity}`
    const member = `${now}-${Math.random().toString(36).slice(2)}`

    const results = await this.redis.client
      .multi()
      .zremrangebyscore(redisKey, 0, windowStart)
      .zadd(redisKey, now, member)
      .zcard(redisKey)
      .pexpire(redisKey, windowMs)
      .exec()

    if (!results || results.length < 3) {
      return {
        allowed: false,
        limit: max,
        remaining: 0,
        resetMs: windowMs,
      }
    }

    const zcardResult = results[2]
    if (zcardResult && zcardResult[0] instanceof Error) {
      return {
        allowed: false,
        limit: max,
        remaining: 0,
        resetMs: windowMs,
      }
    }

    const count = toCount(zcardResult?.[1])
    const allowed = count <= max

    if (!allowed) {
      await this.redis.client.zrem(redisKey, member)
      const oldest = await this.redis.client.zrange(
        redisKey,
        0,
        0,
        "WITHSCORES"
      )
      const oldestScore = oldest.length >= 2 ? toCount(oldest[1]) : now
      return {
        allowed: false,
        limit: max,
        remaining: 0,
        resetMs: Math.max(0, oldestScore + windowMs - now),
      }
    }

    return {
      allowed: true,
      limit: max,
      remaining: Math.max(0, max - count),
      resetMs: windowMs,
    }
  }

  async resolveWorkspaceLimitPerMinute(
    workspaceId: string,
    loader: () => Promise<number | undefined>
  ): Promise<number | undefined> {
    const cacheKey = `wslimit:${workspaceId}`
    const cached = await this.redis.client.get(cacheKey)
    if (cached !== null) {
      return cached === "" ? undefined : toCount(cached)
    }

    const value = await loader()
    await this.redis.client.set(
      cacheKey,
      value === undefined ? "" : String(value),
      "EX",
      WORKSPACE_LIMIT_CACHE_TTL_SECONDS
    )
    return value
  }
}
