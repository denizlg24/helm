import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import { z } from "zod"
import * as schema from "./schema"

const { Pool } = pg

export const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
})

const env = DatabaseEnvSchema.parse(process.env)

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })

export { and, eq, isNull, or } from "drizzle-orm"
export * from "./schema"
