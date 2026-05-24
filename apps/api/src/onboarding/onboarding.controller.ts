import { Body, Controller, ForbiddenException, Post } from "@nestjs/common"
import {
  type AuthContext,
  type OnboardingChatInput,
  OnboardingChatInputSchema,
  type OnboardingRecommendationInput,
  OnboardingRecommendationInputSchema,
  type SetOnboardingSelectionInput,
  SetOnboardingSelectionInputSchema,
} from "@workspace/types"
import {
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
import { RateLimit } from "../rate-limit/rate-limit.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { WorkspaceService } from "../workspaces/workspace.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { OnboardingChatService } from "./onboarding-chat.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { OnboardingRecommendationService } from "./onboarding-recommendation.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { OnboardingSelectionService } from "./onboarding-selection.service"

@Controller("api/onboarding")
@RequireWorkspace()
export class OnboardingController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly recommendationService: OnboardingRecommendationService,
    private readonly chatService: OnboardingChatService,
    private readonly selectionService: OnboardingSelectionService
  ) {}

  @Post("chat")
  @RequireScopes("onboarding:write")
  @RateLimit({ max: 40, windowMs: 10 * 60 * 1000 })
  async chat(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: OnboardingChatInput
  ) {
    await this.assertOnboardingActive(authContext.workspaceId)
    const input = OnboardingChatInputSchema.parse(body)
    return this.chatService.chat(authContext, input)
  }

  @Post("recommend")
  @RequireScopes("onboarding:write")
  @RateLimit({ max: 20, windowMs: 10 * 60 * 1000 })
  async recommend(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: OnboardingRecommendationInput
  ) {
    await this.assertOnboardingActive(authContext.workspaceId)
    const input = OnboardingRecommendationInputSchema.parse(body)
    return this.recommendationService.recommend(authContext, input)
  }

  @Post("selection")
  @RequireScopes("onboarding:write")
  async setSelection(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: SetOnboardingSelectionInput
  ) {
    await this.assertOnboardingActive(authContext.workspaceId)
    const input = SetOnboardingSelectionInputSchema.parse(body)
    return this.selectionService.upsert(
      { workspaceId: authContext.workspaceId, tenantId: authContext.tenantId },
      input
    )
  }

  private async assertOnboardingActive(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceService.getWorkspace(workspaceId)
    if (workspace.onboardingCompletedAt) {
      throw new ForbiddenException("Onboarding is already complete")
    }
  }
}
