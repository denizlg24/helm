import Anthropic from "@anthropic-ai/sdk"
import { HttpException, Injectable, Logger } from "@nestjs/common"
import type { AuthContext, UsageFeature } from "@workspace/types"
import OpenAI, { APIError as OpenAIAPIError } from "openai"
import type { ResponseCreateAndStreamParams } from "openai/lib/responses/ResponseStream"
import type {
  EasyInputMessage,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInput,
  ResponseUsage,
} from "openai/resources/responses/responses"
import { z } from "zod"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { UsageService } from "../usage/usage.service"
import {
  computeAnthropicUsage,
  computeOpenAIUsage,
  DEFAULT_LLM_EFFORT,
  DEFAULT_LLM_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OPENAI_MODEL,
  inferProvider,
  type LlmProvider,
  MAX_TOOL_ITERATIONS,
  type NormalizedUsage,
  supportsAdaptiveThinking,
  supportsOutputEffort,
} from "./llm.constants"

type OpenAIBaseParams = Omit<ResponseCreateParamsNonStreaming, "stream">

const EMPTY_OPENAI_USAGE: ResponseUsage = {
  input_tokens: 0,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 0,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 0,
}

const AnthropicEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
})

const OpenAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
})

export interface LlmCallOptions {
  provider?: LlmProvider
  model?: string
  maxTokens?: number
  system?: string
  effort?: NonNullable<Anthropic.OutputConfig["effort"]>
  thinking?: Anthropic.ThinkingConfigParam
  showThinking?: boolean
  cacheSystem?: boolean
  tools?: Anthropic.ToolUnion[]
  toolChoice?: Anthropic.ToolChoice
  record?: boolean
  enforceBudget?: boolean
  feature?: UsageFeature
}

export interface LlmResult {
  provider: LlmProvider
  model: string
  message: Anthropic.Message | Response
  usage: NormalizedUsage
}

export interface LlmTool {
  definition: Anthropic.Tool
  run: (input: unknown) => Promise<string>
}

