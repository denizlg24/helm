import { Module } from "@nestjs/common"
import { UsageModule } from "../usage/usage.module"
import { LlmService } from "./llm.service"

@Module({
  imports: [UsageModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
