import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { Reflector } from "@nestjs/core"
import type { AuthContext } from "@workspace/types"
import { from, type Observable, switchMap } from "rxjs"
import { AUDIT_SENSITIVE_KEY, AUTH_CONTEXT_KEY } from "../auth/auth.constants"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AuditService } from "./audit.service"

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string>(
      AUDIT_SENSITIVE_KEY,
      [context.getHandler(), context.getClass()]
    )

    return next.handle().pipe(
      switchMap((value) =>
        from(
          (async () => {
            if (!action) {
              return value
            }
            const request = context
              .switchToHttp()
              .getRequest<Record<string, unknown>>()
            const authContext = request[AUTH_CONTEXT_KEY] as
              | AuthContext
              | undefined
            if (!authContext) {
              return value
            }
            await this.auditService.write(authContext, {
              action,
              resourceType: "route",
              metadataJson: { path: request.url },
            })
            return value
          })()
        )
      )
    )
  }
}