export interface LlmToolRunResult extends LlmResult {
  messages: Anthropic.MessageParam[]
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)
  private anthropicClient?: Anthropic
  private openaiClient?: OpenAI

  constructor(private readonly usageService: UsageService) {}

  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      const env = AnthropicEnvSchema.parse(process.env)
      this.anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    }
    return this.anthropicClient
  }

  private getOpenAIClient(): OpenAI {
    if (!this.openaiClient) {
      const env = OpenAIEnvSchema.parse(process.env)
      this.openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY })
    }
    return this.openaiClient
  }

  async complete(
    actor: AuthContext,
    messages: Anthropic.MessageParam[],
    options: LlmCallOptions = {}
  ): Promise<LlmResult> {
    await this.preCheckBudget(actor, options)
    const { provider, model } = this.resolveModel(options)

    if (provider === "openai") {
      const response = await this.runWithErrorMapping(() =>
        this.getOpenAIClient().responses.create(
          this.buildOpenAIParams(messages, model, options)
        )
      )
      const usage = await this.recordOpenAIUsage(
        actor,
        model,
        response,
        options
      )
      return { provider, model, message: response, usage }
    }

    const params = this.buildAnthropicParams(messages, model, options)
    const message = await this.runWithErrorMapping(() =>
      this.getAnthropicClient().messages.stream(params).finalMessage()
    )
    const usage = await this.recordAnthropicUsage(
      actor,
      model,
      message,
      options
    )
    return { provider, model, message, usage }
  }

  async stream(
    actor: AuthContext,
    messages: Anthropic.MessageParam[],
    options: LlmCallOptions = {}
  ) {
    await this.preCheckBudget(actor, options)
    const { provider, model } = this.resolveModel(options)

    if (provider === "openai") {
      const stream = this.getOpenAIClient().responses.stream(
        this.buildOpenAIStreamParams(messages, model, options)
      )
      if (options.record !== false) {
        stream.on("response.completed", (event) => {
          void this.recordOpenAIUsage(
            actor,
            model,
            event.response,
            options
          ).catch((error: unknown) => {
            this.logger.error(
              `Failed to record streamed OpenAI usage for workspace ${actor.workspaceId}`,
              error instanceof Error ? error.stack : undefined
            )
          })
        })
        stream.on("error", (error) => {
          if (error instanceof Error) {
            this.logger.error(
              `OpenAI stream failed for workspace ${actor.workspaceId}`,
              error.stack
            )
          }
        })
      }
      return stream
    }

    const stream = this.getAnthropicClient().messages.stream(
      this.buildAnthropicParams(messages, model, options)
    )
    if (options.record !== false) {
      stream.on("finalMessage", async (message) => {
        try {
          await this.recordAnthropicUsage(actor, model, message, options)
        } catch (error) {
          this.logger.error(
            `Failed to record streamed Anthropic usage for workspace ${actor.workspaceId}`,
            error instanceof Error ? error.stack : undefined
          )
        }
      })
    }
    return stream
  }

  // Anthropic-only streaming with the precise SDK stream type returned, so
  // callers driving a streaming tool loop can iterate raw events and await
  // `finalMessage()` without union narrowing. Budget + usage are still enforced.
  async streamAnthropic(
    actor: AuthContext,
    messages: Anthropic.MessageParam[],
    options: LlmCallOptions = {}
  ) {
    await this.preCheckBudget(actor, options)
    const { model } = this.resolveModel({ ...options, provider: "anthropic" })
    const stream = this.getAnthropicClient().messages.stream(
      this.buildAnthropicParams(messages, model, options)
    )
    if (options.record !== false) {
      stream.on("finalMessage", (message) => {
        void this.recordAnthropicUsage(actor, model, message, options).catch(
          (error: unknown) => {
            this.logger.error(
              `Failed to record streamed Anthropic usage for workspace ${actor.workspaceId}`,
              error instanceof Error ? error.stack : undefined
            )
          }
        )
      })
    }
    return stream
  }

  async runTools(
    actor: AuthContext,
    messages: Anthropic.MessageParam[],
    tools: LlmTool[],
    options: LlmCallOptions = {}
  ): Promise<LlmToolRunResult> {
    await this.preCheckBudget(actor, options)
    const { provider, model } = this.resolveModel(options)
    if (provider !== "anthropic") {
      throw new HttpException(
        {
          code: "LLM_PROVIDER_UNSUPPORTED",
          message: "Tool loops are currently implemented for Anthropic only",
        },
        400
      )
    }

    const toolDefinitions = tools.map((tool) => tool.definition)
    const working: Anthropic.MessageParam[] = [...messages]
    const client = this.getAnthropicClient()
    const totals: NormalizedUsage = {
      inputTokens: 0,
      outputTokens: 0,
      costUsdCents: 0,
    }
    let final: Anthropic.Message | undefined

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const params = this.buildAnthropicParams(working, model, {
        ...options,
        tools: toolDefinitions,
        enforceBudget: false,
      })
      const message = await this.runWithErrorMapping(() =>
        client.messages.stream(params).finalMessage()
      )
      final = message

      const usage = await this.recordAnthropicUsage(
        actor,
        model,
        message,
        options
      )
      totals.inputTokens += usage.inputTokens
      totals.outputTokens += usage.outputTokens
      totals.costUsdCents += usage.costUsdCents

      working.push({ role: "assistant", content: message.content })

      if (message.stop_reason === "pause_turn") {
        continue
      }
      if (message.stop_reason !== "tool_use") {
        break
      }

      const toolUses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      )
      if (toolUses.length === 0) {
        break
      }

      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUses) {
        const tool = tools.find((t) => t.definition.name === block.name)
        if (!tool) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          })
          continue
        }
        try {
          const output = await tool.run(block.input)
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: output,
          })
        } catch (error) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content:
              error instanceof Error ? error.message : "Tool execution failed",
            is_error: true,
          })
        }
      }

      working.push({ role: "user", content: results })
    }

    if (!final) {
      throw new HttpException(
        { code: "LLM_NO_RESPONSE", message: "No response from model" },
        502
      )
    }

    return { provider, model, message: final, usage: totals, messages: working }
  }

  private buildAnthropicParams(
    messages: Anthropic.MessageParam[],
    model: string,
    options: LlmCallOptions
  ): Anthropic.MessageStreamParams {
    const adaptiveOk = supportsAdaptiveThinking(model)
    let thinking: Anthropic.ThinkingConfigParam | undefined = options.thinking
    if (!thinking && adaptiveOk) {
      thinking = {
        type: "adaptive",
        display: options.showThinking ? "summarized" : "omitted",
      }
    }
    // Drop adaptive thinking the model can't honor rather than 400.
    if (thinking?.type === "adaptive" && !adaptiveOk) {
      thinking = undefined
    }

    const outputConfig: Anthropic.OutputConfig | undefined =
      supportsOutputEffort(model)
        ? { effort: options.effort ?? DEFAULT_LLM_EFFORT }
        : undefined

    const system: string | Anthropic.TextBlockParam[] | undefined =
      options.cacheSystem && options.system
        ? [
            {
              type: "text",
              text: options.system,
              cache_control: { type: "ephemeral" },
            },
          ]
        : options.system

    return {
      model,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
      ...(thinking ? { thinking } : {}),
      ...(outputConfig ? { output_config: outputConfig } : {}),
      ...(system !== undefined ? { system } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
    }
  }

  private buildOpenAIParams(
    messages: Anthropic.MessageParam[],
    model: string,
    options: LlmCallOptions
  ): OpenAIBaseParams {
    return {
      model,
      input: this.toOpenAIInput(messages),
      max_output_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(options.system !== undefined ? { instructions: options.system } : {}),
    }
  }

  private buildOpenAIStreamParams(
    messages: Anthropic.MessageParam[],
    model: string,
    options: LlmCallOptions
  ): ResponseCreateAndStreamParams {
    return {
      ...this.buildOpenAIParams(messages, model, options),
      stream: true,
    }
  }

  private toOpenAIInput(messages: Anthropic.MessageParam[]): ResponseInput {
    return messages.map((message): EasyInputMessage => {
      const content = this.toOpenAIText(message.content)
      return { role: message.role, content }
    })
  }

  private toOpenAIText(content: Anthropic.MessageParam["content"]): string {
    if (typeof content === "string") {
      return content
    }

    const textParts: string[] = []
    for (const block of content) {
      if (block.type === "text") {
        textParts.push(block.text)
      }
    }

    if (textParts.length === 0) {
      throw new HttpException(
        {
          code: "LLM_INPUT_UNSUPPORTED",
          message: "OpenAI calls currently support text message content only",
        },
        400
      )
    }

    return textParts.join("\n")
  }

  private async preCheckBudget(actor: AuthContext, options: LlmCallOptions) {
    if (options.enforceBudget !== false) {
      await this.usageService.assertWithinBudget(actor.workspaceId)
    }
  }

  private resolveModel(options: LlmCallOptions): {
    provider: LlmProvider
    model: string
  } {
    if (options.provider === "openai") {
      return {
        provider: "openai",
        model: options.model ?? DEFAULT_OPENAI_MODEL,
      }
    }

    const model = options.model ?? DEFAULT_LLM_MODEL
    return {
      provider: options.provider ?? inferProvider(model),
      model,
    }
  }

  private async recordAnthropicUsage(
    actor: AuthContext,
    model: string,
    message: Anthropic.Message,
    options: LlmCallOptions
  ): Promise<NormalizedUsage> {
    const usage = computeAnthropicUsage(model, message.usage)
    await this.recordNormalizedUsage(actor, "anthropic", model, usage, options)
    return usage
  }

  private async recordOpenAIUsage(
    actor: AuthContext,
    model: string,
    response: Response,
    options: LlmCallOptions
  ): Promise<NormalizedUsage> {
    const usage = computeOpenAIUsage(
      model,
      response.usage ?? EMPTY_OPENAI_USAGE
    )
    await this.recordNormalizedUsage(actor, "openai", model, usage, options)
    return usage
  }

  private async recordNormalizedUsage(
    actor: AuthContext,
    provider: LlmProvider,
    model: string,
    usage: NormalizedUsage,
    options: LlmCallOptions
  ): Promise<void> {
    if (options.record === false) {
      return
    }
    try {
      await this.usageService.recordUsage(actor, {
        provider,
        model,
        feature: options.feature ?? null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsdCents: usage.costUsdCents,
        userId: actor.userId,
      })
    } catch (error) {
      this.logger.error(
        `Failed to record LLM usage for workspace ${actor.workspaceId}`,
        error instanceof Error ? error.stack : undefined
      )
    }
  }

  private async runWithErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new HttpException(
          { code: "LLM_UPSTREAM_ERROR", message: error.message },
          error.status ?? 502
        )
      }
      if (error instanceof OpenAIAPIError) {
        throw new HttpException(
          { code: "LLM_UPSTREAM_ERROR", message: error.message },
          error.status ?? 502
        )
      }
      throw error
    }
  }
}
