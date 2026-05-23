import { Module } from "@nestjs/common"
import { AuditModule } from "./audit/audit.module"
import { HelmAuthModule } from "./auth/helm-auth.module"
import { DatabaseModule } from "./database/database.module"
import { EntitlementModule } from "./entitlements/entitlement.module"
import { ModuleConfigModule } from "./module-configs/module-config.module"
import { WorkspaceModule } from "./workspaces/workspace.module"

@Module({
  imports: [
    DatabaseModule,
    HelmAuthModule,
    WorkspaceModule,
    EntitlementModule,
    ModuleConfigModule,
    AuditModule,
  ],
})
export class AppModule {}
