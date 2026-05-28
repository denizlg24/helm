import { Injectable, Logger } from "@nestjs/common"
import { Polar } from "@polar-sh/sdk"
import type { BillingCatalogEntry } from "@workspace/types"
import { resolveEffect } from "./billing.catalog"
import { type BillingEnv, BillingEnvSchema } from "./billing.env"

export interface CreateCheckoutParams {
  productId: string
  workspaceId: string
  customerEmail?: string
  successUrl?: string
}

@Injectable()
export class PolarService {
  private readonly logger = new Logger(PolarService.name)
  private client: Polar | null = null
  private config: BillingEnv | null = null

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

  async getProductMetadata(
    productId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const product = await this.getClient().products.get({ id: productId })
      return product.metadata ?? {}
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
    return entries
  }
}
