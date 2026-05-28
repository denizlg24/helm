import {
  UsageBreakdownResponseSchema,
  UsageSummarySchema,
} from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createUsageModule = ({ request }: HelmApiRequestClient) => ({
  summary: () =>
    request("/api/usage", {}, (value) => UsageSummarySchema.parse(value)),
  breakdown: () =>
    request("/api/usage/breakdown", {}, (value) =>
      UsageBreakdownResponseSchema.parse(value)
    ),
})

export type UsageModule = ReturnType<typeof createUsageModule>
