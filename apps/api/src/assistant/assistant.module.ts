import { Module } from "@nestjs/common"
import { LlmModule } from "../llm/llm.module"
import { AssistantController } from "./assistant.controller"
import { AssistantRepository } from "./assistant.repository"
import { AssistantService } from "./assistant.service"
import { AssistantStreamService } from "./assistant-stream.service"

@Module({
  imports: [LlmModule],
  controllers: [AssistantController],
  providers: [AssistantRepository, AssistantService, AssistantStreamService],
})
export class AssistantModule {}
