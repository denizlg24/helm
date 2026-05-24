import { Injectable, Logger } from "@nestjs/common"
import {
  and,
  db,
  eq,
  gte,
  polarCheckoutSessions,
  sql,
  subscriptions,
  user as userTable,
  workspaces,
} from "@workspace/db"
import {
  type ActiveCheckoutSession,
  type BillingSummaryResponse,
  type PlanId,
  type Subscription,
  type SubscriptionProductKind,
  type SubscriptionStatus,
  SubscriptionStatusSchema,
} from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AuditService } from "../audit/audit.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { EntitlementService } from "../entitlements/entitlement.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { ModuleConfigService } from "../module-configs/module-config.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { OnboardingSelectionService } from "../onboarding/onboarding-selection.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { UsageService } from "../usage/usage.service"
import { PLAN_DEFINITIONS } from "./billing.catalog"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { PolarService } from "./polar.service"

export interface WorkspaceContext {
  workspaceId: string
  tenantId: string
}

export interface PolarSubscriptionShape {
  id: string
  customerId?: string | null
  productId: string
  status: string
  createdAt?: Date | string | null
  currentPeriodEnd?: Date | string | null
  cancelAtPeriodEnd?: boolean | null
}

interface UpsertSubscriptionParams {
  polar: PolarSubscriptionShape
  productKind: SubscriptionProductKind
  plan: PlanId
  moduleId: string | null
  statusOverride?: SubscriptionStatus
}

