import { z } from "zod"

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "member"])
export const AuthMethodSchema = z.enum(["session", "device", "api-key"])
export const WorkspaceStatusSchema = z.enum(["active", "suspended", "deleted"])

export const TenantSchema = z.object({
  id: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  createdByUserId: z.string().min(1),
  displayName: z.string().min(1),
  slug: z.string().min(1),
  theme: z.string().min(1),
  status: WorkspaceStatusSchema,
  onboardingCompletedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const ModuleConfigSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  moduleId: z.string().min(1),
  enabled: z.boolean(),
  settingsJson: z.record(z.string(), z.unknown()),
})

export const EntitlementSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  plan: z.enum(["starter", "pro", "enterprise"]),
  featuresJson: z.record(z.string(), z.unknown()),
  limitsJson: z.record(z.string(), z.unknown()),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable().optional(),
})

export const ApiScopeSchema = z
  .string()
  .regex(/^[a-z0-9-]+:[a-z0-9-]+$/u, "Expected resource:action scope")

export const DeviceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  clientId: z.string().min(1),
  name: z.string().min(1),
  platform: z.string().nullable().optional(),
  lastSeenAt: z.coerce.date().nullable().optional(),
  revokedAt: z.coerce.date().nullable().optional(),
})

export const AuditLogSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  actorUserId: z.string().nullable().optional(),
  actorType: z.enum(["user", "device", "api-key", "system"]),
  action: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().nullable().optional(),
  metadataJson: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
})

export const AuthContextSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  workspaceId: z.string().min(1),
  tenantId: z.string().min(1),
  role: WorkspaceRoleSchema,
  authMethod: AuthMethodSchema,
  scopes: z.array(ApiScopeSchema),
  enabledModules: z.array(z.string().min(1)),
  entitlements: z.record(z.string(), z.unknown()),
})

export const CurrentUserResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email().optional(),
    name: z.string().optional(),
  }),
  authContext: AuthContextSchema,
})

export const CurrentWorkspaceResponseSchema = z.object({
  workspace: WorkspaceSchema,
  role: WorkspaceRoleSchema,
  enabledModules: z.array(z.string().min(1)),
  entitlements: z.record(z.string(), z.unknown()),
})

export const CreateWorkspaceInputSchema = z.object({
  displayName: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/u),
  theme: z.string().min(1).default("sky"),
})

export const SetActiveWorkspaceInputSchema = z.object({
  workspaceId: z.string().min(1),
})

export const DeviceActivationStatusSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.string().min(1),
  verificationUriComplete: z.string().min(1).optional(),
  interval: z.number().int().positive(),
  expiresAt: z.coerce.date(),
  status: z.enum(["pending", "approved", "denied", "expired"]),
})

export const ApiTokenRateLimitSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxRequests: z.number().int().positive().optional(),
    timeWindowMs: z.number().int().positive().optional(),
  })
  .refine(
    (obj: { enabled?: boolean; maxRequests?: number; timeWindowMs?: number }) =>
      Object.values(obj).some((v) => v !== undefined),
    {
      message:
        "rateLimit must contain at least one of: enabled, maxRequests, timeWindowMs",
    }
  )

export const CreateApiTokenInputSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(ApiScopeSchema).min(1),
  expiresIn: z.number().int().positive().optional(),
  rateLimit: ApiTokenRateLimitSchema.optional(),
})

export const RevokeDeviceInputSchema = z.object({
  deviceId: z.string().min(1),
})

export const UpdateApiTokenInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    scopes: z.array(ApiScopeSchema).min(1).optional(),
    rateLimit: ApiTokenRateLimitSchema.optional(),
  })
  .refine(
    (input: {
      name?: string
      scopes?: string[]
      rateLimit?: z.infer<typeof ApiTokenRateLimitSchema>
    }) =>
      input.name !== undefined ||
      input.scopes !== undefined ||
      input.rateLimit !== undefined,
    {
      message: "At least one API token field must be provided",
    }
  )

export const WorkspaceLimitsSchema = z.object({
  llmCostUsdCentsPerMonth: z.number().int().nonnegative().optional(),
  rateLimitPerMinute: z.number().int().positive().optional(),
})

export const LlmUsageSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1).nullable().optional(),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
})

export const RecordLlmUsageInputSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  costUsdCents: z.number().nonnegative().default(0),
  userId: z.string().min(1).nullable().optional(),
})

export const UsageCreditEntryTypeSchema = z.enum([
  "grant",
  "debit",
  "adjustment",
])
export const UsageCreditSourceSchema = z.enum([
  "polar",
  "manual",
  "usage",
  "system",
])

