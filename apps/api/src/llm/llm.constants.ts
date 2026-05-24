import type Anthropic from "@anthropic-ai/sdk"
import type { ResponseUsage } from "openai/resources/responses/responses"

export const DEFAULT_LLM_MODEL = "claude-opus-4-7"
export const DEFAULT_OPENAI_MODEL = "gpt-5.1"

export type LlmProvider = "anthropic" | "openai"

export const DEFAULT_LLM_EFFORT: NonNullable<Anthropic.OutputConfig["effort"]> =
  "medium"

export const DEFAULT_MAX_TOKENS = 16_000

export const MAX_TOOL_ITERATIONS = 20

interface ModelPrice {
  inputCentsPerMTok: number
  cachedInputCentsPerMTok?: number
  outputCentsPerMTok: number
}

const OPUS_PRICE: ModelPrice = {
  inputCentsPerMTok: 500,
  outputCentsPerMTok: 2500,
}
const GPT_5_PRICE: ModelPrice = {
  inputCentsPerMTok: 125,
  cachedInputCentsPerMTok: 12.5,
  outputCentsPerMTok: 1000,
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-4-7": OPUS_PRICE,
  "claude-opus-4-6": OPUS_PRICE,
  "claude-sonnet-4-6": { inputCentsPerMTok: 300, outputCentsPerMTok: 1500 },
  "claude-haiku-4-5": { inputCentsPerMTok: 100, outputCentsPerMTok: 500 },
  "gpt-5.1": GPT_5_PRICE,
  "gpt-5": GPT_5_PRICE,
  "gpt-5-chat-latest": GPT_5_PRICE,
  "gpt-5-mini": {
    inputCentsPerMTok: 25,
    cachedInputCentsPerMTok: 2.5,
    outputCentsPerMTok: 200,
  },
  "gpt-5-nano": {
    inputCentsPerMTok: 5,
    cachedInputCentsPerMTok: 0.5,
    outputCentsPerMTok: 40,
  },
  "gpt-5-pro": {
    inputCentsPerMTok: 1500,
    outputCentsPerMTok: 12_000,
  },
}

const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_MULTIPLIER = 1.25

export interface NormalizedUsage {
  inputTokens: number
  outputTokens: number
  costUsdCents: number
}

// Adaptive thinking and the output `effort` parameter are Opus-4.x features.
// Non-Opus Anthropic models (Sonnet, Haiku) reject both with a 400, so callers
// must omit them. Gate on the opus family to stay forward-compatible.
export const supportsAdaptiveThinking = (model: string): boolean =>
  model.startsWith("claude-opus-")

export const supportsOutputEffort = (model: string): boolean =>
  model.startsWith("claude-opus-")

export const inferProvider = (model: string): LlmProvider => {
  if (model.startsWith("claude-")) {
    return "anthropic"
  }
  if (
    model.startsWith("gpt-") ||
    model.startsWith("o1-") ||
    model.startsWith("o3-")
  ) {
    return "openai"
  }
  throw new Error(`Unsupported model: ${model}`)
}

export const computeAnthropicUsage = (
  model: string,
  usage: Anthropic.Usage
): NormalizedUsage => {
  const price = MODEL_PRICES[model]
  if (!price) {
    throw new Error(`Unsupported model: ${model}`)
  }
  const uncachedInput = usage.input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const output = usage.output_tokens ?? 0

  const cents =
    (uncachedInput / 1_000_000) * price.inputCentsPerMTok +
    (cacheRead / 1_000_000) * price.inputCentsPerMTok * CACHE_READ_MULTIPLIER +
    (cacheWrite / 1_000_000) *
      price.inputCentsPerMTok *
      CACHE_WRITE_MULTIPLIER +
    (output / 1_000_000) * price.outputCentsPerMTok

  return {
    inputTokens: uncachedInput + cacheRead + cacheWrite,
    outputTokens: output,
    costUsdCents: cents,
  }
}

export const computeOpenAIUsage = (
  model: string,
  usage: ResponseUsage
): NormalizedUsage => {
  const price = MODEL_PRICES[model]
  if (!price) {
    throw new Error(`Unsupported model: ${model}`)
  }
  const input = usage.input_tokens
  const cachedInput = usage.input_tokens_details.cached_tokens
  const uncachedInput = Math.max(0, input - cachedInput)
  const output = usage.output_tokens
  const cachedInputPrice =
    price.cachedInputCentsPerMTok ?? price.inputCentsPerMTok

  const cents =
    (uncachedInput / 1_000_000) * price.inputCentsPerMTok +
    (cachedInput / 1_000_000) * cachedInputPrice +
    (output / 1_000_000) * price.outputCentsPerMTok

  return {
    inputTokens: input,
    outputTokens: output,
    costUsdCents: cents,
  }
}
