import { Module } from "@nestjs/common"
import { DiscoveryModule } from "@nestjs/core"
import { LlmModule } from "../llm/llm.module"
import { StorageModule } from "../storage/storage.module"
import { AssistantController } from "./assistant.controller"
import { AssistantRepository } from "./assistant.repository"
import { AssistantService } from "./assistant.service"
import { AssistantStreamService } from "./assistant-stream.service"
import { AssistantToolRegistry } from "./assistant-tool-registry.service"
import { CoreAssistantToolProvider } from "./core-assistant-tools"

@Module({
  imports: [DiscoveryModule, LlmModule, StorageModule],
  controllers: [AssistantController],
  providers: [
    AssistantRepository,
    AssistantService,
    AssistantStreamService,
    AssistantToolRegistry,
    CoreAssistantToolProvider,
  ],
})
export class AssistantModule {}
