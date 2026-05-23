import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Config } from "drizzle-kit"
import { z } from "zod"

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env")
process.loadEnvFile(envPath)

const DrizzleEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
})

const env = DrizzleEnvSchema.parse(process.env)

export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
} satisfies Config
