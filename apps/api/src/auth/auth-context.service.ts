import { Injectable, UnauthorizedException } from "@nestjs/common"
import { HELM_API_KEY_HEADER } from "@workspace/auth/constants"
import { auth } from "@workspace/auth/server"
import type { AuthContext } from "@workspace/types"
import type { FastifyRequest } from "fastify"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { WorkspaceService } from "../workspaces/workspace.service"

const headersFromRequest = (request: FastifyRequest) => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(","))
    } else if (value !== undefined) {
      headers.set(key, String(value))
    }
  }
  return headers
}

const permissionsToScopes = (permissions: unknown): string[] => {
  let parsed: unknown = permissions
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }
  if (!parsed || typeof parsed !== "object") {
    return []
  }

  const scopes: string[] = []
  for (const [resource, actions] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if (!Array.isArray(actions)) {
      continue
    }
    for (const action of actions) {
      if (typeof action === "string") {
        scopes.push(`${resource}:${action}`)
      }
    }
  }
  return scopes
}

@Injectable()
export class AuthContextService {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async buildSession(request: FastifyRequest) {
    const headers = headersFromRequest(request)
    const session = await auth.api.getSession({ headers })

    if (!session) {
      throw new UnauthorizedException("Missing or invalid session")
    }

    return {
      userId: session.user.id,
      sessionId: session.session.id,
      activeWorkspaceId: session.session.activeOrganizationId ?? undefined,
    }
  }

  async build(request: FastifyRequest): Promise<AuthContext> {
    const session = await this.buildSession(request)
    const workspaceId =
      request.headers["x-helm-workspace-id"]?.toString() ??
      session.activeWorkspaceId ??
      undefined

    const apiKeyHeader = request.headers[HELM_API_KEY_HEADER]
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader

    const authMethod = apiKey
      ? "api-key"
      : request.headers.authorization?.toString().startsWith("Bearer ")
        ? "device"
        : "session"

    const scopes =
      authMethod === "api-key" && apiKey
        ? await this.resolveApiKeyScopes(apiKey)
        : []

    return this.workspaceService.resolveAuthContext({
      userId: session.userId,
      sessionId: session.sessionId,
      workspaceId,
      authMethod,
      scopes,
    })
  }

  private async resolveApiKeyScopes(key: string): Promise<string[]> {
    try {
      const result = await auth.api.verifyApiKey({ body: { key } })
      return permissionsToScopes(result.key?.permissions)
    } catch {
      return []
    }
  }
}
