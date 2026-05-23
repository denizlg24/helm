import { Module } from "@nestjs/common"
import { AuditModule } from "./audit/audit.module"
import { HelmAuthModule } from "./auth/helm-auth.module"
import { DatabaseModule } from "./database/database.module"
import { EntitlementModule } from "./entitlements/entitlement.module"
import { LlmModule } from "./llm/llm.module"
import { ModuleConfigModule } from "./module-configs/module-config.module"
import { RedisModule } from "./redis/redis.module"
import { WorkspaceModule } from "./workspaces/workspace.module"

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    HelmAuthModule,
    WorkspaceModule,
    EntitlementModule,
    ModuleConfigModule,
    AuditModule,
    LlmModule,
  ],
})
export class AppModule {}
