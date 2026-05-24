import { Module } from "@nestjs/common"
import { AuditModule } from "./audit/audit.module"
import { HelmAuthModule } from "./auth/helm-auth.module"
import { BillingModule } from "./billing/billing.module"
import { DatabaseModule } from "./database/database.module"
import { EntitlementModule } from "./entitlements/entitlement.module"
import { LlmModule } from "./llm/llm.module"
import { ModuleConfigModule } from "./module-configs/module-config.module"
import { OnboardingModule } from "./onboarding/onboarding.module"
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
    BillingModule,
    OnboardingModule,
  ],
})
export class AppModule {}
