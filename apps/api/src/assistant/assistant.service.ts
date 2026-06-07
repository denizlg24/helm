import { Injectable, NotFoundException } from "@nestjs/common"
import type {
  ApproveAssistantToolInput,
  AssistantAttachmentBlock,
  AssistantContentBlock,
  AssistantConversationDetail,
  AssistantConversationList,
  AssistantConversationSummary,
  AssistantStreamEvent,
  AuthContext,
  StartAssistantChatInput,
  SubmitAssistantToolResultInput,
} from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { StorageService } from "../storage/storage.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AssistantRepository } from "./assistant.repository"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AssistantStreamService } from "./assistant-stream.service"

type EmitFn = (event: AssistantStreamEvent) => void

const deriveTitle = (content: string, fallback?: string): string => {
  const normalized = content.replace(/\s+/u, " ").trim()
  if (normalized.length === 0) return fallback ?? "New chat"
  return normalized.length > 60 ? `${normalized.slice(0, 60)}…` : normalized
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly repo: AssistantRepository,
    private readonly stream: AssistantStreamService,
    private readonly storage: StorageService
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
    let attachmentBlocks: AssistantAttachmentBlock[]
    try {
      attachmentBlocks = await this.resolveAttachmentBlocks(actor, input)
    } catch (error) {
      emit({
        type: "error",
        code: "ATTACHMENT_UNAVAILABLE",
        message:
          error instanceof Error
            ? error.message
            : "One or more attachments could not be loaded.",
      })
      emit({ type: "done", stopReason: "error" })
      return
    }

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

    // Stash the surface context so resumes (approve / tool-result) stay grounded
    // even though they carry no fresh context of their own.
    const surfaceContext = input.context ?? null
    await this.repo.setContext(
      actor.workspaceId,
      conversation._id,
      surfaceContext
    )
    conversation = { ...conversation, lastContext: surfaceContext }

    const existing = await this.repo.listMessages(
      actor.workspaceId,
      conversation._id
    )
    const isFirstMessage = existing.length === 0
    const titleFallback = attachmentBlocks[0]
      ? `Attachment: ${attachmentBlocks[0].filename}`
      : undefined
    const title = isFirstMessage
      ? deriveTitle(
          input.content ?? `New Conversation on ${new Date().toISOString()}`,
          titleFallback
        )
      : conversation.title
    if (isFirstMessage) {
      await this.repo.touchConversation(actor.workspaceId, conversation._id, {
        title,
      })
      conversation = { ...conversation, title }
    }

    const userBlocks: AssistantContentBlock[] = []
    const trimmedContent = input.content?.trim()
    if (trimmedContent && trimmedContent.length > 0) {
      userBlocks.push({ type: "text", text: trimmedContent })
    }
    userBlocks.push(...attachmentBlocks)

    await this.repo.appendMessage({
      conversationId: conversation._id,
      workspaceId: actor.workspaceId,
      role: "user",
      blocks: userBlocks,
      status: "complete",
    })

    emit({ type: "conversation", conversationId: conversation._id, title })

    await this.stream.runConversation(actor, conversation, emit)
  }

  private async resolveAttachmentBlocks(
    actor: AuthContext,
    input: StartAssistantChatInput
  ): Promise<AssistantAttachmentBlock[]> {
    const blocks: AssistantAttachmentBlock[] = []
    for (const attachment of input.attachments) {
      const ref = await this.storage.getMetadata(actor, attachment.fileId)
      blocks.push({
        type: "attachment",
        fileId: ref.id,
        filename: ref.filename,
        mimeType: ref.mimeType,
        sizeBytes: ref.sizeBytes,
      })
    }
    return blocks
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

  // Resolves a suspended client tool: records the result the client produced
  // and resumes the turn. The loop continues against the recorded tool_result.
  async submitToolResult(
    actor: AuthContext,
    conversationId: string,
    input: SubmitAssistantToolResultInput,
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

    // Atomically consume the pending approval to prevent races.
    const pending = await this.repo.consumePendingApproval(
      actor.workspaceId,
      conversationId,
      "client_tool",
      input.toolUseId
    )

    if (!pending || !pending.resultMessageId) {
      emit({
        type: "error",
        code: "NO_PENDING_CLIENT_TOOL",
        message: "No matching pending client tool for this conversation.",
      })
      emit({ type: "done", stopReason: "error" })
      return
    }

    const block: AssistantContentBlock = {
      type: "tool_result",
      toolUseId: input.toolUseId,
      content: input.result,
      ...(input.isError ? { isError: true } : {}),
    }
    await this.repo.pushBlock(actor.workspaceId, pending.resultMessageId, block)
    if (pending.messageId) {
      await this.repo.updateMessage(actor.workspaceId, pending.messageId, {
        status: "complete",
      })
    }

    emit({
      type: "conversation",
      conversationId: conversation._id,
      title: conversation.title,
    })

    await this.stream.runConversation(
      actor,
      { ...conversation, pendingApproval: null },
      emit
    )
  }
}
