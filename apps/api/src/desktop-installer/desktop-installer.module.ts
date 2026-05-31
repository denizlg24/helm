import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { DesktopInstallerController } from "./desktop-installer.controller"
import { DesktopInstallerService } from "./desktop-installer.service"

@Module({
  imports: [AuditModule],
  controllers: [DesktopInstallerController],
  providers: [DesktopInstallerService],
  exports: [DesktopInstallerService],
})
export class DesktopInstallerModule {}
