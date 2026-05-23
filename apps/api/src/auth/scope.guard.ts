import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { Reflector } from "@nestjs/core"
import type { AuthContext } from "@workspace/types"
import { AUTH_CONTEXT_KEY, REQUIRE_SCOPES_KEY } from "./auth.constants"

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredScopes =
      this.reflector.getAllAndOverride<string[]>(REQUIRE_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []

    if (requiredScopes.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>()
    const authContext = request[AUTH_CONTEXT_KEY] as AuthContext | undefined
    if (authContext?.authMethod !== "api-key") {
      return true
    }

    const missingScope = requiredScopes.find(
      (scope) => !authContext.scopes.includes(scope)
    )
    if (missingScope) {
      throw new ForbiddenException(`Missing API key scope: ${missingScope}`)
    }

    return true
  }
}
