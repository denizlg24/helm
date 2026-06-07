import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type {
  AssistantContentBlock,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantMessage,
  AssistantMessageStatus,
  AssistantModelId,
  AssistantPendingApproval,
  AssistantSurfaceContext,
  AssistantTokenUsage,
  AuthContext,
} from "@workspace/types"
import { type Model, Schema } from "mongoose"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { MongoService } from "../mongo/mongo.service"

interface ConversationDoc {
  _id: string
  tenantId: string
  workspaceId: string
  userId: string
  title: string
  model: AssistantModelId
  webSearchEnabled: boolean
  toolsEnabled: boolean
  pendingApproval: AssistantPendingApproval | null
  // The surface the user was on for the latest turn. Reused to ground resumes
  // (approval / client tool-result) since those carry no fresh context.
  lastContext: AssistantSurfaceContext | null
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

interface MessageDoc {
  _id: string
  workspaceId: string
  conversationId: string
  role: "user" | "assistant"
  blocks: AssistantContentBlock[]
  model: string | null
  status: AssistantMessageStatus
  error: string | null
  usage: AssistantTokenUsage | null
  createdAt: Date
}

const conversationSchema = new Schema(
  {
    _id: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    title: { type: String, required: true, default: "New chat" },
    model: { type: String, required: true },
    webSearchEnabled: { type: Boolean, required: true, default: false },
    toolsEnabled: { type: Boolean, required: true, default: true },
    pendingApproval: { type: Schema.Types.Mixed, default: null },
    lastContext: { type: Schema.Types.Mixed, default: null },
    lastMessageAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false, collection: "assistant_conversations" }
)

const messageSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    role: { type: String, required: true },
    blocks: { type: [Schema.Types.Mixed], required: true, default: [] },
    model: { type: String, default: null },
    status: { type: String, required: true },
    error: { type: String, default: null },
    usage: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true },
  },
  { _id: false, collection: "assistant_messages" }
)

interface CreateConversationInput {
  model: AssistantModelId
  webSearchEnabled: boolean
  toolsEnabled: boolean
}

interface AppendMessageInput {
  conversationId: string
  workspaceId: string
  role: "user" | "assistant"
  blocks: AssistantContentBlock[]
  status: AssistantMessageStatus
  model?: string | null
  error?: string | null
  usage?: AssistantTokenUsage | null
}

@Injectable()
export class AssistantRepository {
  constructor(private readonly mongo: MongoService) {}

  private conversations(): Model<ConversationDoc> {
    const connection = this.mongo.getConnection()
    try {
      return connection.model<ConversationDoc>("AssistantConversation")
    } catch {
      return connection.model<ConversationDoc>(
        "AssistantConversation",
        conversationSchema
      )
    }
  }

  private messages(): Model<MessageDoc> {
    const connection = this.mongo.getConnection()
    try {
      return connection.model<MessageDoc>("AssistantMessage")
    } catch {
      return connection.model<MessageDoc>("AssistantMessage", messageSchema)
    }
  }

  async createConversation(
    actor: AuthContext,
    input: CreateConversationInput
  ): Promise<ConversationDoc> {
    const now = new Date()
    const doc: ConversationDoc = {
      _id: randomUUID(),
      tenantId: actor.tenantId,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      title: "New chat",
      model: input.model,
      webSearchEnabled: input.webSearchEnabled,
      toolsEnabled: input.toolsEnabled,
      pendingApproval: null,
      lastContext: null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    }
    await this.conversations().create(doc)
    return doc
  }

  async getConversation(
    workspaceId: string,
    id: string
  ): Promise<ConversationDoc | null> {
    return this.conversations().findOne({ _id: id, workspaceId }).lean().exec()
  }

  async listConversations(workspaceId: string): Promise<ConversationDoc[]> {
    return this.conversations()
      .find({ workspaceId })
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .lean()
      .exec()
  }

  async deleteConversation(workspaceId: string, id: string): Promise<boolean> {
    const result = await this.conversations()
      .deleteOne({ _id: id, workspaceId })
      .exec()
    await this.messages().deleteMany({ conversationId: id, workspaceId }).exec()
    return result.deletedCount > 0
  }

