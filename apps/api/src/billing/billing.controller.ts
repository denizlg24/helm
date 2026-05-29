import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from "@nestjs/common"
import {
  type AuthContext,
  type ChangePlanInput,
  ChangePlanInputSchema,
  type CheckoutInput,
  CheckoutInputSchema,
  CheckoutIdParamSchema,
  SubscriptionIdParamSchema,
} from "@workspace/types"
import {
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { BillingService } from "./billing.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { PolarService } from "./polar.service"

@Controller("api/billing")
@RequireWorkspace()
export class BillingController {
  constructor(
    private readonly polarService: PolarService,
    private readonly billingService: BillingService
  ) {}

  @Get()
  @RequireScopes("billing:read")
  async summary(@CurrentAuthContext() authContext: AuthContext) {
    return this.billingService.getSummary(authContext.workspaceId)
  }

  @Get("catalog")
  @RequireScopes("billing:read")
  async catalog() {
    return { entries: await this.polarService.listCatalog() }
  }

  @Post("checkout")
  @RequireScopes("billing:write")
  async checkout(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: CheckoutInput
  ) {
    const input = CheckoutInputSchema.parse(body)
    const productId = input.productId ?? input.productIds?.[0]
    if (!productId) {
      throw new BadRequestException("At least one product must be provided")
    }
    return this.billingService.createCheckout(authContext, {
      productId,
      userId: authContext.userId,
      successUrl: input.successUrl,
    })
  }

  @Post("portal")
  @RequireScopes("billing:write")
  async portal(@CurrentAuthContext() authContext: AuthContext) {
    return this.billingService.createPortal(authContext)
  }

  @Get("checkout/:checkoutId")
  @RequireScopes("billing:read")
  async checkoutStatus(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("checkoutId") checkoutId: string
  ) {
    const validated = CheckoutIdParamSchema.parse({ checkoutId })
    return this.billingService.getCheckoutStatus(
      authContext.workspaceId,
      validated.checkoutId
    )
  }

  @Post("plan/change")
  @RequireScopes("billing:write")
  async changePlan(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: ChangePlanInput
  ) {
    const input = ChangePlanInputSchema.parse(body)
    return this.billingService.changePlan(authContext, input.productId)
  }

  @Post("subscriptions/:subscriptionId/resume")
  @RequireScopes("billing:write")
  async resumeSubscription(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("subscriptionId") subscriptionId: string
  ) {
    const validated = SubscriptionIdParamSchema.parse({ subscriptionId })
    return this.billingService.resumeSubscription(
      authContext,
      validated.subscriptionId
    )
  }

  @Post("subscriptions/:subscriptionId/cancel")
  @RequireScopes("billing:write")
  async cancelSubscription(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("subscriptionId") subscriptionId: string
  ) {
    const validated = SubscriptionIdParamSchema.parse({ subscriptionId })
    return this.billingService.cancelSubscription(
      authContext,
      validated.subscriptionId
    )
  }
}
