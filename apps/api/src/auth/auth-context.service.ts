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

@Injectable()
export class AuthContextService {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async build(request: FastifyRequest): Promise<AuthContext> {
    const headers = headersFromRequest(request)
    const session = await auth.api.getSession({ headers })

    if (!session) {
      throw new UnauthorizedException("Missing or invalid session")
    }

    const workspaceId =
      request.headers["x-helm-workspace-id"]?.toString() ??
      session.session.activeOrganizationId ??
      undefined

    const authMethod = request.headers[HELM_API_KEY_HEADER]
      ? "api-key"
      : request.headers.authorization?.toString().startsWith("Bearer ")
        ? "device"
        : "session"

    return this.workspaceService.resolveAuthContext({
      userId: session.user.id,
      sessionId: session.session.id,
      workspaceId,
      authMethod,
    })
  }
}
