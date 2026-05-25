"use client"

import type { HelmApiClient } from "@workspace/api-client"
import type {
  AssistantConversationDetail,
  AssistantMessage,
  AssistantModelId,
  AssistantStreamEvent,
} from "@workspace/types"
import { DEFAULT_ASSISTANT_MODEL_ID } from "@workspace/types"
import { useCallback, useReducer, useRef } from "react"

export type ChatStatus = "idle" | "streaming" | "awaiting_approval" | "error"

export interface ToolResult {
  content: string
  isError: boolean
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  costUsdCents: number
}

export interface PendingApproval {
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

interface ChatState {
  conversationId: string | null
  title: string | null
  messages: AssistantMessage[]
  toolResults: Record<string, ToolResult>
  usageByMessageId: Record<string, TokenUsage>
  pendingApproval: PendingApproval | null
  status: ChatStatus
  error: string | null
}

const initialState: ChatState = {
  conversationId: null,
  title: null,
  messages: [],
  toolResults: {},
  usageByMessageId: {},
  pendingApproval: null,
  status: "idle",
  error: null,
}

type Action =
  | { type: "reset" }
  | { type: "load"; payload: AssistantConversationDetail }
  | { type: "appendUserMessage"; message: AssistantMessage }
  | { type: "streamStart" }
  | { type: "event"; event: AssistantStreamEvent }
  | { type: "streamError"; message: string }

const placeholderMessage = (
  id: string,
  role: "user" | "assistant",
  blocks: AssistantMessage["blocks"]
): AssistantMessage => ({
  id,
  conversationId: "",
  workspaceId: "",
  role,
  blocks,
  model: null,
  status: role === "assistant" ? "streaming" : "complete",
  error: null,
  createdAt: new Date(),
})

const updateLastAssistant = (
  messages: AssistantMessage[],
  update: (message: AssistantMessage) => AssistantMessage
): AssistantMessage[] => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i]
    if (candidate && candidate.role === "assistant") {
      const next = messages.slice()
      next[i] = update(candidate)
      return next
    }
  }
  return messages
}

// Split a persisted transcript into displayable messages (text + tool calls)
// and a tool-result lookup. User messages that carry only tool_result blocks
// are not rendered as bubbles — their output is shown under the tool call.
const splitTranscript = (
  messages: AssistantMessage[]
): {
  messages: AssistantMessage[]
  toolResults: Record<string, ToolResult>
  usageByMessageId: Record<string, TokenUsage>
} => {
  const toolResults: Record<string, ToolResult> = {}
  const usageByMessageId: Record<string, TokenUsage> = {}
  const display: AssistantMessage[] = []
  for (const message of messages) {
    if (message.usage) {
      usageByMessageId[message.id] = message.usage
    }
    const resultBlocks = message.blocks.filter((b) => b.type === "tool_result")
    for (const block of resultBlocks) {
      if (block.type === "tool_result") {
        toolResults[block.toolUseId] = {
          content: block.content,
          isError: block.isError ?? false,
        }
      }
    }
    const isToolResultOnly =
      message.role === "user" &&
      message.blocks.length > 0 &&
      message.blocks.every((b) => b.type === "tool_result")
    if (!isToolResultOnly) display.push(message)
  }
  return { messages: display, toolResults, usageByMessageId }
}

const reducer = (state: ChatState, action: Action): ChatState => {
  switch (action.type) {
    case "reset":
      return initialState
    case "load": {
      const split = splitTranscript(action.payload.messages)
      const { conversation } = action.payload
      return {
        conversationId: conversation.id,
        title: conversation.title,
        messages: split.messages,
        toolResults: split.toolResults,
        usageByMessageId: split.usageByMessageId,
        pendingApproval: conversation.pendingApproval,
        status: conversation.pendingApproval ? "awaiting_approval" : "idle",
        error: null,
      }
    }
    case "appendUserMessage":
      return {
        ...state,
        messages: [...state.messages, action.message],
        status: "streaming",
        error: null,
      }
    case "streamStart":
      return { ...state, status: "streaming", error: null }
    case "streamError": {
      const lastMessage = state.messages[state.messages.length - 1]
      const shouldUpdateMessage =
        lastMessage?.role === "assistant" && lastMessage.status === "streaming"
      return {
        ...state,
        status: "error",
        error: action.message,
        messages: shouldUpdateMessage
          ? updateLastAssistant(state.messages, (message) => ({
              ...message,
              status: "error",
              error: action.message,
            }))
          : state.messages,
      }
    }
    case "event":
      return reduceEvent(state, action.event)
    default:
      return state
  }
}

