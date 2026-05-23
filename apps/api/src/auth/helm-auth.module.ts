import { Module } from "@nestjs/common"
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core"
import { AuditInterceptor } from "../audit/audit.interceptor"
import { AuditModule } from "../audit/audit.module"
import { EntitlementModule } from "../entitlements/entitlement.module"
import { WorkspaceModule } from "../workspaces/workspace.module"
import { ApiTokenService } from "./api-token.service"
import { AuthContextService } from "./auth-context.service"
import { DeviceService } from "./device.service"
import { EntitlementGuard } from "./entitlement.guard"
import { HelmAuthController } from "./helm-auth.controller"
import { ModuleGuard } from "./module.guard"
import { ScopeGuard } from "./scope.guard"
import { WorkspaceGuard } from "./workspace.guard"

@Module({
  imports: [AuditModule, EntitlementModule, WorkspaceModule],
  controllers: [HelmAuthController],
  providers: [
    AuthContextService,
    ApiTokenService,
    DeviceService,
    { provide: APP_GUARD, useClass: WorkspaceGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
    { provide: APP_GUARD, useClass: EntitlementGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class HelmAuthModule {}
