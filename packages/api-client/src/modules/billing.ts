import {
  BillingCatalogResponseSchema,
  BillingSummaryResponseSchema,
  type CheckoutInput,
  CheckoutInputSchema,
  CheckoutSessionResponseSchema,
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
})

export type BillingModule = ReturnType<typeof createBillingModule>
