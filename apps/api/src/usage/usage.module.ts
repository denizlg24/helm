import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { EntitlementModule } from "../entitlements/entitlement.module"
import { UsageController } from "./usage.controller"
import { UsageService } from "./usage.service"

@Module({
  imports: [EntitlementModule, AuditModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
