import { SetMetadata } from "@nestjs/common"
import type { AssistantSurfaceContext, AuthContext } from "@workspace/types"
import type { LlmService } from "../llm/llm.service"
import type { MongoService } from "../mongo/mongo.service"

// Context passed to a server tool handler. `surface` is the per-turn page
// context the user sent (current module, open entity, selection). `llm` lets a
// tool make its own model call (e.g. summarization) with budget + usage handled.
export interface AssistantToolHandlerContext {
  actor: AuthContext
  mongo: MongoService
  llm: LlmService
  surface?: AssistantSurfaceContext
}

// Server-side execution for a tool. `name` must match a declaration in
// `@workspace/assistant-tools`; risk/side/schema come from that declaration.
export interface AssistantServerToolHandler {
  name: string
  run: (ctx: AssistantToolHandlerContext, input: unknown) => Promise<string>
}

// A provider contributes one or more server tool handlers. Feature modules
// implement this on a provider and decorate it with `@RegisterAssistantTools()`;
// the assistant registry discovers and collects them at startup (seam A — a
// disabled module simply never registers its provider).
export interface AssistantToolProvider {
  assistantTools(): AssistantServerToolHandler[]
}

export const ASSISTANT_TOOL_METADATA = "assistant:tool-provider"

export const RegisterAssistantTools = (): ClassDecorator =>
  SetMetadata(ASSISTANT_TOOL_METADATA, true)

export const isAssistantToolProvider = (
  value: unknown
): value is AssistantToolProvider =>
  typeof value === "object" &&
  value !== null &&
  "assistantTools" in value &&
  typeof (value as { assistantTools: unknown }).assistantTools === "function"
