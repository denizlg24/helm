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
  "stripe",
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
export type GrantUsageCreditInput = z.infer<typeof GrantUsageCreditInputSchema>
export type UsageSummary = z.infer<typeof UsageSummarySchema>
