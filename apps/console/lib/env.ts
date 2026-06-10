import { z } from "zod"

const ConsoleEnvSchema = z.object({
  webUrl: z.string().url().default("http://localhost:3000"),
})

export const env = ConsoleEnvSchema.parse({
  webUrl: process.env.NEXT_PUBLIC_HELM_WEB_URL,
})
