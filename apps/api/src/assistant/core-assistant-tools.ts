import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { type Model, Schema } from "mongoose"
import { z } from "zod"
import type { MongoService } from "../mongo/mongo.service"
import {
  type AssistantServerToolHandler,
  type AssistantToolProvider,
  RegisterAssistantTools,
} from "./assistant-tool.types"

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

// Handlers for the always-on `assistant` module tools. Schemas/risk/side live
// in `@workspace/assistant-tools`; this only binds execution.
@RegisterAssistantTools()
@Injectable()
export class CoreAssistantToolProvider implements AssistantToolProvider {
  assistantTools(): AssistantServerToolHandler[] {
    return [
      {
        name: "get_current_datetime",
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
            return JSON.stringify({
              iso: now.toISOString(),
              formatted,
              timeZone,
            })
          } catch {
            return JSON.stringify({
              iso: now.toISOString(),
              formatted: now.toUTCString(),
              timeZone: "UTC",
            })
          }
        },
      },
      {
        name: "remember_fact",
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
      },
      {
        name: "forget_all_facts",
        run: async (ctx) => {
          const result = await factsModel(ctx.mongo)
            .deleteMany({ workspaceId: ctx.actor.workspaceId })
            .exec()
          return JSON.stringify({ ok: true, deleted: result.deletedCount })
        },
      },
    ]
  }
}
