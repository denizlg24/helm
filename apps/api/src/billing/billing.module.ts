import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { EntitlementModule } from "../entitlements/entitlement.module"
import { ModuleConfigModule } from "../module-configs/module-config.module"
import { OnboardingModule } from "../onboarding/onboarding.module"
import { UsageModule } from "../usage/usage.module"
import { BillingController } from "./billing.controller"
import { BillingService } from "./billing.service"
import { PolarService } from "./polar.service"
import { PolarWebhookController } from "./polar-webhook.controller"
import { PolarWebhookService } from "./polar-webhook.service"

@Module({
  imports: [
    EntitlementModule,
    ModuleConfigModule,
    UsageModule,
    AuditModule,
    OnboardingModule,
  ],
  controllers: [BillingController, PolarWebhookController],
  providers: [PolarService, BillingService, PolarWebhookService],
  exports: [BillingService],
})
export class BillingModule {}
