import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  and,
  db,
  eq,
  gte,
  member,
  polarCheckoutSessions,
  sql,
  subscriptions,
  user as userTable,
  workspaces,
} from "@workspace/db"
import {
  type ActiveCheckoutSession,
  type AuthContext,
  type BillingSummaryResponse,
  type CancelSubscriptionResponse,
  type CheckoutStatusResponse,
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
import {
  type EmitNotificationInput,
  NotificationsService,
} from "../notifications/notifications.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { OnboardingSelectionService } from "../onboarding/onboarding-selection.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { UsageService } from "../usage/usage.service"
import { PLAN_DEFINITIONS, resolveEffect } from "./billing.catalog"
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
    private readonly onboardingSelectionService: OnboardingSelectionService,
    private readonly notificationsService: NotificationsService
  ) {}

  /**
   * Notify every member of the workspace about a billing event. Failures are
   * logged and swallowed — a notification must never break a billing effect.
   */
  private async notifyMembers(
    context: WorkspaceContext,
    input: EmitNotificationInput
  ): Promise<void> {
    try {
      const rows = await db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, context.workspaceId))
      const results = await Promise.allSettled(
        rows.map((row) =>
          this.notificationsService.emit(
            {
              tenantId: context.tenantId,
              workspaceId: context.workspaceId,
              userId: row.userId,
            },
            input
          )
        )
      )
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === "rejected") {
          const row = rows[i]
          this.logger.warn(
            `Failed to emit notification for user ${row.userId} in workspace ${context.workspaceId} (tenant ${context.tenantId}): ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`
          )
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to send billing notification for workspace ${context.workspaceId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

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
    await this.notifyMembers(context, {
      category: "billing",
      severity: "success",
      title: "Plan activated",
      body: `Your workspace is now on the ${plan} plan.`,
      dedupeKey: `billing:plan:${polar.id}:active:${plan}`,
      actions: [
        {
          kind: "navigate",
          id: "manage-billing",
          label: "Manage billing",
          route: "/billing",
          app: "console",
        },
      ],
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
    await this.notifyMembers(context, {
      category: "billing",
      severity: "warning",
      title: "Plan subscription ended",
      body: "Your workspace was downgraded to the starter plan.",
      dedupeKey: `billing:plan:${polar.id}:revoked`,
      actions: [
        {
          kind: "navigate",
          id: "manage-billing",
          label: "Manage billing",
          route: "/billing",
          app: "console",
        },
      ],
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
    await this.notifyMembers(context, {
      category: "billing",
      severity: "success",
      title: "Module activated",
      body: `The ${moduleId} module is now enabled for your workspace.`,
      dedupeKey: `billing:module:${polar.id}:active:${moduleId}`,
      actions: [
        {
          kind: "navigate",
          id: "manage-modules",
          label: "Manage modules",
          route: "/modules",
          app: "console",
        },
      ],
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
    await this.notifyMembers(context, {
      category: "billing",
      severity: "warning",
      title: "Module subscription ended",
      body: `The ${moduleId} module was disabled for your workspace.`,
      dedupeKey: `billing:module:${polar.id}:revoked:${moduleId}`,
      actions: [
        {
          kind: "navigate",
          id: "manage-modules",
          label: "Manage modules",
          route: "/modules",
          app: "console",
        },
      ],
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
    await this.notifyMembers(context, {
      category: "billing",
      severity: "success",
      title: "Credits added",
      body: `$${(amountUsdCents / 100).toFixed(2)} in AI credits was added to your workspace.`,
      dedupeKey: `billing:credits:${sourceRef}`,
      actions: [
        {
          kind: "navigate",
          id: "view-usage",
          label: "View usage",
          route: "/usage",
          app: "console",
        },
      ],
    })
  }

  // --- Checkout sessions ----------------------------------------------------

  async createCheckout(
    context: WorkspaceContext,
    params: { productId: string; successUrl?: string; userId: string }
  ): Promise<{ checkoutId: string; url: string }> {
    // Detect-and-resume: if the workspace has a canceled subscription for the
    // same product and Polar still considers it revivable (cancel-at-period-end
    // style, not a hard revoke), un-cancel it instead of opening a new
    // checkout. Avoids the "checkout succeeds but no new sub appears" trap
    // when a previous sub blocks creation of a fresh one on the same product.
    const resumed = await this.tryResumeCanceledForProduct(
      context,
      params.productId,
      params.successUrl,
      params.userId
    )
    if (resumed) {
      return resumed
    }

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
      customerEmail: await this.getUserEmail(
        params.userId,
        context.workspaceId
      ),
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

  async getCheckoutStatus(
    workspaceId: string,
    checkoutId: string
  ): Promise<CheckoutStatusResponse> {
    const rows = await db
      .select({
        id: polarCheckoutSessions.id,
        tenantId: polarCheckoutSessions.tenantId,
      })
      .from(polarCheckoutSessions)
      .where(
        and(
          eq(polarCheckoutSessions.workspaceId, workspaceId),
          eq(polarCheckoutSessions.polarCheckoutId, checkoutId)
        )
      )
      .limit(1)

    const session = rows[0]
    if (!session) {
      throw new NotFoundException("Checkout not found for this workspace")
    }

    const status = await this.polarService.getCheckoutStatus(checkoutId)

    // Best-effort reconciliation: if the checkout has settled but the
    // matching subscription hasn't landed in our DB yet (webhook hasn't
    // reached us, or the previous canceled slot blocked a previous attempt),
    // pull the subscription from Polar and persist it directly.
    if (status.status === "succeeded" || status.status === "confirmed") {
      try {
        await this.reconcileFromCheckout(
          { workspaceId, tenantId: session.tenantId },
          checkoutId
        )
      } catch (reconcileError) {
        this.logger.warn(
          `Reconcile from checkout ${checkoutId} failed: ${String(reconcileError)}`
        )
      }
    }

    return status
  }

  /**
   * If the workspace has a canceled subscription for this product and Polar
   * still considers it revivable, resume it instead of creating a new
   * checkout. Returns a synthetic `{checkoutId, url}` that points the
   * browser back at `/settings/billing?resumed=...` so the user lands in the
   * billing UI showing the now-active plan/module — no Polar redirect at all.
   * Returns null when no resume is possible; caller falls through to normal
   * checkout creation.
   */
  private async tryResumeCanceledForProduct(
    context: WorkspaceContext,
    productId: string,
    successUrl: string | undefined,
    userId: string
  ): Promise<{ checkoutId: string; url: string } | null> {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.workspaceId, context.workspaceId),
          eq(subscriptions.polarProductId, productId),
          eq(subscriptions.status, "canceled")
        )
      )
      .limit(1)

    const candidate = rows[0]
    if (!candidate?.polarSubscriptionId) {
      return null
    }

    const polar = await this.polarService.getSubscription(
      candidate.polarSubscriptionId
    )
    if (!polar) {
      return null
    }

    // Polar will only reactivate a subscription that is still in an
    // "active-but-scheduled-to-cancel" state. A subscription that was hard
    // revoked (status='canceled' on Polar) is terminal — caller must fall
    // through to a fresh checkout.
    const revivable =
      polar.cancelAtPeriodEnd &&
      (polar.status === "active" || polar.status === "trialing")
    if (!revivable) {
      return null
    }

    await this.polarService.resumeSubscription(candidate.polarSubscriptionId)

    const metadata = await this.polarService.getProductMetadata(productId)
    const effect = resolveEffect(metadata)
    if (!effect) {
      this.logger.warn(
        `Resume: product ${productId} has no Helm effect; subscription will not reactivate locally`
      )
      return null
    }

    const polarShape: PolarSubscriptionShape = {
      id: polar.id,
      customerId: polar.customerId,
      productId: polar.productId,
      // Resuming returns the sub to its prior active state; mirror that.
      status: "active",
      createdAt: polar.createdAt,
      currentPeriodEnd: polar.currentPeriodEnd,
      cancelAtPeriodEnd: false,
    }

    if (effect.kind === "plan") {
      await this.activatePlan(context, effect.plan, polarShape)
    } else if (effect.kind === "module") {
      const moduleId = effect.moduleIds[0]
      if (moduleId) {
        await this.activateModule(context, moduleId, polarShape)
      }
    }

    await this.auditService.writeSystem(context, {
      action: "billing.subscription.resume_via_checkout",
      resourceType: "subscription",
      resourceId: candidate.id,
      metadataJson: {
        productId,
        polarSubscriptionId: candidate.polarSubscriptionId,
        actorUserId: userId,
      },
    })

    const origin = (() => {
      if (!successUrl) return null
      try {
        return new URL(successUrl).origin
      } catch {
        return null
      }
    })()
    const url = origin
      ? `${origin}/settings/billing?resumed=${encodeURIComponent(productId)}`
      : "/settings/billing"

    return {
      checkoutId: `resumed-${candidate.polarSubscriptionId}`,
      url,
    }
  }

  /**
   * Pull the subscription Polar created for this checkout and persist it via
   * the same activatePlan / activateModule paths used by the webhook handler.
   * Idempotent: re-running on an already-synced subscription is a no-op
   * thanks to `upsertSubscription`'s ON CONFLICT logic.
   */
  private async reconcileFromCheckout(
    context: WorkspaceContext,
    checkoutId: string
  ): Promise<void> {
    const polarSubscriptionId =
      await this.polarService.getCheckoutSubscriptionId(checkoutId)
    if (!polarSubscriptionId) {
      return
    }

    const existing = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(eq(subscriptions.polarSubscriptionId, polarSubscriptionId))
      .limit(1)
    if (existing[0] && existing[0].status !== "canceled") {
      return
    }

    const subscription =
      await this.polarService.getSubscription(polarSubscriptionId)
    if (!subscription) {
      return
    }

    const metadata = await this.polarService.getProductMetadata(
      subscription.productId
    )
    const effect = resolveEffect(metadata)
    if (!effect) {
      this.logger.warn(
        `Reconcile: product ${subscription.productId} has no Helm effect`
      )
      return
    }

    const polar: PolarSubscriptionShape = {
      id: subscription.id,
      customerId: subscription.customerId,
      productId: subscription.productId,
      status: subscription.status,
      createdAt: subscription.createdAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    }

    if (effect.kind === "plan") {
      await this.activatePlan(context, effect.plan, polar)
    } else if (effect.kind === "module") {
      const moduleId = effect.moduleIds[0]
      if (moduleId) {
        await this.activateModule(context, moduleId, polar)
      }
    }
  }

  async cancelSubscription(
    context: AuthContext,
    subscriptionId: string
  ): Promise<CancelSubscriptionResponse> {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.workspaceId, context.workspaceId)
        )
      )
      .limit(1)

    const subscription = rows[0]
    if (!subscription) {
      throw new NotFoundException("Subscription not found")
    }
    if (!subscription.polarSubscriptionId) {
      throw new BadRequestException(
        "Subscription is not linked to a Polar subscription"
      )
    }
    if (subscription.status === "canceled") {
      throw new BadRequestException("Subscription is already canceled")
    }
    if (subscription.cancelAtPeriodEnd) {
      return {
        subscriptionId: subscription.id,
        status: SubscriptionStatusSchema.parse(subscription.status),
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.currentPeriodEnd ?? null,
      }
    }

    await this.polarService.cancelAtPeriodEnd(subscription.polarSubscriptionId)

    const now = new Date()
    await db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: now })
      .where(eq(subscriptions.id, subscription.id))

    await this.auditService.writeSystem(
      { workspaceId: context.workspaceId, tenantId: subscription.tenantId },
      {
        action: "billing.subscription.cancel_at_period_end",
        resourceType: "subscription",
        resourceId: subscription.id,
        metadataJson: {
          productKind: subscription.productKind,
          moduleId: subscription.moduleId,
          polarSubscriptionId: subscription.polarSubscriptionId,
          actorUserId: context.userId,
        },
      }
    )

    return {
      subscriptionId: subscription.id,
      status: SubscriptionStatusSchema.parse(subscription.status),
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    }
  }

  async resumeSubscription(
    context: AuthContext,
    subscriptionId: string
  ): Promise<CancelSubscriptionResponse> {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.workspaceId, context.workspaceId)
        )
      )
      .limit(1)

    const subscription = rows[0]
    if (!subscription) {
      throw new NotFoundException("Subscription not found")
    }
    if (!subscription.polarSubscriptionId) {
      throw new BadRequestException(
        "Subscription is not linked to a Polar subscription"
      )
    }
    if (!subscription.cancelAtPeriodEnd) {
      throw new BadRequestException(
        "Subscription is not scheduled for cancellation"
      )
    }

    await this.polarService.resumeSubscription(subscription.polarSubscriptionId)

    const now = new Date()
    await db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: false, updatedAt: now })
      .where(eq(subscriptions.id, subscription.id))

    await this.auditService.writeSystem(
      { workspaceId: context.workspaceId, tenantId: subscription.tenantId },
      {
        action: "billing.subscription.resume",
        resourceType: "subscription",
        resourceId: subscription.id,
        metadataJson: {
          productKind: subscription.productKind,
          moduleId: subscription.moduleId,
          polarSubscriptionId: subscription.polarSubscriptionId,
          actorUserId: context.userId,
        },
      }
    )

    return {
      subscriptionId: subscription.id,
      status: SubscriptionStatusSchema.parse(subscription.status),
      cancelAtPeriodEnd: false,
      currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    }
  }

  /**
   * Switch the workspace's active plan to a different Polar product. Used
   * when the user upgrades/downgrades between paid tiers — calling Polar's
   * `subscriptions.update` (vs. creating a new checkout) keeps a single
   * subscription per workspace and lets Polar handle proration on its side.
   * `subscribe` (starter → first paid tier) still goes through checkout
   * because there's no subscription to update yet.
   */
  async changePlan(
    context: AuthContext,
    newProductId: string
  ): Promise<{ subscriptionId: string; polarSubscriptionId: string }> {
    const catalog = await this.polarService.listCatalog()
    const target = catalog.find((entry) => entry.productId === newProductId)
    if (!target) {
      throw new NotFoundException("Product not found in catalog")
    }
    if (target.kind !== "plan") {
      throw new BadRequestException("Product is not a plan")
    }

    const rows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.workspaceId, context.workspaceId),
          eq(subscriptions.productKind, "plan")
        )
      )

    const active = rows.find(
      (row) =>
        row.status !== "canceled" &&
        row.status !== "incomplete" &&
        Boolean(row.polarSubscriptionId)
    )
    if (!active?.polarSubscriptionId) {
      throw new BadRequestException(
        "No active plan subscription to change. Use checkout to subscribe."
      )
    }
    if (active.polarProductId === newProductId) {
      throw new BadRequestException("Workspace is already on this plan")
    }

    if (active.cancelAtPeriodEnd) {
      await this.polarService.resumeSubscription(active.polarSubscriptionId)
    }
    await this.polarService.changeSubscriptionProduct(
      active.polarSubscriptionId,
      newProductId
    )

    // Optimistically apply the new product/plan to the DB and entitlements so
    // the UI reflects the change immediately (a follow-up `subscription.updated`
    // webhook will re-assert the same state — idempotent).
    const now = new Date()
    await db
      .update(subscriptions)
      .set({
        polarProductId: newProductId,
        plan: target.plan ?? active.plan,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, active.id))

    if (target.plan && target.plan !== active.plan) {
      await this.applyPlan(
        { workspaceId: context.workspaceId, tenantId: active.tenantId },
        target.plan
      )
    }

    await this.auditService.writeSystem(
      { workspaceId: context.workspaceId, tenantId: active.tenantId },
      {
        action: "billing.subscription.change_plan",
        resourceType: "subscription",
        resourceId: active.id,
        metadataJson: {
          fromProductId: active.polarProductId,
          toProductId: newProductId,
          polarSubscriptionId: active.polarSubscriptionId,
          actorUserId: context.userId,
        },
      }
    )

    return {
      subscriptionId: active.id,
      polarSubscriptionId: active.polarSubscriptionId,
    }
  }

  async createPortal(authContext: AuthContext): Promise<{ url: string }> {
    const email = await this.getUserEmail(
      authContext.userId,
      authContext.workspaceId
    )
    if (!email) {
      throw new BadRequestException(
        "Could not resolve a billing email for this workspace."
      )
    }
    return this.polarService.createCustomerPortal(
      authContext.workspaceId,
      email
    )
  }

  private async getUserEmail(
    userId: string,
    workspaceId: string
  ): Promise<string | undefined> {
    const rows = await db
      .select({ email: userTable.email })
      .from(userTable)
      .innerJoin(member, eq(member.userId, userTable.id))
      .where(
        and(eq(userTable.id, userId), eq(member.organizationId, workspaceId))
      )
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

    // A canceled slot is dead — let any new subscription take it over even
    // if its `polarCreatedAt` doesn't strictly beat the dead row's. Without
    // this, the cancel-now → resubscribe path silently drops the new sub when
    // timestamps don't increase as expected.
    const setWhere = polarCreatedAt
      ? sql`
          ${subscriptions.polarSubscriptionId} = ${polar.id}
          OR ${subscriptions.status} = 'canceled'
          OR ${subscriptions.polarCreatedAt} IS NULL
          OR (${polarCreatedAt}::timestamptz) >= ${subscriptions.polarCreatedAt}
        `
      : sql`
          ${subscriptions.polarSubscriptionId} = ${polar.id}
          OR ${subscriptions.status} = 'canceled'
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

    const amountsByPolarSubId = new Map<
      string,
      Awaited<ReturnType<typeof this.polarService.getLatestSubscriptionAmounts>>
    >()
    const polarIds = rows
      .map((row) => row.polarSubscriptionId)
      .filter((id): id is string => Boolean(id))
    await Promise.all(
      polarIds.map(async (id) => {
        amountsByPolarSubId.set(
          id,
          await this.polarService.getLatestSubscriptionAmounts(id)
        )
      })
    )

    return rows.map((row) => {
      const amounts = row.polarSubscriptionId
        ? amountsByPolarSubId.get(row.polarSubscriptionId)
        : null

      // Validate the DB status; log if invalid and fall back to "incomplete".
      const statusParsed = SubscriptionStatusSchema.safeParse(row.status)
      let status: SubscriptionStatus
      if (statusParsed.success) {
        status = statusParsed.data
      } else {
        this.logger.warn(
          `Invalid subscription status in DB: row ${row.id}, status=${row.status}`
        )
        status = "incomplete"
      }

      return {
        id: row.id,
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        polarCustomerId: row.polarCustomerId,
        polarSubscriptionId: row.polarSubscriptionId,
        polarProductId: row.polarProductId,
        productKind: row.productKind === "module" ? "module" : "plan",
        moduleId: row.moduleId,
        plan:
          row.plan === "pro" || row.plan === "enterprise"
            ? row.plan
            : "starter",
        status,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        subtotalUsdCents: amounts?.subtotalCents ?? null,
        taxUsdCents: amounts?.taxCents ?? null,
        totalUsdCents: amounts?.totalCents ?? null,
        currency: amounts?.currency ?? null,
      }
    })
  }
}
