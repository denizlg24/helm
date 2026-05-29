import {
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { Polar } from "@polar-sh/sdk"
import type {
  BillingCatalogEntry,
  CheckoutStatus,
  CheckoutStatusResponse,
} from "@workspace/types"
import { resolveEffect } from "./billing.catalog"
import { type BillingEnv, BillingEnvSchema } from "./billing.env"

export interface CreateCheckoutParams {
  productId: string
  workspaceId: string
  customerEmail?: string
  successUrl?: string
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const CACHE_TTL_MS = {
  // Order amounts (incl. tax) change at most once per renewal — 60s avoids
  // hammering Polar on every billing summary load without leaving stale data
  // on screen for long after a webhook-driven change.
  subscriptionAmounts: 60_000,
  // Catalog and product metadata are configuration-style data; safe to cache
  // longer. Webhook handlers invalidate explicitly on product mutations.
  catalog: 5 * 60_000,
  productMetadata: 5 * 60_000,
} as const

@Injectable()
export class PolarService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PolarService.name)
  private client: Polar | null = null
  private config: BillingEnv | null = null
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  private cleanupTimer: NodeJS.Timeout | null = null

  onModuleInit(): void {
    // Clean up expired cache entries every 60 seconds to prevent unbounded growth.
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key)
        }
      }
    }, 60_000)
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private cacheGet<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  private cacheSet<T>(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  invalidateCache(key: string): void {
    this.cache.delete(key)
  }

  invalidateSubscriptionAmounts(polarSubscriptionId: string): void {
    this.cache.delete(`subAmounts:${polarSubscriptionId}`)
  }

  invalidateCatalog(): void {
    this.cache.delete("catalog")
  }

  private getConfig(): BillingEnv {
    if (this.config) {
      return this.config
    }
    const parsed = BillingEnvSchema.safeParse(process.env)
    if (!parsed.success) {
      throw new Error(
        `Polar billing is not configured: ${parsed.error.message}`
      )
    }
    this.config = parsed.data
    return this.config
  }

  private getClient(): Polar {
    if (this.client) {
      return this.client
    }
    const config = this.getConfig()
    this.client = new Polar({
      accessToken: config.POLAR_ACCESS_TOKEN,
      server: config.POLAR_SERVER,
    })
    return this.client
  }

  getWebhookSecret(): string {
    return this.getConfig().POLAR_WEBHOOK_SECRET
  }

  async createCheckout(params: CreateCheckoutParams): Promise<{
    checkoutId: string
    expiresAt: Date
    url: string
  }> {
    const config = this.getConfig()
    // externalCustomerId = workspaceId: billing, subscriptions and entitlements
    // are all workspace-scoped, so the workspace is the Polar customer.
    const result = await this.getClient().checkouts.create({
      products: [params.productId],
      externalCustomerId: params.workspaceId,
      customerEmail: params.customerEmail,
      successUrl: params.successUrl ?? config.POLAR_CHECKOUT_SUCCESS_URL,
      metadata: { workspaceId: params.workspaceId },
    })
    return {
      checkoutId: result.id,
      expiresAt: new Date(result.expiresAt),
      url: result.url,
    }
  }

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResponse> {
    try {
      const checkout = await this.getClient().checkouts.get({ id: checkoutId })
      const product = checkout.products?.[0] ?? null
      return {
        checkoutId: checkout.id,
        status: this.normalizeCheckoutStatus(checkout.status),
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        url: checkout.url,
      }
    } catch (error) {
      if (this.isCustomerNotFound(error)) {
        throw new NotFoundException(`Checkout ${checkoutId} not found`)
      }
      throw error
    }
  }

  /**
   * Return the Polar subscription id linked to a completed checkout, if any.
   * Used by the reconciliation path on checkout return so we can repair the
   * DB even when the webhook never reached us (local dev without a tunnel)
   * or when an order/subscription couldn't slot in cleanly on first try.
   */
  async getCheckoutSubscriptionId(checkoutId: string): Promise<string | null> {
    try {
      const checkout = await this.getClient().checkouts.get({ id: checkoutId })
      return checkout.subscriptionId ?? null
    } catch (error) {
      this.logger.warn(
        `Failed to fetch checkout ${checkoutId}: ${String(error)}`
      )
      return null
    }
  }

  async getSubscription(polarSubscriptionId: string): Promise<{
    id: string
    productId: string
    customerId: string
    customerExternalId: string | null
    status: string
    createdAt: Date
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  } | null> {
    try {
      const sub = await this.getClient().subscriptions.get({
        id: polarSubscriptionId,
      })
      return {
        id: sub.id,
        productId: sub.productId,
        customerId: sub.customerId,
        customerExternalId: sub.customer?.externalId ?? null,
        status: sub.status,
        createdAt: sub.createdAt,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch subscription ${polarSubscriptionId}: ${String(error)}`
      )
      return null
    }
  }

  private normalizeCheckoutStatus(status: unknown): CheckoutStatus {
    switch (status) {
      case "open":
      case "expired":
      case "confirmed":
      case "succeeded":
      case "failed":
        return status
      default:
        this.logger.warn(
          `Unknown checkout status from Polar: ${JSON.stringify(status)}`
        )
        return "open"
    }
  }

  async cancelAtPeriodEnd(polarSubscriptionId: string): Promise<void> {
    try {
      await this.getClient().subscriptions.update({
        id: polarSubscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: true },
      })
      this.invalidateSubscriptionAmounts(polarSubscriptionId)
    } catch (error) {
      this.logger.warn(
        `Polar cancel-at-period-end failed for subscription ${polarSubscriptionId}: ${String(error)}`
      )
      throw error
    }
  }

  /**
   * Undo a scheduled cancellation. Polar accepts `cancelAtPeriodEnd: false`
   * on an otherwise-active subscription to resume normal renewal. Used when
   * the user clicks "Keep plan" after scheduling cancellation (either here
   * or via the customer portal).
   */
  /**
   * Wipe the Polar customer for this workspace. Used after a hard cancel
   * leaves the workspace with no live subscriptions — Polar otherwise keeps
   * the customer (with its canceled subscription history) around and refuses
   * to create a fresh subscription of the same product, so the next checkout
   * silently no-ops. Deleting and recreating the customer gives a clean
   * slate. Best-effort: a 404 (already gone) is treated as success.
   */
  async deleteCustomerByExternalId(workspaceId: string): Promise<void> {
    try {
      await this.getClient().customers.deleteExternal({
        externalId: workspaceId,
      })
    } catch (error) {
      if (this.isCustomerNotFound(error)) {
        return
      }
      this.logger.warn(
        `Polar customer delete failed for workspace ${workspaceId}: ${String(error)}`
      )
      throw error
    }
  }

  async resumeSubscription(polarSubscriptionId: string): Promise<void> {
    try {
      await this.getClient().subscriptions.update({
        id: polarSubscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: false },
      })
      this.invalidateSubscriptionAmounts(polarSubscriptionId)
    } catch (error) {
      this.logger.warn(
        `Polar resume failed for subscription ${polarSubscriptionId}: ${String(error)}`
      )
      throw error
    }
  }

  async createCustomerPortal(
    workspaceId: string,
    customerEmail: string
  ): Promise<{ url: string }> {
    const config = this.getConfig()
    const client = this.getClient()

    try {
      const session = await client.customerSessions.create({
        externalCustomerId: workspaceId,
        returnUrl: config.POLAR_PORTAL_RETURN_URL,
      })
      return { url: session.customerPortalUrl }
    } catch (error) {
      if (!this.isCustomerNotFound(error)) {
        throw error
      }
      this.logger.log(
        `Lazy-creating Polar customer for workspace ${workspaceId}`
      )
      await this.ensureCustomer(workspaceId, customerEmail)
      const session = await client.customerSessions.create({
        externalCustomerId: workspaceId,
        returnUrl: config.POLAR_PORTAL_RETURN_URL,
      })
      return { url: session.customerPortalUrl }
    }
  }

  private async ensureCustomer(
    workspaceId: string,
    email: string
  ): Promise<void> {
    try {
      await this.getClient().customers.create({
        email,
        externalId: workspaceId,
        metadata: { workspaceId },
      })
    } catch (error) {
      // 409 / already-exists is fine — another flow created it concurrently.
      if (!this.isAlreadyExists(error)) {
        throw error
      }
    }
  }

  private isCustomerNotFound(error: unknown): boolean {
    const status = this.getStatus(error)
    if (status === 404) return true
    const message = this.getMessage(error).toLowerCase()
    return (
      message.includes("does not exist") ||
      message.includes("not found") ||
      message.includes("resourcenotfound")
    )
  }

  private isAlreadyExists(error: unknown): boolean {
    const status = this.getStatus(error)
    if (status === 409 || status === 422) return true
    const message = this.getMessage(error).toLowerCase()
    return message.includes("already exists")
  }

  private getStatus(error: unknown): number | null {
    if (typeof error !== "object" || error === null) return null
    const candidate = error as { statusCode?: unknown; status?: unknown }
    const value = candidate.statusCode ?? candidate.status
    return typeof value === "number" ? value : null
  }

  private getMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === "string") return error
    return String(error)
  }

  /**
   * Fetch the most recent paid order for a Polar subscription. Returns the
   * actual paid amounts (incl. tax) so the UI can show what the user is being
   * charged, not just the catalog price. Returns null when no invoice has been
   * emitted yet (e.g., trial, or first period not yet billed) or when the call
   * fails — callers should fall back to the catalog price excl. tax.
   */
  async getLatestSubscriptionAmounts(polarSubscriptionId: string): Promise<{
    subtotalCents: number
    taxCents: number
    totalCents: number
    currency: string
  } | null> {
    const cacheKey = `subAmounts:${polarSubscriptionId}`
    const cached = this.cacheGet<{
      subtotalCents: number
      taxCents: number
      totalCents: number
      currency: string
    } | null>(cacheKey)
    if (cached !== undefined) return cached

    try {
      const pages = this.getClient().orders.list({
        subscriptionId: polarSubscriptionId,
        sorting: ["-created_at"],
        limit: 1,
      })
      const iterator = pages[Symbol.asyncIterator]()
      const firstPage = await iterator.next()

      if (firstPage.done || !firstPage.value) {
        this.cacheSet(cacheKey, null, CACHE_TTL_MS.subscriptionAmounts)
        return null
      }

      const order = firstPage.value.result.items[0]
      if (!order) {
        this.cacheSet(cacheKey, null, CACHE_TTL_MS.subscriptionAmounts)
        return null
      }

      const value = {
        subtotalCents: order.subtotalAmount,
        taxCents: order.taxAmount,
        totalCents: order.totalAmount,
        currency: order.currency,
      }
      this.cacheSet(cacheKey, value, CACHE_TTL_MS.subscriptionAmounts)
      return value
    } catch (error) {
      this.logger.warn(
        `Failed to fetch latest order for subscription ${polarSubscriptionId}: ${String(error)}`
      )
      return null
    }
  }

  /**
   * Switch an existing Polar subscription to a different product (plan/module
   * upgrade or downgrade) instead of creating a parallel subscription. Polar
   * emits a `subscription.updated` webhook on success — the existing handler
   * persists the new product/plan, so this method only triggers the change.
   */
  async changeSubscriptionProduct(
    polarSubscriptionId: string,
    newProductId: string,
    prorationBehavior:
      | "invoice"
      | "prorate"
      | "next_period"
      | "reset" = "invoice"
  ): Promise<void> {
    try {
      await this.getClient().subscriptions.update({
        id: polarSubscriptionId,
        subscriptionUpdate: {
          productId: newProductId,
          prorationBehavior,
        },
      })
      this.invalidateSubscriptionAmounts(polarSubscriptionId)
    } catch (error) {
      this.logger.warn(
        `Polar product change failed for subscription ${polarSubscriptionId} → ${newProductId}: ${String(error)}`
      )
      throw error
    }
  }

  async getProductMetadata(
    productId: string
  ): Promise<Record<string, unknown> | null> {
    const cacheKey = `productMeta:${productId}`
    const cached = this.cacheGet<Record<string, unknown> | null>(cacheKey)
    if (cached !== undefined) return cached

    try {
      const product = await this.getClient().products.get({ id: productId })
      const value = product.metadata ?? {}
      this.cacheSet(cacheKey, value, CACHE_TTL_MS.productMetadata)
      return value
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Polar product ${productId}: ${String(error)}`
      )
      return null
    }
  }

  /**
   * List all Helm-tagged Polar products (resolved from metadata) so the app can
   * render a pricing/module page and check out with the right productId — no
   * product IDs hardcoded in the app. Returns [] until products exist in Polar.
   */
  async listCatalog(): Promise<BillingCatalogEntry[]> {
    const cached = this.cacheGet<BillingCatalogEntry[]>("catalog")
    if (cached !== undefined) return cached

    const entries: BillingCatalogEntry[] = []
    const pages = await this.getClient().products.list({ isArchived: false })
    for await (const page of pages) {
      for (const product of page.result.items) {
        const effect = resolveEffect(product.metadata)
        if (!effect) {
          continue
        }

        let priceUsdCents: number | null = null
        for (const price of product.prices) {
          if (
            "amountType" in price &&
            price.amountType === "fixed" &&
            "priceAmount" in price &&
            typeof price.priceAmount === "number" &&
            "priceCurrency" in price &&
            typeof price.priceCurrency === "string" &&
            price.priceCurrency.toLowerCase() === "usd"
          ) {
            priceUsdCents = price.priceAmount
            break
          }
        }

        entries.push({
          productId: product.id,
          name: product.name,
          kind: effect.kind,
          plan: effect.kind === "plan" ? effect.plan : null,
          moduleId:
            effect.kind === "module" ? (effect.moduleIds[0] ?? null) : null,
          priceUsdCents,
          recurring: product.isRecurring,
        })
      }
    }
    this.cacheSet("catalog", entries, CACHE_TTL_MS.catalog)
    return entries
  }
}
