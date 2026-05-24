import { Injectable, Logger } from "@nestjs/common"
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks"
import { db, eq, polarWebhookEvents } from "@workspace/db"
import { type BillingEffect, resolveEffect } from "./billing.catalog"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { BillingService, type WorkspaceContext } from "./billing.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { PolarService } from "./polar.service"

type PolarEvent = ReturnType<typeof validateEvent>

interface PolarSubscriptionData {
  id: string
  productId: string
  status: string
  customerId?: string | null
  createdAt?: Date | null
  currentPeriodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
  customer?: { externalId?: string | null } | null
}

interface PolarOrderData {
  id: string
  productId: string | null
  customer?: { externalId?: string | null } | null
}

export class InvalidWebhookSignatureError extends Error {}

@Injectable()
export class PolarWebhookService {
  private readonly logger = new Logger(PolarWebhookService.name)

  constructor(
    private readonly polarService: PolarService,
    private readonly billingService: BillingService
  ) {}

  verify(rawBody: string, headers: Record<string, string>): PolarEvent {
    try {
      return validateEvent(
        rawBody,
        headers,
        this.polarService.getWebhookSecret()
      )
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        throw new InvalidWebhookSignatureError(error.message)
      }
      throw error
    }
  }

  /**
   * Claim a webhook delivery for processing. Returns false if this `webhook-id`
   * was already processed (Standard Webhooks redelivery) — idempotency guard.
   */
  private async claim(webhookId: string, eventType: string): Promise<boolean> {
    const result = await db
      .insert(polarWebhookEvents)
      .values({ webhookId, eventType })
      .onConflictDoNothing({ target: polarWebhookEvents.webhookId })

    return Boolean(result.rowCount && result.rowCount > 0)
  }

  async dispatch(webhookId: string, event: PolarEvent): Promise<void> {
    const claimed = await this.claim(webhookId, event.type)
    if (!claimed) {
      this.logger.log(`Skipping already-processed webhook ${webhookId}`)
      return
    }

    try {
      await this.route(event)
    } catch (error) {
      // Release the claim so Polar's retry can reprocess this delivery.
      await db
        .delete(polarWebhookEvents)
        .where(eq(polarWebhookEvents.webhookId, webhookId))
      throw error
    }
  }

  private async route(event: PolarEvent): Promise<void> {
    switch (event.type) {
      // A workspace holds one subscription per product (base plan + one per
      // paid module). created/updated/active/canceled all "sync" the row and
      // (re)apply the effect; only `revoked` tears it down.
      case "subscription.created":
      case "subscription.updated":
      case "subscription.active":
      case "subscription.canceled":
        await this.syncSubscription(event.data)
        break
      case "subscription.revoked":
        await this.revokeSubscription(event.data)
        break
      case "order.paid":
        await this.handleOrderPaid(event.data)
        break
      default:
        this.logger.debug(`Unhandled Polar event: ${event.type}`)
    }
  }

  private async resolveContext(
    externalCustomerId: string | null | undefined,
    label: string
  ): Promise<WorkspaceContext | null> {
    const context =
      await this.billingService.resolveWorkspace(externalCustomerId)
    if (!context) {
      this.logger.warn(
        `${label}: no workspace for externalCustomerId ${externalCustomerId}`
      )
    }
    return context
  }

  private async effectForProduct(
    productId: string
  ): Promise<BillingEffect | null> {
    const metadata = await this.polarService.getProductMetadata(productId)
    return resolveEffect(metadata)
  }

  private async syncSubscription(
    subscription: PolarSubscriptionData
  ): Promise<void> {
    const context = await this.resolveContext(
      subscription.customer?.externalId,
      "subscription.sync"
    )
    if (!context) {
      return
    }
    const effect = await this.effectForProduct(subscription.productId)
    if (!effect) {
      this.logger.warn(
        `subscription.sync: product ${subscription.productId} has no helm metadata`
      )
      return
    }
    if (effect.kind === "plan") {
      await this.billingService.activatePlan(context, effect.plan, subscription)
    } else if (effect.kind === "module") {
      for (const moduleId of effect.moduleIds) {
        await this.billingService.activateModule(
          context,
          moduleId,
          subscription
        )
      }
    }
  }

  private async revokeSubscription(
    subscription: PolarSubscriptionData
  ): Promise<void> {
    const context = await this.resolveContext(
      subscription.customer?.externalId,
      "subscription.revoked"
    )
    if (!context) {
      return
    }
    const effect = await this.effectForProduct(subscription.productId)
    if (!effect) {
      return
    }
    if (effect.kind === "plan") {
      await this.billingService.revokePlan(context, subscription)
    } else if (effect.kind === "module") {
      for (const moduleId of effect.moduleIds) {
        await this.billingService.revokeModule(context, moduleId, subscription)
      }
    }
  }

  private async handleOrderPaid(order: PolarOrderData): Promise<void> {
    if (!order.productId) {
      return
    }
    const context = await this.resolveContext(
      order.customer?.externalId,
      "order.paid"
    )
    if (!context) {
      return
    }
    const effect = await this.effectForProduct(order.productId)
    // Plans and modules are recurring (subscription.* events); orders only
    // carry the one-time credit top-up effect.
    if (effect?.kind !== "credits") {
      return
    }
    await this.billingService.grantCredits(
      context,
      effect.amountUsdCents,
      order.id
    )
  }
}
