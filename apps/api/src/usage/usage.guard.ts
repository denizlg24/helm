import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { Reflector } from "@nestjs/core"
import type { AuthContext } from "@workspace/types"
import { AUTH_CONTEXT_KEY } from "../auth/auth.constants"
import { REQUIRE_USAGE_BUDGET_KEY } from "./usage.constants"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { UsageService } from "./usage.service"

@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usageService: UsageService
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_USAGE_BUDGET_KEY,
      [context.getHandler(), context.getClass()]
    )
    if (!required) {
      return true
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>()
    const authContext = request[AUTH_CONTEXT_KEY] as AuthContext | undefined
    if (!authContext) {
      throw new UnauthorizedException("Authentication context required")
    }

    await this.usageService.assertWithinBudget(authContext.workspaceId)
    return true
  }
}
