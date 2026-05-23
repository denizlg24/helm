import { SetMetadata } from "@nestjs/common"
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
  SKIP_RATE_LIMIT_KEY,
} from "./rate-limit.constants"

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options)

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true)
