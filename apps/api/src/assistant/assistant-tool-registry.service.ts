import type Anthropic from "@anthropic-ai/sdk"
import { Injectable, type OnModuleInit } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { DiscoveryService } from "@nestjs/core"
import {
  type AssistantToolDeclaration,
  assistantToolDeclarations,
  getAssistantToolDeclaration,
  toInputJsonSchema,
} from "@workspace/assistant-tools"
import type { AuthContext } from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { EntitlementService } from "../entitlements/entitlement.service"
import {
  ASSISTANT_TOOL_METADATA,
  type AssistantServerToolHandler,
  isAssistantToolProvider,
} from "./assistant-tool.types"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : []

// Builds the Anthropic tool definition from a declaration's Zod schema. We pick
// `properties`/`required` explicitly so the top-level `type: "object"` literal
// holds without casting the derived JSON Schema.
const toAnthropicTool = (
  declaration: AssistantToolDeclaration
): Anthropic.Tool => {
  const json = toInputJsonSchema(declaration)
  const input_schema: Anthropic.Tool.InputSchema = {
    type: "object",
    properties: isRecord(json.properties) ? json.properties : {},
  }
  const required = toStringArray(json.required)
  if (required.length > 0) input_schema.required = required
  return {
    name: declaration.name,
    description: declaration.description,
    input_schema,
  }
}

// Collects server tool handlers contributed by feature modules (seam A) and
// exposes the per-turn tool manifest. Client tools have no handler — they are
// surfaced to the model but executed by the client and resolved via the
// suspension flow.
@Injectable()
export class AssistantToolRegistry implements OnModuleInit {
  private readonly handlers = new Map<string, AssistantServerToolHandler>()

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly entitlementService: EntitlementService
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const { instance, metatype } = wrapper
      if (!instance || !metatype) continue
      if (!Reflect.getMetadata(ASSISTANT_TOOL_METADATA, metatype)) continue
      if (!isAssistantToolProvider(instance)) continue
      for (const handler of instance.assistantTools()) {
        if (!getAssistantToolDeclaration(handler.name)) {
          throw new Error(
            `Assistant tool handler "${handler.name}" has no declaration in @workspace/assistant-tools`
          )
        }
        if (this.handlers.has(handler.name)) {
          throw new Error(`Duplicate assistant tool handler: ${handler.name}`)
        }
        this.handlers.set(handler.name, handler)
      }
    }
  }

  getServerHandler(name: string): AssistantServerToolHandler | undefined {
    return this.handlers.get(name)
  }

  // Declarations exposed to the model this turn: every client tool plus every
  // server tool that has a bound handler, filtered by module entitlements.
  async availableDeclarations(
    actor: AuthContext
  ): Promise<AssistantToolDeclaration[]> {
    const baseDeclarations = assistantToolDeclarations.filter(
      (declaration) =>
        declaration.side === "client" || this.handlers.has(declaration.name)
    )

    const filtered: AssistantToolDeclaration[] = []
    for (const declaration of baseDeclarations) {
      // Check if the actor's workspace has the module enabled
      const hasModule = await this.entitlementService.hasFeature(
        actor.workspaceId,
        declaration.moduleId
      )
      if (hasModule) {
        filtered.push(declaration)
      }
    }
    return filtered
  }

  async toolDefinitions(actor: AuthContext): Promise<Anthropic.Tool[]> {
    const declarations = await this.availableDeclarations(actor)
    return declarations.map(toAnthropicTool)
  }
}
