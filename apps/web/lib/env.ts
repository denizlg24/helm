import { z } from "zod"

const WebEnvSchema = z.object({
  consoleUrl: z.string().url().default("http://localhost:3002"),
})

export const env = WebEnvSchema.parse({
  consoleUrl: process.env.NEXT_PUBLIC_HELM_CONSOLE_URL,
})

export const consoleSignUpHref = `${env.consoleUrl}/sign-up`
