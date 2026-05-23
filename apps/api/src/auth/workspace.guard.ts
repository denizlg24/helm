import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { Reflector } from "@nestjs/core"
import type { FastifyRequest } from "fastify"
import { AUTH_CONTEXT_KEY, IS_PUBLIC_KEY } from "./auth.constants"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AuthContextService } from "./auth-context.service"

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly authContextService: AuthContextService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Record<string, unknown>>()

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic || request.url.startsWith("/api/auth")) {
      return true
    }

    request[AUTH_CONTEXT_KEY] = await this.authContextService.build(request)
    return true
  }
}