const reduceEvent = (
  state: ChatState,
  event: AssistantStreamEvent
): ChatState => {
  switch (event.type) {
    case "conversation":
      return {
        ...state,
        conversationId: event.conversationId,
        title: event.title,
      }
    case "message_start":
      return {
        ...state,
        messages: [
          ...state.messages,
          placeholderMessage(event.messageId, event.role, []),
        ],
      }
    case "text_delta":
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (message) => {
          const blocks = message.blocks.slice()
          const last = blocks.at(-1)
          if (last && last.type === "text") {
            blocks[blocks.length - 1] = {
              type: "text",
              text: last.text + event.delta,
            }
          } else {
            blocks.push({ type: "text", text: event.delta })
          }
          return { ...message, blocks }
        }),
      }
    case "tool_use":
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (message) => {
          if (
            message.blocks.some(
              (b) => b.type === "tool_use" && b.id === event.toolUseId
            )
          ) {
            return message
          }
          return {
            ...message,
            blocks: [
              ...message.blocks,
              {
                type: "tool_use",
                id: event.toolUseId,
                name: event.name,
                input: event.input,
              },
            ],
          }
        }),
      }
    case "tool_approval_required":
      return {
        ...state,
        pendingApproval: {
          toolUseId: event.toolUseId,
          name: event.name,
          input: event.input,
        },
        messages: updateLastAssistant(state.messages, (message) => {
          if (
            message.blocks.some(
              (b) => b.type === "tool_use" && b.id === event.toolUseId
            )
          ) {
            return message
          }
          return {
            ...message,
            blocks: [
              ...message.blocks,
              {
                type: "tool_use",
                id: event.toolUseId,
                name: event.name,
                input: event.input,
              },
            ],
          }
        }),
      }
    case "tool_result":
      return {
        ...state,
        toolResults: {
          ...state.toolResults,
          [event.toolUseId]: {
            content: event.content,
            isError: event.isError,
          },
        },
        pendingApproval:
          state.pendingApproval?.toolUseId === event.toolUseId
            ? null
            : state.pendingApproval,
      }
    case "usage": {
      let lastAssistantId: string | null = event.messageId ?? null
      if (!lastAssistantId) {
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const candidate = state.messages[i]
          if (candidate && candidate.role === "assistant") {
            lastAssistantId = candidate.id
            break
          }
        }
      }
      if (!lastAssistantId) return state
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === lastAssistantId
            ? {
                ...message,
                usage: {
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                  costUsdCents: event.costUsdCents,
                },
              }
            : message
        ),
        usageByMessageId: {
          ...state.usageByMessageId,
          [lastAssistantId]: {
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            costUsdCents: event.costUsdCents,
          },
        },
      }
    }
    case "error":
      return { ...state, status: "error", error: event.message }
    case "done": {
      const status: ChatStatus =
        state.status === "error"
          ? "error"
          : state.pendingApproval
            ? "awaiting_approval"
            : "idle"
      return {
        ...state,
        status,
        pendingApproval: state.pendingApproval ? state.pendingApproval : null,
        messages: updateLastAssistant(state.messages, (message) => ({
          ...message,
          status: state.pendingApproval ? "pending_approval" : "complete",
        })),
      }
    }
    default:
      return state
  }
}

export interface UseAssistantChatOptions {
  client: HelmApiClient
  onConversationChange?: (conversationId: string, title: string) => void
}

