import type { PlanId, WorkspaceLimits } from "@workspace/types"
import { PlanIdSchema } from "@workspace/types"

/**
 * ───────────────────────────────────────────────────────────────────────────
 * Billing catalog
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Helm does not hardcode Polar product IDs. Instead, each Polar product carries
 * `metadata` that declares its effect in Helm. Create + price products in the
 * Polar dashboard whenever you like, tag them with the metadata keys below, and
 * the webhook applies the right effect with zero code change.
 *
 * Required product metadata (set in the Polar dashboard, all values are strings):
 *
 *   Plan subscription (recurring — the base usage tier):
 *     helm_kind = "plan"
 *     helm_plan = "starter" | "pro" | "enterprise"
 *
 *   Module add-on (recurring — one product per paid module):
 *     helm_kind    = "module"
 *     helm_modules = "notes"               // the module id this product enables
 *
 *   Extra-token / credit top-up (one-time order, not recurring):
 *     helm_kind          = "credits"
 *     helm_credits_cents = "1000"          // USD cents granted to the ledger
 *
 * Plans only meter usage; modules are independent paid toggles. A workspace's
 * monthly bill = base plan + Σ enabled module products. The numeric allowance
 * VALUES per plan live in PLAN_DEFINITIONS; display prices for modules live in
 * MODULE_MONTHLY_PRICE_USD_CENTS (Polar holds the source-of-truth price).
 */

export interface PlanDefinition {
  features: Record<string, boolean>
  limits: WorkspaceLimits
}

/**
 * Per-plan entitlement payload written to `entitlements.featuresJson` /
 * `limitsJson` when a subscription becomes active.
 */
// Plans ONLY meter usage — they do not gate modules (modules are independent
// paid toggles; see MODULE_MONTHLY_PRICE_USD_CENTS). `assistant` stays in
// features because it is a free, always-on core capability. Allowances below
// are the agreed launch values (Starter $0.50, Pro $20, Enterprise $250 /mo).
export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  starter: {
    features: { assistant: true },
    limits: {
      llmCostUsdCentsPerMonth: 50,
      rateLimitPerMinute: 60,
    },
  },
  pro: {
    features: { assistant: true },
    limits: {
      llmCostUsdCentsPerMonth: 2000,
      rateLimitPerMinute: 240,
    },
  },
  enterprise: {
    features: { assistant: true },
    limits: {
      llmCostUsdCentsPerMonth: 25_000,
      rateLimitPerMinute: 600,
    },
  },
}

export const MODULE_MONTHLY_PRICE_USD_CENTS: Record<string, number> = {
  notes: 199,
  whiteboard: 199,
  spreadsheets: 299,
  timetable: 199,
  journal: 299,
  pomodoro: 0,
  people: 299,
  "imap-inbox": 499,
  triage: 399,
  resources: 0,
  blog: 0,
  projects: 0,
  timeline: 0,
  now: 0,
  comments: 0,
  "contact-form": 0,
}

// --- Product metadata keys ---

export const METADATA_KEYS = {
  kind: "helm_kind",
  plan: "helm_plan",
  creditsCents: "helm_credits_cents",
  modules: "helm_modules",
} as const

export type BillingEffect =
  | { kind: "plan"; plan: PlanId }
  | { kind: "credits"; amountUsdCents: number }
  | { kind: "module"; moduleIds: string[]; plan: PlanId | null }

const readString = (
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | undefined => {
  const value = metadata?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

const parsePlan = (value: string | undefined): PlanId | null => {
  const parsed = PlanIdSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Resolve a purchased Polar product's metadata into a Helm billing effect.
 * Returns null when the product is not tagged for Helm
 * — callers should log and no-op rather than throw.
 */
export const resolveEffect = (
  metadata: Record<string, unknown> | null | undefined
): BillingEffect | null => {
  const kind = readString(metadata, METADATA_KEYS.kind)

  if (kind === "plan") {
    const plan = parsePlan(readString(metadata, METADATA_KEYS.plan))
    return plan ? { kind: "plan", plan } : null
  }

  if (kind === "credits") {
    const raw = readString(metadata, METADATA_KEYS.creditsCents)
    const amountUsdCents = raw ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isInteger(amountUsdCents) && amountUsdCents > 0
      ? { kind: "credits", amountUsdCents }
      : null
  }

  if (kind === "module") {
    const moduleIds = (readString(metadata, METADATA_KEYS.modules) ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
    if (moduleIds.length === 0) {
      return null
    }
    return {
      kind: "module",
      moduleIds,
      plan: parsePlan(readString(metadata, METADATA_KEYS.plan)),
    }
  }

  return null
}
