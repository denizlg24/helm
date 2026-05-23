import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { EntitlementModule } from "../entitlements/entitlement.module"
import { WorkspaceController } from "./workspace.controller"
import { WorkspaceService } from "./workspace.service"

@Module({
  imports: [AuditModule, EntitlementModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
