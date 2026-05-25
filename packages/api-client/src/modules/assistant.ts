import {
  type ApproveAssistantToolInput,
  ApproveAssistantToolInputSchema,
  AssistantConversationDetailSchema,
  AssistantConversationListSchema,
  AssistantConversationSummarySchema,
  AssistantStreamEventSchema,
  type RenameAssistantConversationInput,
  RenameAssistantConversationInputSchema,
  type StartAssistantChatInput,
  StartAssistantChatInputSchema,
} from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createAssistantModule = ({
  request,
  stream,
}: HelmApiRequestClient) => ({
  listConversations: () =>
    request("/api/assistant/conversations", { method: "GET" }, (value) =>
      AssistantConversationListSchema.parse(value)
    ),

  getConversation: (id: string) =>
    request(
      `/api/assistant/conversations/${encodeURIComponent(id)}`,
      { method: "GET" },
      (value) => AssistantConversationDetailSchema.parse(value)
    ),

  renameConversation: (id: string, input: RenameAssistantConversationInput) =>
    request(
      `/api/assistant/conversations/${encodeURIComponent(id)}/rename`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          RenameAssistantConversationInputSchema.parse(input)
        ),
      },
      (value) => AssistantConversationSummarySchema.parse(value)
    ),

  deleteConversation: (id: string) =>
    request(
      `/api/assistant/conversations/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      () => undefined
    ),

  // Streams a new user turn. Yields stream events as they arrive.
  streamChat: (input: StartAssistantChatInput, signal?: AbortSignal) =>
    stream(
      "/api/assistant/stream",
      StartAssistantChatInputSchema.parse(input),
      (value) => AssistantStreamEventSchema.parse(value),
      signal
    ),

  // Resolves a pending tool approval and resumes streaming.
  approveTool: (
    conversationId: string,
    input: ApproveAssistantToolInput,
    signal?: AbortSignal
  ) =>
    stream(
      `/api/assistant/conversations/${encodeURIComponent(conversationId)}/approve`,
      ApproveAssistantToolInputSchema.parse(input),
      (value) => AssistantStreamEventSchema.parse(value),
      signal
    ),
})

export type AssistantModule = ReturnType<typeof createAssistantModule>