const mapPolarStatus = (status: string): SubscriptionStatus => {
  switch (status) {
    case "active":
      return "active"
    case "trialing":
      return "trialing"
    case "past_due":
      return "past_due"
    case "unpaid":
      return "unpaid"
    case "canceled":
      return "canceled"
    default:
      // incomplete, incomplete_expired, anything unknown
      return "incomplete"
  }
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly entitlementService: EntitlementService,
    private readonly moduleConfigService: ModuleConfigService,
    private readonly usageService: UsageService,
    private readonly auditService: AuditService,
    private readonly polarService: PolarService,
    private readonly onboardingSelectionService: OnboardingSelectionService
  ) {}

  /**
   * Resolve the workspace (and its tenant) behind a Polar `externalCustomerId`.
   * We set `externalCustomerId = workspaceId` at checkout, so this is a lookup
   * that also confirms the workspace still exists.
   */
  async resolveWorkspace(
    externalCustomerId: string | null | undefined
  ): Promise<WorkspaceContext | null> {
    if (!externalCustomerId) {
      return null
    }
    const rows = await db
      .select({ id: workspaces.id, tenantId: workspaces.tenantId })
      .from(workspaces)
      .where(eq(workspaces.id, externalCustomerId))
      .limit(1)

    const row = rows[0]
    return row ? { workspaceId: row.id, tenantId: row.tenantId } : null
  }

  // --- Plan subscription -----------------------------------------------------

  async activatePlan(
    context: WorkspaceContext,
    plan: PlanId,
    polar: PolarSubscriptionShape
  ): Promise<void> {
    await this.applyPlan(context, plan)
    await this.upsertSubscription(context, {
      polar,
      productKind: "plan",
      plan,
      moduleId: null,
    })
    await this.auditService.writeSystem(context, {
      action: "billing.plan.activate",
      resourceType: "subscription",
      resourceId: polar.id,
      metadataJson: {
        plan,
        productKind: "plan",
        polarSubscriptionId: polar.id,
      },
    })
  }

  /**
   * Plan subscription fully revoked — downgrade entitlements to free starter
   * and mark the row canceled.
   */
  async revokePlan(
    context: WorkspaceContext,
    polar: PolarSubscriptionShape
  ): Promise<void> {
    if (
      await this.isSupersededRevoke(context.workspaceId, "plan", null, polar.id)
    ) {
      this.logger.log(
        `Ignoring revoke for superseded plan subscription ${polar.id} in workspace ${context.workspaceId}`
      )
      return
    }
    await this.applyPlan(context, "starter")
    await this.upsertSubscription(context, {
      polar,
      productKind: "plan",
      plan: "starter",
      moduleId: null,
      statusOverride: "canceled",
    })
    await this.auditService.writeSystem(context, {
      action: "billing.plan.revoke",
      resourceType: "subscription",
      resourceId: polar.id,
      metadataJson: {
        newPlan: "starter",
        productKind: "plan",
        status: "canceled",
        polarSubscriptionId: polar.id,
      },
    })
    this.logger.log(
      `Revoked plan subscription for workspace ${context.workspaceId}; downgraded to starter`
    )
  }

  private async applyPlan(
    context: WorkspaceContext,
    plan: PlanId
  ): Promise<void> {
    const definition = PLAN_DEFINITIONS[plan]
    await this.entitlementService.applyPlan({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      plan,
      features: definition.features,
      limits: definition.limits,
    })
  }

  // --- Module subscription ---------------------------------------------------

  async activateModule(
    context: WorkspaceContext,
    moduleId: string,
    polar: PolarSubscriptionShape
  ): Promise<void> {
    await this.moduleConfigService.enableModules(
      context.tenantId,
      context.workspaceId,
      [moduleId]
    )
    await this.upsertSubscription(context, {
      polar,
      productKind: "module",
      plan: await this.currentPlan(context.workspaceId),
      moduleId,
    })
    await this.auditService.writeSystem(context, {
      action: "billing.module.activate",
      resourceType: "module",
      resourceId: moduleId,
      metadataJson: {
        moduleId,
        productKind: "module",
        polarSubscriptionId: polar.id,
      },
    })
    this.logger.log(
      `Enabled module ${moduleId} for workspace ${context.workspaceId}`
    )
  }

  async revokeModule(
    context: WorkspaceContext,
    moduleId: string,
    polar: PolarSubscriptionShape
  ): Promise<void> {
    if (
      await this.isSupersededRevoke(
        context.workspaceId,
        "module",
        moduleId,
        polar.id
      )
    ) {
      this.logger.log(
        `Ignoring revoke for superseded module subscription ${polar.id} (module ${moduleId}) in workspace ${context.workspaceId}`
      )
      return
    }
    await this.moduleConfigService.disableModules(context.workspaceId, [
      moduleId,
    ])
    await this.upsertSubscription(context, {
      polar,
      productKind: "module",
      plan: await this.currentPlan(context.workspaceId),
      moduleId,
      statusOverride: "canceled",
    })
    await this.auditService.writeSystem(context, {
      action: "billing.module.revoke",
      resourceType: "module",
      resourceId: moduleId,
      metadataJson: {
        moduleId,
        productKind: "module",
        status: "canceled",
        polarSubscriptionId: polar.id,
      },
    })
    this.logger.log(
      `Disabled module ${moduleId} for workspace ${context.workspaceId}`
    )
  }

  // --- Credit top-ups (one-time orders) -------------------------------------

  async grantCredits(
    context: WorkspaceContext,
    amountUsdCents: number,
    sourceRef: string
  ): Promise<void> {
    await this.usageService.grantSystem(context, {
      amountUsdCents,
      source: "polar",
      sourceRef,
      note: "Polar token top-up",
    })
    await this.auditService.writeSystem(context, {
      action: "billing.credits.grant",
      resourceType: "usage_credit",
      resourceId: sourceRef,
      metadataJson: {
        amountUsdCents,
        source: "polar",
        sourceRef,
      },
    })
  }

  // --- Checkout sessions ----------------------------------------------------

  async createCheckout(
    context: WorkspaceContext,
    params: { productId: string; successUrl?: string; userId: string }
  ): Promise<{ checkoutId: string; url: string }> {
    const now = new Date()
    const existing = await db
      .select({
        checkoutId: polarCheckoutSessions.polarCheckoutId,
        url: polarCheckoutSessions.url,
      })
      .from(polarCheckoutSessions)
      .where(
        and(
          eq(polarCheckoutSessions.workspaceId, context.workspaceId),
          eq(polarCheckoutSessions.polarProductId, params.productId),
          eq(polarCheckoutSessions.status, "open"),
          gte(polarCheckoutSessions.expiresAt, now)
        )
      )
      .limit(1)

    const active = existing[0]
    if (active) {
      return active
    }

    const checkout = await this.polarService.createCheckout({
      productId: params.productId,
      workspaceId: context.workspaceId,
      customerEmail: await this.getUserEmail(params.userId),
      successUrl: params.successUrl,
    })

    await db
      .insert(polarCheckoutSessions)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        polarCheckoutId: checkout.checkoutId,
        polarProductId: params.productId,
        url: checkout.url,
        status: "open",
        expiresAt: checkout.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          polarCheckoutSessions.workspaceId,
          polarCheckoutSessions.polarProductId,
        ],
        set: {
          polarCheckoutId: checkout.checkoutId,
          url: checkout.url,
          status: "open",
          expiresAt: checkout.expiresAt,
          updatedAt: now,
        },
      })

    return { checkoutId: checkout.checkoutId, url: checkout.url }
  }

  private async getUserEmail(userId: string): Promise<string | undefined> {
    const rows = await db
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1)

    return rows[0]?.email
  }

  // --- Subscription persistence ---------------------------------------------

  private async upsertSubscription(
    context: WorkspaceContext,
    params: UpsertSubscriptionParams
  ): Promise<void> {
    const now = new Date()
    const { polar } = params
    const currentPeriodEnd = polar.currentPeriodEnd
      ? new Date(polar.currentPeriodEnd)
      : null
    const polarCreatedAt = polar.createdAt ? new Date(polar.createdAt) : null
    const status = params.statusOverride ?? mapPolarStatus(polar.status)

    const shared = {
      polarCustomerId: polar.customerId ?? null,
      polarProductId: polar.productId,
      productKind: params.productKind,
      moduleId: params.moduleId,
      plan: params.plan,
      status,
      polarCreatedAt,
      currentPeriodEnd,
      cancelAtPeriodEnd: polar.cancelAtPeriodEnd ?? false,
    }

    // Conflict on the per-workspace slot (one plan, one row per paid module),
    // not on polarSubscriptionId, so a plan/module switch — which arrives under
    // a new Polar subscription id — updates the existing slot row in place
    // instead of violating the slot's partial unique index.
    const conflict =
      params.productKind === "plan"
        ? {
            target: subscriptions.workspaceId,
            targetWhere: sql`${subscriptions.productKind} = 'plan'`,
          }
        : {
            target: [subscriptions.workspaceId, subscriptions.moduleId],
            targetWhere: sql`${subscriptions.productKind} = 'module'`,
          }

    const setWhere = polarCreatedAt
      ? sql`
          ${subscriptions.polarSubscriptionId} = ${polar.id}
          OR ${subscriptions.polarCreatedAt} IS NULL
          OR (${polarCreatedAt}::timestamptz) >= ${subscriptions.polarCreatedAt}
        `
      : sql`
          ${subscriptions.polarSubscriptionId} = ${polar.id}
          OR ${subscriptions.polarCreatedAt} IS NULL
          OR TRUE
        `

    await db
      .insert(subscriptions)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        polarSubscriptionId: polar.id,
        createdAt: now,
        updatedAt: now,
        ...shared,
      })
      .onConflictDoUpdate({
        ...conflict,
        // Only overwrite the slot when this event is for the subscription that
        // already holds it, when no recency is recorded yet, or when the
        // incoming subscription is at least as new. This drops out-of-order
        // events for a superseded subscription instead of clobbering the
        // current one (the conflict simply becomes a no-op).
        set: { ...shared, polarSubscriptionId: polar.id, updatedAt: now },
        setWhere,
      })
  }

  /**
   * True when the slot is currently held by a *different* Polar subscription —
   * i.e. this revoke targets a subscription that was already superseded by a
   * newer one. Acting on it would clobber the active subscription, so callers
   * skip the downgrade.
   */
  private async isSupersededRevoke(
    workspaceId: string,
    productKind: SubscriptionProductKind,
    moduleId: string | null,
    polarSubscriptionId: string
  ): Promise<boolean> {
    const conditions = [
      eq(subscriptions.workspaceId, workspaceId),
      eq(subscriptions.productKind, productKind),
    ]
    if (productKind === "module" && moduleId) {
      conditions.push(eq(subscriptions.moduleId, moduleId))
    }
    const rows = await db
      .select({ polarSubscriptionId: subscriptions.polarSubscriptionId })
      .from(subscriptions)
      .where(and(...conditions))
      .limit(1)

    const current = rows[0]
    return Boolean(
      current && current.polarSubscriptionId !== polarSubscriptionId
    )
  }

  private async currentPlan(workspaceId: string): Promise<PlanId> {
    return (
      (await this.entitlementService.getActivePlan(workspaceId)) ?? "starter"
    )
  }

  // --- Read ------------------------------------------------------------------

  async getSummary(workspaceId: string): Promise<BillingSummaryResponse> {
    const [plan, subs, enabledModuleIds, selection] = await Promise.all([
      this.entitlementService.getActivePlan(workspaceId),
      this.getSubscriptions(workspaceId),
      this.moduleConfigService.listEnabledModuleIds(workspaceId),
      this.onboardingSelectionService.get(workspaceId),
    ])
    const activeProductIds = new Set(
      subs
        .filter(
          (subscription) =>
            subscription.status === "active" ||
            subscription.status === "trialing"
        )
        .map((subscription) => subscription.polarProductId)
        .filter((productId): productId is string => Boolean(productId))
    )
    return {
      plan: plan ?? "starter",
      subscriptions: subs,
      enabledModuleIds,
      activeCheckoutSessions: await this.getActiveCheckoutSessions(
        workspaceId,
        activeProductIds
      ),
      selection,
    }
  }

  private async getActiveCheckoutSessions(
    workspaceId: string,
    activeProductIds: ReadonlySet<string>
  ): Promise<ActiveCheckoutSession[]> {
    const rows = await db
      .select({
        checkoutId: polarCheckoutSessions.polarCheckoutId,
        productId: polarCheckoutSessions.polarProductId,
        url: polarCheckoutSessions.url,
        expiresAt: polarCheckoutSessions.expiresAt,
      })
      .from(polarCheckoutSessions)
      .where(
        and(
          eq(polarCheckoutSessions.workspaceId, workspaceId),
          eq(polarCheckoutSessions.status, "open"),
          gte(polarCheckoutSessions.expiresAt, new Date())
        )
      )

    return rows.filter((row) => !activeProductIds.has(row.productId))
  }

  private async getSubscriptions(workspaceId: string): Promise<Subscription[]> {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      polarCustomerId: row.polarCustomerId,
      polarSubscriptionId: row.polarSubscriptionId,
      polarProductId: row.polarProductId,
      productKind: row.productKind === "module" ? "module" : "plan",
      moduleId: row.moduleId,
      plan:
        row.plan === "pro" || row.plan === "enterprise" ? row.plan : "starter",
      // row.status is already an internal SubscriptionStatus (mapped on write);
      // validate it back out rather than re-running the Polar mapping.
      status: SubscriptionStatusSchema.catch("incomplete").parse(row.status),
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    }))
  }
}
