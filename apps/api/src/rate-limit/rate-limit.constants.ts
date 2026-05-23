export const RATE_LIMIT_KEY = "helm:rateLimit"
export const SKIP_RATE_LIMIT_KEY = "helm:skipRateLimit"

export const DEFAULT_RATE_LIMIT_MAX = 120
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000

export const WORKSPACE_LIMIT_CACHE_TTL_SECONDS = 30

export interface RateLimitOptions {
  max: number
  windowMs: number
}
