import { randomUUID } from "node:crypto"
import type Anthropic from "@anthropic-ai/sdk"
import type { AuthContext } from "@workspace/types"
import { type Model, Schema } from "mongoose"
import { z } from "zod"
import type { MongoService } from "../mongo/mongo.service"

// Risk classifies whether a tool may run without user confirmation. `approval`
// tools (destructive / outward-facing) suspend the turn until the user approves
// — security invariant: delete/send/reboot/publish always require confirmation.
export type AssistantToolRisk = "auto" | "approval"

export interface AssistantToolContext {
  actor: AuthContext
  mongo: MongoService
}

export interface AssistantTool {
  definition: Anthropic.Tool
  risk: AssistantToolRisk
  run: (ctx: AssistantToolContext, input: unknown) => Promise<string>
}

interface FactDoc {
  _id: string
  workspaceId: string
  key: string
  value: string
  updatedAt: Date
}

const factSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false, collection: "assistant_facts" }
)

const factsModel = (mongo: MongoService): Model<FactDoc> => {
  const connection = mongo.getConnection()
  try {
    return connection.model<FactDoc>("AssistantFact")
  } catch {
    return connection.model<FactDoc>("AssistantFact", factSchema)
  }
}

const getCurrentDatetime: AssistantTool = {
  risk: "auto",
  definition: {
    name: "get_current_datetime",
    description:
      "Returns the current date and time. Use when the user asks about today, the current time, or to ground date-relative reasoning.",
    input_schema: {
      type: "object",
      properties: {
        timeZone: {
          type: "string",
          description:
            "IANA time zone, e.g. 'Europe/Lisbon'. Defaults to UTC when omitted.",
        },
      },
    },
  },
  run: async (_ctx, input) => {
    const parsed = z
      .object({ timeZone: z.string().min(1).optional() })
      .safeParse(input)
    const timeZone = parsed.success ? parsed.data.timeZone : undefined
    const now = new Date()
    try {
      const formatted = new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: timeZone ?? "UTC",
      }).format(now)
      return JSON.stringify({ iso: now.toISOString(), formatted, timeZone })
    } catch {
      return JSON.stringify({
        iso: now.toISOString(),
        formatted: now.toUTCString(),
        timeZone: "UTC",
      })
    }
  },
}

const rememberFact: AssistantTool = {
  risk: "auto",
  definition: {
    name: "remember_fact",
    description:
      "Persist a small preference or fact about the user for future conversations (e.g. 'timezone' -> 'Europe/Lisbon'). Overwrites an existing fact with the same key.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Short identifier for the fact." },
        value: { type: "string", description: "The fact to remember." },
      },
      required: ["key", "value"],
    },
  },
  run: async (ctx, input) => {
    const { key, value } = z
      .object({
        key: z.string().min(1).max(120),
        value: z.string().min(1).max(2000),
      })
      .parse(input)
    await factsModel(ctx.mongo)
      .updateOne(
        { workspaceId: ctx.actor.workspaceId, key },
        {
          $set: { value, updatedAt: new Date() },
          $setOnInsert: { _id: randomUUID() },
        },
        { upsert: true }
      )
      .exec()
    return JSON.stringify({ ok: true, key })
  },
}

const forgetFacts: AssistantTool = {
  risk: "approval",
  definition: {
    name: "forget_all_facts",
    description:
      "Permanently delete every remembered fact and preference for this workspace. Destructive and irreversible.",
    input_schema: { type: "object", properties: {} },
  },
  run: async (ctx) => {
    const result = await factsModel(ctx.mongo)
      .deleteMany({ workspaceId: ctx.actor.workspaceId })
      .exec()
    return JSON.stringify({ ok: true, deleted: result.deletedCount })
  },
}

const REGISTRY: ReadonlyMap<string, AssistantTool> = new Map(
  [getCurrentDatetime, rememberFact, forgetFacts].map((tool) => [
    tool.definition.name,
    tool,
  ])
)

export const getAssistantTool = (name: string): AssistantTool | undefined =>
  REGISTRY.get(name)

export const getAssistantToolDefinitions = (): Anthropic.Tool[] =>
  [...REGISTRY.values()].map((tool) => tool.definition)
