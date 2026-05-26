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
  userName: z.string().min(1).optional(),
  userEmail: z.string().email().optional(),
  sessionId: z.string().min(1).optional(),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1).optional(),
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
  // Server-owned example answers for the question. Rendered separately so the
  // client does not depend on the model remembering to include them.
  nextQuestionHelper: z.string().min(1).max(300).nullable().optional(),
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

// --- Assistant -------------------------------------------------------------

// Anthropic-only model catalog exposed in the model selector. `legacy` flags
// previous-generation models kept available behind a disclosure in the UI.
export const AssistantModelIdSchema = z.enum([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-6",
])

export const DEFAULT_ASSISTANT_MODEL_ID = "claude-opus-4-7" as const

export const AssistantModelInfoSchema = z.object({
  id: AssistantModelIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  legacy: z.boolean(),
})

// Persisted message content. App-level blocks (not raw Anthropic blocks) so the
// client stays decoupled from the SDK shape. Images are intentionally omitted
// for now — attachments ship in a later pass.
export const AssistantTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
})

export const AssistantToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
})

export const AssistantToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  toolUseId: z.string().min(1),
  content: z.string(),
  isError: z.boolean().optional(),
})

const AssistantWebSearchResultSchema = z.object({
  type: z.literal("web_search_result"),
  encrypted_content: z.string().min(1),
  title: z.string(),
  url: z.string().url(),
  page_age: z.string().nullable().optional(),
})

const AssistantWebSearchToolResultErrorSchema = z.object({
  type: z.literal("web_search_tool_result_error"),
  error_code: z.enum([
    "invalid_tool_input",
    "unavailable",
    "max_uses_exceeded",
    "too_many_requests",
    "query_too_long",
    "request_too_large",
  ]),
})

export const AssistantWebSearchToolResultBlockSchema = z.object({
  type: z.literal("web_search_tool_result"),
  toolUseId: z.string().min(1),
  content: z.union([
    z.array(AssistantWebSearchResultSchema),
    AssistantWebSearchToolResultErrorSchema,
  ]),
})

export const AssistantContentBlockSchema = z.discriminatedUnion("type", [
  AssistantTextBlockSchema,
  AssistantToolUseBlockSchema,
  AssistantToolResultBlockSchema,
  AssistantWebSearchToolResultBlockSchema,
])

export const AssistantMessageRoleSchema = z.enum(["user", "assistant"])

export const AssistantMessageStatusSchema = z.enum([
  "streaming",
  "complete",
  "pending_approval",
  "error",
])

export const AssistantTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsdCents: z.number().nonnegative(),
})

export const AssistantMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  workspaceId: z.string().min(1),
  role: AssistantMessageRoleSchema,
  blocks: z.array(AssistantContentBlockSchema),
  model: z.string().min(1).nullable().optional(),
  status: AssistantMessageStatusSchema,
  error: z.string().nullable().optional(),
  usage: AssistantTokenUsageSchema.nullable().optional(),
  createdAt: z.coerce.date(),
})

// Set on a conversation while it waits for the user to approve/deny a high-risk
// tool the model requested. The turn is suspended until the decision arrives.
export const AssistantPendingApprovalSchema = z.object({
  messageId: z.string().min(1),
  toolUseId: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
})

export const AssistantConversationSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  title: z.string(),
  model: AssistantModelIdSchema,
  webSearchEnabled: z.boolean(),
  toolsEnabled: z.boolean(),
  pendingApproval: AssistantPendingApprovalSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  lastMessageAt: z.coerce.date(),
})

export const AssistantConversationSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  model: AssistantModelIdSchema,
  hasPendingApproval: z.boolean(),
  lastMessageAt: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export const AssistantConversationListSchema = z.object({
  conversations: z.array(AssistantConversationSummarySchema),
})

export const RenameAssistantConversationInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
})

export const AssistantConversationDetailSchema = z.object({
  conversation: AssistantConversationSchema,
  messages: z.array(AssistantMessageSchema),
})

export const StartAssistantChatInputSchema = z.object({
  // Null/omitted starts a new conversation; the server returns its id in the
  // first `conversation` stream event.
  conversationId: z.string().min(1).nullable().optional(),
  content: z.string().min(1).max(32_000),
  model: AssistantModelIdSchema.default(DEFAULT_ASSISTANT_MODEL_ID),
  webSearch: z.boolean().default(false),
  tools: z.boolean().default(true),
})

export const ApproveAssistantToolInputSchema = z.object({
  toolUseId: z.string().min(1),
  decision: z.enum(["approve", "deny"]),
})

