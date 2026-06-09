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

// --- User settings -----------------------------------------------------------
// Per-user UI preferences synced across web + desktop. Distinct from
// ModuleConfig (workspace-level admin config); these are the signed-in user's
// own preferences. Device-local settings (e.g. a desktop save directory) live
// on the device and are never sent here.

export const AppearanceModeSchema = z.enum(["light", "dark", "system"])

// A keyboard shortcut binding in normalized form: lowercase tokens joined by
// "+", modifiers first, "mod" meaning Cmd on macOS / Ctrl elsewhere.
// e.g. "mod+p", "mod+shift+l", "d".
export const ShortcutBindingSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(\+[a-z0-9]+)*$/u, "Expected '+'-joined shortcut tokens")

export const AppearanceSettingsSchema = z.object({
  mode: AppearanceModeSchema.default("system"),
})

export const ShortcutSettingsSchema = z.object({
  commandPalette: ShortcutBindingSchema.default("mod+p"),
})

// Which corner the floating assistant dock anchors to on non-home surfaces.
export const AssistantDockPositionSchema = z.enum([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
])

export const AssistantSettingsSchema = z.object({
  dockPosition: AssistantDockPositionSchema.default("bottom-right"),
})

export const UserSettingsSchema = z.object({
  appearance: AppearanceSettingsSchema.default({ mode: "system" }),
  shortcuts: ShortcutSettingsSchema.default({
    commandPalette: "mod+p",
  }),
  assistant: AssistantSettingsSchema.default({ dockPosition: "bottom-right" }),
  // Per-module user preferences keyed by module id. Each module validates its
  // own slice when it declares fields; opaque here.
  modules: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
})

export const UpdateUserSettingsInputSchema = z.object({
  appearance: AppearanceSettingsSchema.partial().optional(),
  shortcuts: ShortcutSettingsSchema.partial().optional(),
  assistant: AssistantSettingsSchema.partial().optional(),
  modules: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
})

export const UserSettingsResponseSchema = z.object({
  settings: UserSettingsSchema,
})

// Declarative settings field/group descriptors used to render the settings UI.
// Field/group data lives in packages/module-registry; the UI iterates these.
export const SettingsScopeSchema = z.enum(["both", "web", "desktop"])
export const SettingsControlSchema = z.enum([
  "theme-mode",
  "shortcut",
  "assistant-dock-position",
])

export const SettingsFieldDescriptorSchema = z.object({
  // Dot path into UserSettings, e.g. "appearance.mode" or "shortcuts.commandPalette".
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  // Group id this field belongs to ("general" or a moduleId).
  group: z.string().min(1),
  scope: SettingsScopeSchema.default("both"),
  control: SettingsControlSchema,
})

export const SettingsGroupDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  // Lucide icon name shown in the settings group nav. Resolved by the UI.
  icon: z.string().min(1).optional(),
  platform: SettingsScopeSchema.default("both"),
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

export const UsageFeatureSchema = z.enum([
  "assistant",
  "onboarding",
  "embeddings",
  "email_triage",
  "note_summarize",
  "other",
])

export const RecordLlmUsageInputSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  feature: UsageFeatureSchema.nullable().optional(),
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
  monthAllowanceUsedUsdCents: z.number().int().nonnegative(),
  monthCreditsUsedUsdCents: z.number().int().nonnegative(),
  monthRemainingAllowanceUsdCents: z.number().int().nonnegative().nullable(),
  creditBalanceUsdCents: z.number().int(),
  totalRemainingUsdCents: z.number().int().nullable(),
  requestCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})

export const UsageBreakdownEntrySchema = z.object({
  feature: UsageFeatureSchema.nullable(),
  provider: z.string().min(1),
  model: z.string().min(1),
  requestCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsdCents: z.number().int().nonnegative(),
})

