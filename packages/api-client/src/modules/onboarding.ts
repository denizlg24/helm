import {
  type OnboardingChatInput,
  OnboardingChatInputSchema,
  OnboardingChatResponseSchema,
  type OnboardingRecommendationInput,
  OnboardingRecommendationInputSchema,
  OnboardingRecommendationResponseSchema,
  OnboardingSelectionSchema,
  type SetOnboardingSelectionInput,
  SetOnboardingSelectionInputSchema,
} from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createOnboardingModule = ({
  jsonRequest,
}: HelmApiRequestClient) => ({
  chat: (input: OnboardingChatInput) =>
    jsonRequest(
      "/api/onboarding/chat",
      OnboardingChatInputSchema.parse(input),
      (value) => OnboardingChatResponseSchema.parse(value)
    ),
  recommend: (input: OnboardingRecommendationInput) =>
    jsonRequest(
      "/api/onboarding/recommend",
      OnboardingRecommendationInputSchema.parse(input),
      (value) => OnboardingRecommendationResponseSchema.parse(value)
    ),
  setSelection: (input: SetOnboardingSelectionInput) =>
    jsonRequest(
      "/api/onboarding/selection",
      SetOnboardingSelectionInputSchema.parse(input),
      (value) => OnboardingSelectionSchema.parse(value)
    ),
})

export type OnboardingModule = ReturnType<typeof createOnboardingModule>
