import { Module } from "@nestjs/common"
import { LlmModule } from "../llm/llm.module"
import { WorkspaceModule } from "../workspaces/workspace.module"
import { OnboardingController } from "./onboarding.controller"
import { OnboardingChatService } from "./onboarding-chat.service"
import { OnboardingRecommendationService } from "./onboarding-recommendation.service"
import { OnboardingSelectionService } from "./onboarding-selection.service"

@Module({
  imports: [LlmModule, WorkspaceModule],
  controllers: [OnboardingController],
  providers: [
    OnboardingRecommendationService,
    OnboardingChatService,
    OnboardingSelectionService,
  ],
  exports: [OnboardingSelectionService],
})
export class OnboardingModule {}