export const GrantUsageCreditInputSchema = z.object({
  amountUsdCents: z.number().int().positive(),
  source: UsageCreditSourceSchema.default("manual"),
  sourceRef: z.string().min(1),
  note: z.string().max(500).optional(),
})

export const UsageSummarySchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  monthlyAllowanceUsdCents: z.number().int().nonnegative().nullable(),
  monthCostUsdCents: z.number().int().nonnegative(),
  monthRemainingAllowanceUsdCents: z.number().int().nonnegative().nullable(),
  creditBalanceUsdCents: z.number().int(),
  totalRemainingUsdCents: z.number().int().nullable(),
  requestCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})

// --- Billing (Polar) -------------------------------------------------------

export const PlanIdSchema = z.enum(["starter", "pro", "enterprise"])

export const SubscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid",
])

export const SubscriptionProductKindSchema = z.enum(["plan", "module"])

export const SubscriptionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  polarCustomerId: z.string().nullable().optional(),
  polarSubscriptionId: z.string().nullable().optional(),
  polarProductId: z.string().nullable().optional(),
  productKind: SubscriptionProductKindSchema,
  moduleId: z.string().nullable().optional(),
  plan: PlanIdSchema,
  status: SubscriptionStatusSchema,
  currentPeriodEnd: z.coerce.date().nullable().optional(),
  cancelAtPeriodEnd: z.boolean(),
})

export const PolarProductKindSchema = z.enum(["plan", "credits", "module"])

export const CheckoutInputSchema = z
  .object({
    productId: z.string().min(1).optional(),
    productIds: z.array(z.string().min(1)).min(1).max(24).optional(),
    // Optional success-page override (defaults to the configured console URL).
    successUrl: z.string().url().optional(),
  })
  .refine(
    (input) => input.productId !== undefined || input.productIds !== undefined,
    {
      message: "At least one product must be provided",
      path: ["productIds"],
    }
  )

export const CheckoutSessionResponseSchema = z.object({
  checkoutId: z.string().min(1),
  url: z.string().url(),
})

export const ActiveCheckoutSessionSchema = z.object({
  checkoutId: z.string().min(1),
  productId: z.string().min(1),
  url: z.string().url(),
  expiresAt: z.coerce.date(),
})

export const CustomerPortalResponseSchema = z.object({
  url: z.string().url(),
})

// One entry per Polar product available for purchase, resolved from product
// metadata. Lets the app render a pricing/module page and start checkout with
// the right productId — no product IDs hardcoded in the app.
export const BillingCatalogEntrySchema = z.object({
  productId: z.string().min(1),
  name: z.string(),
  kind: PolarProductKindSchema,
  // Set when kind = "plan".
  plan: PlanIdSchema.nullable().optional(),
  // Set when kind = "module".
  moduleId: z.string().nullable().optional(),
  priceUsdCents: z.number().int().nonnegative().nullable(),
  recurring: z.boolean(),
})

export const BillingCatalogResponseSchema = z.object({
  entries: z.array(BillingCatalogEntrySchema),
})

export const OnboardingSelectionSchema = z.object({
  plan: PlanIdSchema,
  moduleIds: z.array(z.string().min(1)),
})

export const BillingSummaryResponseSchema = z.object({
  plan: PlanIdSchema,
  subscriptions: z.array(SubscriptionSchema),
  enabledModuleIds: z.array(z.string()),
  activeCheckoutSessions: z.array(ActiveCheckoutSessionSchema),
  // Persisted onboarding selection (plan + paid modules the user intends to
  // buy), if one is open. Lets the onboarding/checkout surfaces restore the
  // session across reloads and devices. Null once onboarding completes.
  selection: OnboardingSelectionSchema.nullable(),
})

// --- Onboarding ------------------------------------------------------------

export const OnboardingRecommendationAnswerSchema = z.object({
  questionId: z.string().min(1).max(80),
  answer: z.string().min(1).max(1000),
})

export const OnboardingRecommendationInputSchema = z.object({
  answers: z.array(OnboardingRecommendationAnswerSchema).min(1).max(5),
  currentPlan: PlanIdSchema.optional(),
  currentModuleIds: z.array(z.string().min(1)).max(32).optional(),
})

// One conversational turn of the guided onboarding interview. The client posts
// the answers gathered so far; the server reacts to the latest answer and asks
// the next canonical question (or signals the interview is done).
export const OnboardingChatInputSchema = z.object({
  answers: z.array(OnboardingRecommendationAnswerSchema).max(5),
})