export const UsageBreakdownResponseSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  entries: z.array(UsageBreakdownEntrySchema),
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
  // Live amounts fetched from Polar at read time. `subtotalUsdCents` is the
  // recurring price excl. tax; `taxUsdCents` is the tax Polar computed for
  // this workspace's billing address; `totalUsdCents` is what actually gets
  // charged. All optional/nullable — tax is unknown until Polar has an
  // address on file or has emitted at least one invoice.
  subtotalUsdCents: z.number().int().nullable().optional(),
  taxUsdCents: z.number().int().nullable().optional(),
  totalUsdCents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
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

// Status of a Polar checkout, used by the post-checkout callback page in the
// console to render success / pending / failure feedback without waiting for
// the webhook → summary cycle.
export const CheckoutStatusSchema = z.enum([
  "open",
  "expired",
  "confirmed",
  "succeeded",
  "failed",
])

export const CheckoutStatusResponseSchema = z.object({
  checkoutId: z.string().min(1),
  status: CheckoutStatusSchema,
  productId: z.string().min(1).nullable(),
  productName: z.string().nullable(),
  url: z.string().url().nullable(),
})

export const CancelSubscriptionResponseSchema = z.object({
  subscriptionId: z.string().min(1),
  status: SubscriptionStatusSchema,
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.coerce.date().nullable(),
})

// Switch the workspace's active plan to a different Polar product. Used for
// paid → paid tier moves; subscribing from the free Starter tier goes through
// the regular checkout flow because there's no existing subscription yet.
export const ChangePlanInputSchema = z.object({
  productId: z.string().min(1),
})

export const CheckoutIdParamSchema = z.object({
  checkoutId: z.string().min(1),
})

export const SubscriptionIdParamSchema = z.object({
  subscriptionId: z.string().min(1),
})

export const ChangePlanResponseSchema = z.object({
  subscriptionId: z.string().min(1),
  polarSubscriptionId: z.string().min(1),
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
// client stays decoupled from the SDK shape.
export const AssistantTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
})