export interface UseAssistantChat {
  conversationId: string | null
  title: string | null
  messages: AssistantMessage[]
  toolResults: Record<string, ToolResult>
  usageByMessageId: Record<string, TokenUsage>
  pendingApproval: PendingApproval | null
  status: ChatStatus
  error: string | null
  isBusy: boolean
  model: AssistantModelId
  setModel: (model: AssistantModelId) => void
  webSearch: boolean
  setWebSearch: (enabled: boolean) => void
  tools: boolean
  setTools: (enabled: boolean) => void
  send: (content: string) => Promise<void>
  resolveApproval: (decision: "approve" | "deny") => Promise<void>
  stop: () => void
  newChat: () => void
  loadConversation: (id: string) => Promise<void>
}

export function useAssistantChat(
  options: UseAssistantChatOptions
): UseAssistantChat {
  const { client, onConversationChange } = options
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)
  const modelRef = useRef<AssistantModelId>(DEFAULT_ASSISTANT_MODEL_ID)
  const webSearchRef = useRef(false)
  const toolsRef = useRef(true)
  // Mirror selection in state purely for re-render; refs hold the source used
  // inside async iteration to avoid stale closures.
  const [, force] = useReducer((n: number) => n + 1, 0)

  const consume = useCallback(
    async (stream: AsyncGenerator<AssistantStreamEvent, void, unknown>) => {
      try {
        for await (const event of stream) {
          dispatch({ type: "event", event })
          if (event.type === "conversation") {
            onConversationChange?.(event.conversationId, event.title)
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        dispatch({
          type: "streamError",
          message:
            error instanceof Error
              ? error.message
              : "The assistant stream failed.",
        })
      }
    },
    [onConversationChange]
  )

  const currentConversationId = useRef<string | null>(null)
  currentConversationId.current = state.conversationId

  const send = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (trimmed.length === 0) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      dispatch({
        type: "appendUserMessage",
        message: placeholderMessage(`local-${Date.now()}`, "user", [
          { type: "text", text: trimmed },
        ]),
      })

      const conversationId = currentConversationId.current
      const stream = client.assistant.streamChat(
        {
          conversationId,
          content: trimmed,
          model: modelRef.current,
          webSearch: webSearchRef.current,
          tools: toolsRef.current,
        },
        controller.signal
      )
      await consume(stream)
    },
    [client, consume]
  )

  const resolveApproval = useCallback(
    async (decision: "approve" | "deny") => {
      const pending = state.pendingApproval
      const conversationId = state.conversationId
      if (!pending || !conversationId) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      dispatch({ type: "streamStart" })
      const stream = client.assistant.approveTool(
        conversationId,
        { toolUseId: pending.toolUseId, decision },
        controller.signal
      )
      await consume(stream)
    },
    [client, consume, state.pendingApproval, state.conversationId]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    dispatch({ type: "event", event: { type: "done", stopReason: "aborted" } })
  }, [])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    currentConversationId.current = null
    dispatch({ type: "reset" })
  }, [])

  const loadConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort()
      const detail = await client.assistant.getConversation(id)
      dispatch({ type: "load", payload: detail })
    },
    [client]
  )

  return {
    conversationId: state.conversationId,
    title: state.title,
    messages: state.messages,
    toolResults: state.toolResults,
    usageByMessageId: state.usageByMessageId,
    pendingApproval: state.pendingApproval,
    status: state.status,
    error: state.error,
    isBusy: state.status === "streaming",
    model: modelRef.current,
    setModel: (model) => {
      modelRef.current = model
      force()
    },
    webSearch: webSearchRef.current,
    setWebSearch: (enabled) => {
      webSearchRef.current = enabled
      force()
    },
    tools: toolsRef.current,
    setTools: (enabled) => {
      toolsRef.current = enabled
      force()
    },
    send,
    resolveApproval,
    stop,
    newChat,
    loadConversation,
  }
}