  // Workspace-scoped rename. Only bumps `updatedAt` — a rename is not a new
  // message, so `lastMessageAt` (and thus list ordering) is left untouched.
  async renameConversation(
    workspaceId: string,
    id: string,
    title: string
  ): Promise<ConversationDoc | null> {
    return this.conversations()
      .findOneAndUpdate(
        { _id: id, workspaceId },
        { $set: { title, updatedAt: new Date() } },
        { returnDocument: "after" }
      )
      .lean()
      .exec()
  }

  async listMessages(
    workspaceId: string,
    conversationId: string
  ): Promise<MessageDoc[]> {
    return this.messages()
      .find({ conversationId, workspaceId })
      .sort({ createdAt: 1 })
      .lean()
      .exec()
  }

  async appendMessage(input: AppendMessageInput): Promise<MessageDoc> {
    const doc: MessageDoc = {
      _id: randomUUID(),
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      role: input.role,
      blocks: input.blocks,
      model: input.model ?? null,
      status: input.status,
      error: input.error ?? null,
      usage: input.usage ?? null,
      createdAt: new Date(),
    }
    await this.messages().create(doc)
    return doc
  }

  async updateMessage(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<MessageDoc, "blocks" | "status" | "error" | "usage">>
  ): Promise<void> {
    await this.messages()
      .updateOne({ _id: id, workspaceId }, { $set: patch })
      .exec()
  }

  async pushBlock(
    workspaceId: string,
    id: string,
    block: AssistantContentBlock
  ): Promise<void> {
    await this.messages()
      .updateOne({ _id: id, workspaceId }, { $push: { blocks: block } })
      .exec()
  }

  async getMessage(
    workspaceId: string,
    id: string
  ): Promise<MessageDoc | null> {
    return this.messages().findOne({ _id: id, workspaceId }).lean().exec()
  }

  async setPendingApproval(
    workspaceId: string,
    conversationId: string,
    pending: AssistantPendingApproval | null
  ): Promise<void> {
    await this.conversations()
      .updateOne(
        { _id: conversationId, workspaceId },
        { $set: { pendingApproval: pending, updatedAt: new Date() } }
      )
      .exec()
  }

  async setContext(
    workspaceId: string,
    conversationId: string,
    context: AssistantSurfaceContext | null
  ): Promise<void> {
    await this.conversations()
      .updateOne(
        { _id: conversationId, workspaceId },
        { $set: { lastContext: context, updatedAt: new Date() } }
      )
      .exec()
  }

  async touchConversation(
    workspaceId: string,
    conversationId: string,
    patch: { title?: string; model?: AssistantModelId }
  ): Promise<void> {
    const now = new Date()
    await this.conversations()
      .updateOne(
        { _id: conversationId, workspaceId },
        { $set: { ...patch, lastMessageAt: now, updatedAt: now } }
      )
      .exec()
  }

  async updateSettings(
    workspaceId: string,
    conversationId: string,
    settings: {
      model: AssistantModelId
      webSearchEnabled: boolean
      toolsEnabled: boolean
    }
  ): Promise<void> {
    await this.conversations()
      .updateOne(
        { _id: conversationId, workspaceId },
        { $set: { ...settings, updatedAt: new Date() } }
      )
      .exec()
  }

  toConversation(doc: ConversationDoc): AssistantConversation {
    return {
      id: doc._id,
      workspaceId: doc.workspaceId,
      userId: doc.userId,
      title: doc.title,
      model: doc.model,
      webSearchEnabled: doc.webSearchEnabled,
      toolsEnabled: doc.toolsEnabled,
      pendingApproval: doc.pendingApproval,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      lastMessageAt: doc.lastMessageAt,
    }
  }

  toSummary(doc: ConversationDoc): AssistantConversationSummary {
    return {
      id: doc._id,
      title: doc.title,
      model: doc.model,
      hasPendingApproval: doc.pendingApproval !== null,
      lastMessageAt: doc.lastMessageAt,
      createdAt: doc.createdAt,
    }
  }

  toMessage(doc: MessageDoc): AssistantMessage {
    return {
      id: doc._id,
      conversationId: doc.conversationId,
      workspaceId: doc.workspaceId,
      role: doc.role,
      blocks: doc.blocks,
      model: doc.model,
      status: doc.status,
      error: doc.error,
      usage: doc.usage,
      createdAt: doc.createdAt,
    }
  }
}

export type { ConversationDoc, MessageDoc }
