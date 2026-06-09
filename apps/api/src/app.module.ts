import { Module } from "@nestjs/common"
import { AssistantModule } from "./assistant/assistant.module"
import { AuditModule } from "./audit/audit.module"
import { HelmAuthModule } from "./auth/helm-auth.module"
import { BillingModule } from "./billing/billing.module"
import { DatabaseModule } from "./database/database.module"
import { DesktopInstallerModule } from "./desktop-installer/desktop-installer.module"
import { EntitlementModule } from "./entitlements/entitlement.module"
import { LlmModule } from "./llm/llm.module"
import { ModuleConfigModule } from "./module-configs/module-config.module"
import { MongoModule } from "./mongo/mongo.module"
import { NotesModule } from "./notes/notes.module"
import { OnboardingModule } from "./onboarding/onboarding.module"
import { PomodoroModule } from "./pomodoro/pomodoro.module"
import { RedisModule } from "./redis/redis.module"
import { StorageModule } from "./storage/storage.module"
import { WorkspaceModule } from "./workspaces/workspace.module"

@Module({
  imports: [
    DatabaseModule,
    MongoModule,
    RedisModule,
    HelmAuthModule,
    WorkspaceModule,
    EntitlementModule,
    ModuleConfigModule,
    AuditModule,
    LlmModule,
    BillingModule,
    OnboardingModule,
    AssistantModule,
    NotesModule,
    PomodoroModule,
    StorageModule,
    DesktopInstallerModule,
  ],
})
export class AppModule {}
