import {
  BillingCatalogResponseSchema,
  BillingSummaryResponseSchema,
  CancelSubscriptionResponseSchema,
  type ChangePlanInput,
  ChangePlanInputSchema,
  ChangePlanResponseSchema,
  type CheckoutInput,
  CheckoutInputSchema,
  CheckoutSessionResponseSchema,
  CheckoutStatusResponseSchema,
  CustomerPortalResponseSchema,
} from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createBillingModule = ({
  request,
  jsonRequest,
}: HelmApiRequestClient) => ({
  summary: () =>
    request("/api/billing", {}, (value) =>
      BillingSummaryResponseSchema.parse(value)
    ),
  catalog: () =>
    request("/api/billing/catalog", {}, (value) =>
      BillingCatalogResponseSchema.parse(value)
    ),
  checkout: (input: CheckoutInput) =>
    jsonRequest(
      "/api/billing/checkout",
      CheckoutInputSchema.parse(input),
      (value) => CheckoutSessionResponseSchema.parse(value)
    ),
  openPortal: () =>
    jsonRequest("/api/billing/portal", {}, (value) =>
      CustomerPortalResponseSchema.parse(value)
    ),
  checkoutStatus: (checkoutId: string) =>
    request(
      `/api/billing/checkout/${encodeURIComponent(checkoutId)}`,
      {},
      (value) => CheckoutStatusResponseSchema.parse(value)
    ),
  changePlan: (input: ChangePlanInput) =>
    jsonRequest(
      "/api/billing/plan/change",
      ChangePlanInputSchema.parse(input),
      (value) => ChangePlanResponseSchema.parse(value)
    ),
  cancelSubscription: (subscriptionId: string) =>
    jsonRequest(
      `/api/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      {},
      (value) => CancelSubscriptionResponseSchema.parse(value)
    ),
  resumeSubscription: (subscriptionId: string) =>
    jsonRequest(
      `/api/billing/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
      {},
      (value) => CancelSubscriptionResponseSchema.parse(value)
    ),
})

export type BillingModule = ReturnType<typeof createBillingModule>
