import { Injectable, NotFoundException } from "@nestjs/common"
import type {
  ApproveAssistantToolInput,
  AssistantConversationDetail,
  AssistantConversationList,
  AssistantConversationSummary,
  AssistantStreamEvent,
  AuthContext,
  StartAssistantChatInput,
} from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AssistantRepository } from "./assistant.repository"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AssistantStreamService } from "./assistant-stream.service"

type EmitFn = (event: AssistantStreamEvent) => void

const deriveTitle = (content: string): string => {
  const normalized = content.replace(/\s+/u, " ").trim()
  if (normalized.length === 0) return "New chat"
  return normalized.length > 60 ? `${normalized.slice(0, 60)}…` : normalized
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly repo: AssistantRepository,
    private readonly stream: AssistantStreamService
  ) {}

  async listConversations(
    actor: AuthContext
  ): Promise<AssistantConversationList> {
    const docs = await this.repo.listConversations(actor.workspaceId)
    return { conversations: docs.map((doc) => this.repo.toSummary(doc)) }
  }

  async getConversation(
    actor: AuthContext,
    id: string
  ): Promise<AssistantConversationDetail> {
    const conversation = await this.repo.getConversation(actor.workspaceId, id)
    if (!conversation) {
      throw new NotFoundException({
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      })
    }
    const messages = await this.repo.listMessages(actor.workspaceId, id)
    return {
      conversation: this.repo.toConversation(conversation),
      messages: messages.map((m) => this.repo.toMessage(m)),
    }
  }

  async renameConversation(
    actor: AuthContext,
    id: string,
    title: string
  ): Promise<AssistantConversationSummary> {
    const updated = await this.repo.renameConversation(
      actor.workspaceId,
      id,
      title
    )
    if (!updated) {
      throw new NotFoundException({
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      })
    }
    return this.repo.toSummary(updated)
  }

  async deleteConversation(actor: AuthContext, id: string): Promise<void> {
    const deleted = await this.repo.deleteConversation(actor.workspaceId, id)
    if (!deleted) {
      throw new NotFoundException({
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      })
    }
  }

  async start(
    actor: AuthContext,
    input: StartAssistantChatInput,
    emit: EmitFn
  ): Promise<void> {
    let conversation = input.conversationId
      ? await this.repo.getConversation(actor.workspaceId, input.conversationId)
      : await this.repo.createConversation(actor, {
          model: input.model,
          webSearchEnabled: input.webSearch,
          toolsEnabled: input.tools,
        })

    if (!conversation) {
      emit({
        type: "error",
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      })
      emit({ type: "done", stopReason: "error" })
      return
    }

    if (conversation.pendingApproval) {
      emit({
        type: "error",
        code: "APPROVAL_PENDING",
        message:
          "Resolve the pending tool approval before sending a new message.",
      })
      emit({ type: "done", stopReason: "error" })
      return
    }

    // Apply the per-message model/toggle selection to the conversation.
    await this.repo.updateSettings(actor.workspaceId, conversation._id, {
      model: input.model,
      webSearchEnabled: input.webSearch,
      toolsEnabled: input.tools,
    })
    conversation = {
      ...conversation,
      model: input.model,
      webSearchEnabled: input.webSearch,
      toolsEnabled: input.tools,
    }

    const existing = await this.repo.listMessages(
      actor.workspaceId,
      conversation._id
    )
    const isFirstMessage = existing.length === 0
    const title = isFirstMessage
      ? deriveTitle(input.content)
      : conversation.title
    if (isFirstMessage) {
      await this.repo.touchConversation(actor.workspaceId, conversation._id, {
        title,
      })
      conversation = { ...conversation, title }
    }

    await this.repo.appendMessage({
      conversationId: conversation._id,
      workspaceId: actor.workspaceId,
      role: "user",
      blocks: [{ type: "text", text: input.content }],
      status: "complete",
    })

    emit({ type: "conversation", conversationId: conversation._id, title })

    await this.stream.runConversation(actor, conversation, emit)
  }

  async approve(
    actor: AuthContext,
    conversationId: string,
    input: ApproveAssistantToolInput,
    emit: EmitFn
  ): Promise<void> {
    const conversation = await this.repo.getConversation(
      actor.workspaceId,
      conversationId
    )
    if (!conversation) {
      emit({
        type: "error",
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found",
      })
      emit({ type: "done", stopReason: "error" })
      return
    }

    const pending = conversation.pendingApproval
    if (!pending || pending.toolUseId !== input.toolUseId) {
      emit({
        type: "error",
        code: "NO_PENDING_APPROVAL",
        message: "No matching pending approval for this conversation.",
      })
      emit({ type: "done", stopReason: "error" })
      return
    }

    await this.repo.setPendingApproval(actor.workspaceId, conversationId, null)
    emit({
      type: "conversation",
      conversationId: conversation._id,
      title: conversation.title,
    })

    await this.stream.runConversation(
      actor,
      { ...conversation, pendingApproval: null },
      emit,
      input.decision === "approve"
        ? { approvedToolUseId: input.toolUseId }
        : { deniedToolUseId: input.toolUseId }
    )
  }
}