export const AssistantAttachmentBlockSchema = z.object({
  type: z.literal("attachment"),
  fileId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
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
  AssistantAttachmentBlockSchema,
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
// A suspended turn awaiting external resolution. `approval` waits for the user
// to approve/deny a server tool; `client_tool` waits for the client to execute
// a tool and post its result. `messageId` identifies the assistant message that
// owns the tool use when available. `resultMessageId` is the user message the
// resolved tool_result block is pushed into (client_tool only).
export const AssistantPendingApprovalSchema = z.object({
  kind: z.enum(["approval", "client_tool"]).default("approval"),
  messageId: z.string().min(1).optional(),
  toolUseId: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  resultMessageId: z.string().min(1).optional(),
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

export const AssistantAttachmentInputSchema = z.object({
  fileId: z.string().min(1),
})

// Where the user is when they send a turn. Attached per-turn, woven into the
// system prompt, and stashed on the conversation so resumes (approve /
// tool-result) keep the same grounding. Each module surface publishes this.
export const AssistantSurfaceContextSchema = z.object({
  // Owning module id, e.g. "notes" (matches module-registry ids).
  module: z.string().min(1),
  // Current route path, e.g. "/notes" or "/notes/graph".
  route: z.string().min(1),
  // The kind of entity in focus, e.g. "note", "note_group".
  entityType: z.string().min(1).optional(),
  // The focused entity's id, e.g. the open note or selected group.
  entityId: z.string().min(1).optional(),
  // Free-text selection or excerpt the user has highlighted.
  selection: z.string().max(8_000).optional(),
  // Module-specific extras (e.g. open note content) the surface chooses to
  // expose. Kept open-ended so surfaces don't need bespoke schemas.
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const StartAssistantChatInputSchema = z
  .object({
    // Null/omitted starts a new conversation; the server returns its id in the
    // first `conversation` stream event.
    conversationId: z.string().min(1).nullable().optional(),
    content: z.string().max(32_000).default("").optional(),
    attachments: z.array(AssistantAttachmentInputSchema).max(12).default([]),
    model: AssistantModelIdSchema.default(DEFAULT_ASSISTANT_MODEL_ID),
    webSearch: z.boolean().default(false),
    tools: z.boolean().default(true),
    context: AssistantSurfaceContextSchema.optional(),
  })
  .refine(
    (input) =>
      input.attachments.length > 0 ||
      (input.content && input.content.trim().length > 0),
    {
      message: "Message content or at least one attachment is required",
      path: ["content"],
    }
  )

export const ApproveAssistantToolInputSchema = z.object({
  toolUseId: z.string().min(1),
  decision: z.enum(["approve", "deny"]),
})

// Resolves a suspended client tool. The client executes the tool against live
// UI state, then posts the serialized result back to resume the turn.
export const SubmitAssistantToolResultInputSchema = z.object({
  toolUseId: z.string().min(1),
  result: z.string().max(32_000),
  isError: z.boolean().default(false),
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
  // The turn is suspended awaiting a client-executed tool. The client runs the
  // tool against live UI state and posts the result via /tool-result to resume.
  z.object({
    type: z.literal("client_tool_call"),
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
export type UsageFeature = z.infer<typeof UsageFeatureSchema>
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
export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>
export type CheckoutStatusResponse = z.infer<
  typeof CheckoutStatusResponseSchema
>
export type CancelSubscriptionResponse = z.infer<
  typeof CancelSubscriptionResponseSchema
>
export type ChangePlanInput = z.infer<typeof ChangePlanInputSchema>
export type ChangePlanResponse = z.infer<typeof ChangePlanResponseSchema>
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
export type UsageBreakdownEntry = z.infer<typeof UsageBreakdownEntrySchema>
export type UsageBreakdownResponse = z.infer<
  typeof UsageBreakdownResponseSchema
>
export type AssistantTextBlock = z.infer<typeof AssistantTextBlockSchema>
export type AssistantAttachmentBlock = z.infer<
  typeof AssistantAttachmentBlockSchema
>
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
export type AssistantAttachmentInput = z.infer<
  typeof AssistantAttachmentInputSchema
>
export type StartAssistantChatInput = z.infer<
  typeof StartAssistantChatInputSchema
>
export type ApproveAssistantToolInput = z.infer<
  typeof ApproveAssistantToolInputSchema
>
export type SubmitAssistantToolResultInput = z.infer<
  typeof SubmitAssistantToolResultInputSchema
>
export type AssistantSurfaceContext = z.infer<
  typeof AssistantSurfaceContextSchema
>
export type AssistantStreamEvent = z.infer<typeof AssistantStreamEventSchema>

// --- Notes -----------------------------------------------------------------

export const NoteStatusSchema = z.enum(["open", "archived", "deleted"])
export const NoteSourceTypeSchema = z.enum(["manual", "url", "import"])
export const NoteGroupKindSchema = z.enum(["manual", "generated", "system"])
export const NoteSuggestionTypeSchema = z.enum([
  "join-group",
  "create-group",
  "rename-group",
  "move-group",
  "add-tags",
  "add-edge",
  "archive-edge",
  "summary",
])
export const NoteSuggestionStatusSchema = z.enum([
  "pending",
  "accepted",
  "dismissed",
  "superseded",
])

export const NoteSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string(),
  content: z.string(),
  contentPlainText: z.string(),
  contentHash: z.string().min(1),
  sourceType: NoteSourceTypeSchema,
  url: z.string().url().nullable(),
  description: z.string().nullable(),
  siteName: z.string().nullable(),
  favicon: z.string().url().nullable(),
  image: z.string().url().nullable(),
  publishedAt: z.coerce.date().nullable(),
  tags: z.array(z.string().min(1).max(64)),
  groupIds: z.array(z.string().min(1)),
  manualGroupIds: z.array(z.string().min(1)),
  status: NoteStatusSchema,
  class: z.string().nullable(),
  summary: z.string().nullable(),
  organizerStatus: z.enum(["idle", "pending", "organized", "failed"]),
  organizerContentHash: z.string().nullable(),
  organizerUpdatedAt: z.coerce.date().nullable(),
  organizerError: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  createdByUserId: z.string().min(1),
  updatedByUserId: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const NoteGroupSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  color: z.string().nullable(),
  parentId: z.string().min(1).nullable(),
  kind: NoteGroupKindSchema,
  source: z.enum(["user", "assistant", "organizer", "migration"]),
  lockedByUser: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
  aliases: z.array(z.string().min(1).max(80)),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const NoteEdgeSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  fromNoteId: z.string().min(1),
  toNoteId: z.string().min(1),
  strength: z.number().min(0).max(1),
  reason: z.string().nullable(),
  source: z.enum(["manual", "assistant", "organizer", "migration"]),
  runId: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const NoteOrganizerRunSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  status: z.enum(["running", "completed", "failed"]),
  initiatedBy: z.enum(["user", "job", "assistant"]),
  noteCount: z.number().int().nonnegative(),
  suggestionCount: z.number().int().nonnegative(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  error: z.string().nullable(),
})

export const NoteSuggestionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  runId: z.string().min(1).nullable(),
  type: NoteSuggestionTypeSchema,
  status: NoteSuggestionStatusSchema,
  noteId: z.string().min(1).nullable(),
  groupId: z.string().min(1).nullable(),
  targetGroupId: z.string().min(1).nullable(),
  proposedParentId: z.string().min(1).nullable(),
  proposedName: z.string().nullable(),
  proposedDescription: z.string().nullable(),
  proposedTags: z.array(z.string().min(1).max(64)),
  proposedRelatedNoteIds: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

const NoteTitleInputSchema = z.string().trim().min(1).max(240)
const NoteContentInputSchema = z.string().max(500_000).default("")
const NoteTagInputSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(64)
  .default([])
const NoteGroupIdsInputSchema = z.array(z.string().min(1)).max(64).default([])

export const CreateNoteInputSchema = z.object({
  title: NoteTitleInputSchema.optional(),
  content: NoteContentInputSchema.optional(),
  url: z.string().url().optional(),
  description: z.string().trim().max(1000).optional(),
  class: z.string().trim().max(80).optional(),
  tags: NoteTagInputSchema.optional(),
  groupIds: NoteGroupIdsInputSchema.optional(),
  status: z.enum(["open", "archived"]).default("open").optional(),
  publishedAt: z.coerce.date().nullable().optional(),
})

export const UpdateNoteInputSchema = z
  .object({
    title: NoteTitleInputSchema.optional(),
    content: NoteContentInputSchema.optional(),
    url: z.string().url().nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    siteName: z.string().trim().max(240).nullable().optional(),
    favicon: z.string().url().nullable().optional(),
    image: z.string().url().nullable().optional(),
    publishedAt: z.coerce.date().nullable().optional(),
    tags: NoteTagInputSchema.optional(),
    groupIds: NoteGroupIdsInputSchema.optional(),
    status: z.enum(["open", "archived"]).optional(),
    class: z.string().trim().max(80).nullable().optional(),
    summary: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one note field must be provided",
  })

export const NotesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  groupId: z.string().min(1).optional(),
  tag: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["open", "archived", "all"]).default("open").optional(),
  sourceType: z
    .enum(["manual", "url", "import", "all"])
    .default("all")
    .optional(),
  sort: z
    .enum([
      "updated-desc",
      "updated-asc",
      "created-desc",
      "created-asc",
      "title-asc",
      "title-desc",
    ])
    .default("updated-desc")
    .optional(),
})

export const CreateNoteGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  color: z.string().trim().max(40).optional(),
  parentId: z.string().min(1).nullable().optional(),
})

export const UpdateNoteGroupInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    color: z.string().trim().max(40).nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    lockedByUser: z.boolean().optional(),
    aliases: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one group field must be provided",
  })

export const NoteFolderSchema = z.object({
  group: NoteGroupSchema.nullable(),
  noteCount: z.number().int().nonnegative(),
  directNoteCount: z.number().int().nonnegative(),
  children: z.array(z.string().min(1)),
})

export const NotesListResponseSchema = z.object({
  notes: z.array(NoteSchema),
})

export const NoteDetailResponseSchema = z.object({
  note: NoteSchema,
})

export const NotesGraphResponseSchema = z.object({
  notes: z.array(NoteSchema),
  groups: z.array(NoteGroupSchema),
  edges: z.array(NoteEdgeSchema),
})

export const NotesFoldersResponseSchema = z.object({
  groups: z.array(NoteGroupSchema),
  folders: z.array(NoteFolderSchema),
  ungroupedNoteCount: z.number().int().nonnegative(),
})

export const NoteGroupsResponseSchema = z.object({
  groups: z.array(NoteGroupSchema),
})

export const NoteTagsResponseSchema = z.object({
  tags: z.array(z.string()),
})

export type NoteStatus = z.infer<typeof NoteStatusSchema>
export type NoteSourceType = z.infer<typeof NoteSourceTypeSchema>
export type NoteGroupKind = z.infer<typeof NoteGroupKindSchema>
export type NoteSuggestionType = z.infer<typeof NoteSuggestionTypeSchema>
export type NoteSuggestionStatus = z.infer<typeof NoteSuggestionStatusSchema>
export type Note = z.infer<typeof NoteSchema>
export type NoteGroup = z.infer<typeof NoteGroupSchema>
export type NoteEdge = z.infer<typeof NoteEdgeSchema>
export type NoteSuggestion = z.infer<typeof NoteSuggestionSchema>
export type NoteOrganizerRun = z.infer<typeof NoteOrganizerRunSchema>
export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>
export type UpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>
export type NotesQuery = z.infer<typeof NotesQuerySchema>
export type CreateNoteGroupInput = z.infer<typeof CreateNoteGroupInputSchema>
export type UpdateNoteGroupInput = z.infer<typeof UpdateNoteGroupInputSchema>
export type NoteFolder = z.infer<typeof NoteFolderSchema>
export type NotesListResponse = z.infer<typeof NotesListResponseSchema>
export type NoteDetailResponse = z.infer<typeof NoteDetailResponseSchema>
export type NotesGraphResponse = z.infer<typeof NotesGraphResponseSchema>
export type NotesFoldersResponse = z.infer<typeof NotesFoldersResponseSchema>
export type NoteGroupsResponse = z.infer<typeof NoteGroupsResponseSchema>
export type NoteTagsResponse = z.infer<typeof NoteTagsResponseSchema>

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

// --- Desktop installer builds ---------------------------------------------

// The themes that can be baked into a custom desktop shell. Must stay in sync
// with the themes in packages/ui/src/styles/themes and the ALLOWED_THEMES set
// in scripts/desktop-custom-build.ts. "default" is the console's own look (the
// unscoped :root theme in globals.css); it has no [data-theme] override, so the
// app falls through to :root when it is selected.
export const DesktopThemeSchema = z.enum([
  "default",
  "rose",
  "coral",
  "blush",
  "amber",
  "butter",
  "mint",
  "cyan",
  "sky",
  "lavender",
  "plum",
])

export const DesktopPlatformSchema = z.enum(["linux", "windows", "macos"])

export const DesktopBuildStatusSchema = z.enum([
  "queued",
  "building",
  "ready",
  "failed",
])

export const DesktopBuildArtifactSchema = z.object({
  platform: DesktopPlatformSchema,
  filename: z.string().min(1),
  downloadUrl: z.string().url(),
  sizeBytes: z.number().int().nonnegative(),
})

// A custom desktop installer build. `callbackToken` is the per-build secret the
// CI workflow must echo back to authorize its result callback; it is never sent
// to clients (the API strips it before returning rows).
export const DesktopBuildSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  status: DesktopBuildStatusSchema,
  appName: z.string().min(1),
  identifier: z.string().nullable().optional(),
  theme: DesktopThemeSchema,
  // Latest published desktop version at dispatch time; null when none existed.
  appVersion: z.string().nullable().optional(),
  features: z.array(z.string().min(1)),
  artifacts: z.array(DesktopBuildArtifactSchema),
  error: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const CreateDesktopBuildInputSchema = z.object({
  appName: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[\w .'-]+$/u,
      "App name can only contain letters, numbers, spaces, dots, apostrophes, underscores, and hyphens"
    )
    .default("Helm"),
  identifier: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+$/u,
      "Identifier must be a reverse-DNS style string"
    )
    .optional(),
  theme: DesktopThemeSchema.default("default"),
  // Empty array = full build with every feature included.
  features: z.array(z.string().min(1)).default([]),
})

export const DesktopBuildListResponseSchema = z.object({
  builds: z.array(DesktopBuildSchema),
})

// Latest desktop app version published as a GitHub Release, used by the console
// to decide whether an installed/built version has an update available. Null
// when the repo has no release yet.
export const DesktopLatestVersionResponseSchema = z.object({
  version: z.string().nullable(),
})

// Posted by the CI workflow once a platform's installers are built and
// uploaded. One callback per matrix OS, so the API merges artifacts across
// calls keyed by the build id.
export const DesktopBuildCallbackInputSchema = z.object({
  status: z.enum(["ready", "failed"]),
  platform: DesktopPlatformSchema,
  artifacts: z.array(DesktopBuildArtifactSchema).default([]),
  error: z.string().max(2000).nullable().optional(),
})

export type DesktopTheme = z.infer<typeof DesktopThemeSchema>
export type DesktopPlatform = z.infer<typeof DesktopPlatformSchema>
export type DesktopBuildStatus = z.infer<typeof DesktopBuildStatusSchema>
export type DesktopBuildArtifact = z.infer<typeof DesktopBuildArtifactSchema>
export type DesktopBuild = z.infer<typeof DesktopBuildSchema>
export type CreateDesktopBuildInput = z.infer<
  typeof CreateDesktopBuildInputSchema
>
export type DesktopBuildListResponse = z.infer<
  typeof DesktopBuildListResponseSchema
>
export type DesktopLatestVersionResponse = z.infer<
  typeof DesktopLatestVersionResponseSchema
>
export type DesktopBuildCallbackInput = z.infer<
  typeof DesktopBuildCallbackInputSchema
>
export type UploadFileMetadata = z.infer<typeof UploadFileMetadataSchema>
export type AppearanceMode = z.infer<typeof AppearanceModeSchema>
export type ShortcutBinding = z.infer<typeof ShortcutBindingSchema>
export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>
export type ShortcutSettings = z.infer<typeof ShortcutSettingsSchema>
export type UserSettings = z.infer<typeof UserSettingsSchema>
export type UpdateUserSettingsInput = z.infer<
  typeof UpdateUserSettingsInputSchema
>
export type UserSettingsResponse = z.infer<typeof UserSettingsResponseSchema>
export type AssistantDockPosition = z.infer<typeof AssistantDockPositionSchema>
export type AssistantSettings = z.infer<typeof AssistantSettingsSchema>
export type SettingsScope = z.infer<typeof SettingsScopeSchema>
export type SettingsControl = z.infer<typeof SettingsControlSchema>
export type SettingsFieldDescriptor = z.infer<
  typeof SettingsFieldDescriptorSchema
>
export type SettingsGroupDescriptor = z.infer<
  typeof SettingsGroupDescriptorSchema
>

// --- Pomodoro ----------------------------------------------------------------

export const PomodoroSessionStatusSchema = z.enum(["completed", "abandoned"])

// Workspace-level timer preferences. Every field has a default so a workspace
// without a saved settings document still resolves to a usable configuration.
export const PomodoroSettingsSchema = z.object({
  focusMinutes: z.number().int().min(1).max(180).default(25),
  shortBreakMinutes: z.number().int().min(1).max(60).default(5),
  longBreakMinutes: z.number().int().min(1).max(120).default(15),
  longBreakEvery: z.number().int().min(1).max(12).default(4),
  autoStartBreaks: z.boolean().default(false),
  autoStartFocus: z.boolean().default(false),
  soundEnabled: z.boolean().default(true),
  notificationsEnabled: z.boolean().default(true),
  dailyGoalSessions: z.number().int().min(1).max(24).default(4),
})

export const UpdatePomodoroSettingsInputSchema =
  PomodoroSettingsSchema.partial().refine(
    (data: Record<string, unknown>) => Object.keys(data).length > 0,
    { message: "At least one field must be provided" }
  )

export const PomodoroSessionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  status: PomodoroSessionStatusSchema,
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date(),
  plannedMinutes: z.number().int().min(1).max(180),
  completedSeconds: z.number().int().nonnegative(),
  subject: z.string().max(200).nullable(),
  topics: z.array(z.string().min(1).max(60)).max(20),
  // Free-form annotation rendered as markdown.
  notes: z.string().max(20_000),
  createdByUserId: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const CreatePomodoroSessionInputSchema = z
  .object({
    status: PomodoroSessionStatusSchema,
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date(),
    plannedMinutes: z.number().int().min(1).max(180),
    completedSeconds: z.number().int().nonnegative(),
    subject: z.string().max(200).nullable().optional(),
    topics: z.array(z.string().min(1).max(60)).max(20).optional(),
    notes: z.string().max(20_000).optional(),
  })
  .superRefine(
    (
      data: {
        startedAt: Date
        endedAt: Date
        plannedMinutes: number
        completedSeconds: number
      },
      ctx: z.RefinementCtx
    ) => {
      if (data.endedAt.getTime() < data.startedAt.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endedAt must not be before startedAt",
          path: ["endedAt"],
        })
      }
      if (data.completedSeconds > data.plannedMinutes * 60) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "completedSeconds must not exceed plannedMinutes * 60",
          path: ["completedSeconds"],
        })
      }
    }
  )