// Wire protocol for the SSE stream. The client reduces these into message state.
export const AssistantStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("conversation"),
    conversationId: z.string().min(1),
    title: z.string(),
  }),
  z.object({
    type: z.literal("message_start"),
    messageId: z.string().min(1),
    role: AssistantMessageRoleSchema,
  }),
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({
    type: z.literal("tool_use"),
    toolUseId: z.string().min(1),
    name: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("tool_result"),
    toolUseId: z.string().min(1),
    content: z.string(),
    isError: z.boolean(),
  }),
  z.object({
    type: z.literal("tool_approval_required"),
    toolUseId: z.string().min(1),
    name: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("usage"),
    messageId: z.string().min(1).optional(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsdCents: z.number().nonnegative(),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("done"), stopReason: z.string().nullable() }),
])

export type AssistantModelId = z.infer<typeof AssistantModelIdSchema>
export type AssistantModelInfo = z.infer<typeof AssistantModelInfoSchema>

// Curated catalog rendered by the model selector; shared by API validation and
// the client UI so the two never drift.
export const ASSISTANT_MODELS = [
  {
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    description: "Most capable. Best for complex reasoning and tool use.",
    legacy: false,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "Balanced speed and capability for everyday work.",
    legacy: false,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    description: "Fastest and most economical.",
    legacy: false,
  },
  {
    id: "claude-opus-4-6",
    label: "Opus 4.6",
    description: "Previous-generation Opus, kept for continuity.",
    legacy: true,
  },
] as const satisfies readonly AssistantModelInfo[]

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
export type AssistantTextBlock = z.infer<typeof AssistantTextBlockSchema>
export type AssistantToolUseBlock = z.infer<typeof AssistantToolUseBlockSchema>
export type AssistantToolResultBlock = z.infer<
  typeof AssistantToolResultBlockSchema
>
export type AssistantWebSearchToolResultBlock = z.infer<
  typeof AssistantWebSearchToolResultBlockSchema
>
export type AssistantContentBlock = z.infer<typeof AssistantContentBlockSchema>
export type AssistantMessageRole = z.infer<typeof AssistantMessageRoleSchema>
export type AssistantMessageStatus = z.infer<
  typeof AssistantMessageStatusSchema
>
export type AssistantTokenUsage = z.infer<typeof AssistantTokenUsageSchema>
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>
export type AssistantPendingApproval = z.infer<
  typeof AssistantPendingApprovalSchema
>
export type AssistantConversation = z.infer<typeof AssistantConversationSchema>
export type AssistantConversationSummary = z.infer<
  typeof AssistantConversationSummarySchema
>
export type AssistantConversationList = z.infer<
  typeof AssistantConversationListSchema
>
export type RenameAssistantConversationInput = z.infer<
  typeof RenameAssistantConversationInputSchema
>
export type AssistantConversationDetail = z.infer<
  typeof AssistantConversationDetailSchema
>
export type StartAssistantChatInput = z.infer<
  typeof StartAssistantChatInputSchema
>
export type ApproveAssistantToolInput = z.infer<
  typeof ApproveAssistantToolInputSchema
>
export type AssistantStreamEvent = z.infer<typeof AssistantStreamEventSchema>

// --- Files / storage -------------------------------------------------------

// A content-addressed blob. One per unique (workspaceId, sha256). `backendId`
// is the opaque identifier the active storage adapter uses to fetch/delete the
// bytes (for the deniz-cloud adapter this is the remote file UUID). `refCount`
// tracks how many FileRefs point at it; the blob and its backing bytes are
// purged when it reaches zero.
export const FileBlobSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  tenantId: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u, "Expected lowercase SHA-256 hex"),
  backendId: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  refCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// A logical reference to a blob, owned by a workspace. This is the handle
// callers receive and store. Optional `ownerModule`/`linkedEntityId` let a
// module tag the file with what it belongs to (e.g. a note attachment).
export const FileRefSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  tenantId: z.string().min(1),
  blobId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  ownerModule: z.string().min(1).max(64).nullable(),
  linkedEntityId: z.string().min(1).max(128).nullable(),
  createdAt: z.coerce.date(),
})

// Optional metadata sent alongside the multipart file part on upload. The file
// itself is a binary part, not part of this schema.
export const UploadFileMetadataSchema = z.object({
  ownerModule: z.string().min(1).max(64).optional(),
  linkedEntityId: z.string().min(1).max(128).optional(),
})

export type FileBlob = z.infer<typeof FileBlobSchema>
export type FileRef = z.infer<typeof FileRefSchema>
export type UploadFileMetadata = z.infer<typeof UploadFileMetadataSchema>
