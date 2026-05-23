import { Module } from "@nestjs/common"
import { ModuleConfigService } from "./module-config.service"

@Module({
  providers: [ModuleConfigService],
  exports: [ModuleConfigService],
})
export class ModuleConfigModule {}