export const UpdatePomodoroSessionInputSchema = z
  .object({
    subject: z.string().max(200).nullable().optional(),
    topics: z.array(z.string().min(1).max(60)).max(20).optional(),
    notes: z.string().max(20_000).optional(),
  })
  .refine((data: Record<string, unknown>) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  })

export const PomodoroSessionsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export const PomodoroSettingsResponseSchema = z.object({
  settings: PomodoroSettingsSchema,
})
export const PomodoroSessionsResponseSchema = z.object({
  sessions: z.array(PomodoroSessionSchema),
})
export const PomodoroSessionDetailResponseSchema = z.object({
  session: PomodoroSessionSchema,
})

export type PomodoroSessionStatus = z.infer<typeof PomodoroSessionStatusSchema>
export type PomodoroSettings = z.infer<typeof PomodoroSettingsSchema>
export type UpdatePomodoroSettingsInput = z.infer<
  typeof UpdatePomodoroSettingsInputSchema
>
export type PomodoroSession = z.infer<typeof PomodoroSessionSchema>
export type CreatePomodoroSessionInput = z.infer<
  typeof CreatePomodoroSessionInputSchema
>
export type UpdatePomodoroSessionInput = z.infer<
  typeof UpdatePomodoroSessionInputSchema
>
export type PomodoroSessionsQuery = z.infer<typeof PomodoroSessionsQuerySchema>
export type PomodoroSettingsResponse = z.infer<
  typeof PomodoroSettingsResponseSchema
>
export type PomodoroSessionsResponse = z.infer<
  typeof PomodoroSessionsResponseSchema
>
export type PomodoroSessionDetailResponse = z.infer<
  typeof PomodoroSessionDetailResponseSchema
>
