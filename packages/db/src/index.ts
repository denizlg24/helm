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

export {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  sum,
} from "drizzle-orm"
export * from "./schema"
