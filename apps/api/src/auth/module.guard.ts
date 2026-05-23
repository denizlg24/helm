import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { Reflector } from "@nestjs/core"
import type { AuthContext } from "@workspace/types"
import { AUTH_CONTEXT_KEY, REQUIRE_MODULE_KEY } from "./auth.constants"

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const moduleId = this.reflector.getAllAndOverride<string>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()]
    )

    if (!moduleId) {
      return true
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>()
    const authContext = request[AUTH_CONTEXT_KEY] as AuthContext | undefined
    if (!authContext?.enabledModules.includes(moduleId)) {
      throw new ForbiddenException({
        code: "MODULE_DISABLED",
        message: `Module ${moduleId} is disabled`,
      })
    }

    return true
  }
}