export const OnboardingChatResponseSchema = z.object({
  message: z.string().min(1).max(600),
  // Canonical id of the question this turn is asking; null when done.
  nextQuestionId: z.string().min(1).max(80).nullable(),
  // Total questions in the interview, so the client can show progress.
  totalQuestions: z.number().int().positive(),
  done: z.boolean(),
})

export const SetOnboardingSelectionInputSchema = z.object({
  plan: PlanIdSchema,
  moduleIds: z.array(z.string().min(1)).max(32),
})

export const OnboardingRecommendationResponseSchema = z.object({
  plan: PlanIdSchema,
  moduleIds: z.array(z.string().min(1)).max(24),
  summary: z.string().min(1).max(600),
  reasons: z.array(
    z.object({
      id: z.string().min(1).max(80),
      label: z.string().min(1).max(120),
      reason: z.string().min(1).max(240),
    })
  ),
})

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>
export type Tenant = z.infer<typeof TenantSchema>
export type Workspace = z.infer<typeof WorkspaceSchema>
export type ModuleConfig = z.infer<typeof ModuleConfigSchema>
export type Entitlement = z.infer<typeof EntitlementSchema>
export type ApiScope = z.infer<typeof ApiScopeSchema>
export type Device = z.infer<typeof DeviceSchema>
export type AuditLog = z.infer<typeof AuditLogSchema>
export type AuthContext = z.infer<typeof AuthContextSchema>
export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>
export type CurrentWorkspaceResponse = z.infer<
  typeof CurrentWorkspaceResponseSchema
>
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>
export type SetActiveWorkspaceInput = z.infer<
  typeof SetActiveWorkspaceInputSchema
>
export type DeviceActivationStatus = z.infer<
  typeof DeviceActivationStatusSchema
>
export type CreateApiTokenInput = z.infer<typeof CreateApiTokenInputSchema>
export type RevokeDeviceInput = z.infer<typeof RevokeDeviceInputSchema>
export type UpdateApiTokenInput = z.infer<typeof UpdateApiTokenInputSchema>
export type ApiTokenRateLimit = z.infer<typeof ApiTokenRateLimitSchema>
export type WorkspaceLimits = z.infer<typeof WorkspaceLimitsSchema>
export type LlmUsage = z.infer<typeof LlmUsageSchema>
export type RecordLlmUsageInput = z.infer<typeof RecordLlmUsageInputSchema>
export type UsageCreditEntryType = z.infer<typeof UsageCreditEntryTypeSchema>
export type UsageCreditSource = z.infer<typeof UsageCreditSourceSchema>
export type PlanId = z.infer<typeof PlanIdSchema>
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>
export type SubscriptionProductKind = z.infer<
  typeof SubscriptionProductKindSchema
>
export type Subscription = z.infer<typeof SubscriptionSchema>
export type PolarProductKind = z.infer<typeof PolarProductKindSchema>
export type BillingCatalogEntry = z.infer<typeof BillingCatalogEntrySchema>
export type BillingCatalogResponse = z.infer<
  typeof BillingCatalogResponseSchema
>
export type ActiveCheckoutSession = z.infer<typeof ActiveCheckoutSessionSchema>
export type CheckoutInput = z.infer<typeof CheckoutInputSchema>
export type CheckoutSessionResponse = z.infer<
  typeof CheckoutSessionResponseSchema
>
export type CustomerPortalResponse = z.infer<
  typeof CustomerPortalResponseSchema
>
export type BillingSummaryResponse = z.infer<
  typeof BillingSummaryResponseSchema
>
export type OnboardingRecommendationAnswer = z.infer<
  typeof OnboardingRecommendationAnswerSchema
>
export type OnboardingRecommendationInput = z.infer<
  typeof OnboardingRecommendationInputSchema
>
export type OnboardingRecommendationResponse = z.infer<
  typeof OnboardingRecommendationResponseSchema
>
export type OnboardingChatInput = z.infer<typeof OnboardingChatInputSchema>
export type OnboardingChatResponse = z.infer<
  typeof OnboardingChatResponseSchema
>
export type OnboardingSelection = z.infer<typeof OnboardingSelectionSchema>
export type SetOnboardingSelectionInput = z.infer<
  typeof SetOnboardingSelectionInputSchema
>
export type GrantUsageCreditInput = z.infer<typeof GrantUsageCreditInputSchema>
export type UsageSummary = z.infer<typeof UsageSummarySchema>
