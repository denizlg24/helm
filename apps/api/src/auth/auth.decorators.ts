import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from "@nestjs/common"
import type { AuthContext } from "@workspace/types"
import {
  AUDIT_SENSITIVE_KEY,
  AUTH_CONTEXT_KEY,
  AUTH_SESSION_KEY,
  IS_PUBLIC_KEY,
  REQUIRE_ENTITLEMENT_KEY,
  REQUIRE_MODULE_KEY,
  REQUIRE_SCOPES_KEY,
  REQUIRE_WORKSPACE_KEY,
} from "./auth.constants"

export interface AuthSessionContext {
  userId: string
  sessionId?: string
}

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
export const RequireWorkspace = () => SetMetadata(REQUIRE_WORKSPACE_KEY, true)
export const RequireModule = (moduleId: string) =>
  SetMetadata(REQUIRE_MODULE_KEY, moduleId)
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRE_SCOPES_KEY, scopes)
export const RequireEntitlement = (feature: string) =>
  SetMetadata(REQUIRE_ENTITLEMENT_KEY, feature)
export const AuditSensitive = (action: string) =>
  SetMetadata(AUDIT_SENSITIVE_KEY, action)

export const CurrentAuthContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext | undefined => {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>()
    return request[AUTH_CONTEXT_KEY] as AuthContext | undefined
  }
)

export const CurrentAuthSession = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext
  ): AuthSessionContext | undefined => {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>()
    return request[AUTH_SESSION_KEY] as AuthSessionContext | undefined
  }
)
