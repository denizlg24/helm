import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { Reflector } from "@nestjs/core"
import type { AuthContext } from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { EntitlementService } from "../entitlements/entitlement.service"
import { AUTH_CONTEXT_KEY, REQUIRE_ENTITLEMENT_KEY } from "./auth.constants"

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementService: EntitlementService
  ) {}

  async canActivate(context: ExecutionContext) {
    const feature = this.reflector.getAllAndOverride<string>(
      REQUIRE_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()]
    )

    if (!feature) {
      return true
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>()
    const authContext = request[AUTH_CONTEXT_KEY] as AuthContext | undefined
    if (!authContext) {
      throw new UnauthorizedException("Authentication context required")
    }

    const allowed = await this.entitlementService.hasFeature(
      authContext.workspaceId,
      feature
    )
    if (!allowed) {
      throw new ForbiddenException({
        code: "ENTITLEMENT_REQUIRED",
        message: `Entitlement required for ${feature}`,
      })
    }

    return true
  }
}
