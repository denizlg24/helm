import { z } from "zod"

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value)

export const BillingEnvSchema = z.object({
  POLAR_ACCESS_TOKEN: z.string().min(1),
  POLAR_WEBHOOK_SECRET: z.string().min(1),
  POLAR_SERVER: z.preprocess(
    emptyToUndefined,
    z.enum(["sandbox", "production"]).default("production")
  ),

  POLAR_CHECKOUT_SUCCESS_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .url()
      .default("http://localhost:3002/billing/success?checkout={CHECKOUT_ID}")
  ),
  POLAR_PORTAL_RETURN_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default("http://localhost:3002/billing")
  ),
})

export type BillingEnv = z.infer<typeof BillingEnvSchema>
