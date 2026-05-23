import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { Reflector } from "@nestjs/core"
import type { AuthContext } from "@workspace/types"
import { AUTH_CONTEXT_KEY } from "../auth/auth.constants"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { EntitlementService } from "../entitlements/entitlement.service"
import {
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_KEY,
  type RateLimitOptions,
  SKIP_RATE_LIMIT_KEY,
} from "./rate-limit.constants"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { RateLimitService } from "./rate-limit.service"

interface ResponseWithHeader {
  header: (name: string, value: string | number) => unknown
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly entitlementService: EntitlementService
  ) {}

  async canActivate(context: ExecutionContext) {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()]
    )
    if (skip) {
      return true
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>()
    const authContext = request[AUTH_CONTEXT_KEY] as AuthContext | undefined

    if (!authContext) {
      return true
    }

    const override = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()]
    )

    const windowMs = override?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS
    const max =
      override?.max ??
      (await this.rateLimitService.resolveWorkspaceLimitPerMinute(
        authContext.workspaceId,
        () =>
          this.entitlementService
            .getWorkspaceLimits(authContext.workspaceId)
            .then((limits) => limits.rateLimitPerMinute)
      )) ??
      DEFAULT_RATE_LIMIT_MAX

    const identity = `${authContext.workspaceId}:${authContext.userId}`
    const result = await this.rateLimitService.consume(identity, max, windowMs)

    const response = context.switchToHttp().getResponse<ResponseWithHeader>()
    response.header("X-RateLimit-Limit", result.limit)
    response.header("X-RateLimit-Remaining", result.remaining)
    response.header(
      "X-RateLimit-Reset",
      Math.ceil((Date.now() + result.resetMs) / 1000)
    )

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil(result.resetMs / 1000)
      response.header("Retry-After", retryAfterSeconds)
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded",
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS
      )
    }

    return true
  }
}
