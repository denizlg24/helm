import { Injectable, NotFoundException } from "@nestjs/common"
import type { AuthContext } from "@workspace/types"
import { type Model, Schema } from "mongoose"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { MongoService } from "../mongo/mongo.service"

export interface NoteDocument {
  id: string
  tenantId: string
  workspaceId: string
  title: string
  content: string
  contentPlainText: string
  contentHash: string
  sourceType: "manual" | "url" | "import"
  url: string | null
  description: string | null
  siteName: string | null
  favicon: string | null
  image: string | null
  publishedAt: Date | null
  tags: string[]
  groupIds: string[]
  manualGroupIds: string[]
  status: "open" | "archived" | "deleted"
  class: string | null
  summary: string | null
  organizerStatus: "idle" | "pending" | "organized" | "failed"
  organizerContentHash: string | null
  organizerUpdatedAt: Date | null
  organizerError: string | null
  revision: number
  createdByUserId: string
  updatedByUserId: string
  createdAt: Date
  updatedAt: Date
}

export interface NoteGroupDocument {
  id: string
  tenantId: string
  workspaceId: string
  name: string
  description: string | null
  color: string | null
  parentId: string | null
  kind: "manual" | "generated" | "system"
  source: "user" | "assistant" | "organizer" | "migration"
  lockedByUser: boolean
  confidence: number | null
  aliases: string[]
  createdAt: Date
  updatedAt: Date
}

export interface NoteEdgeDocument {
  id: string
  tenantId: string
  workspaceId: string
  fromNoteId: string
  toNoteId: string
  strength: number
  reason: string | null
  source: "manual" | "assistant" | "organizer" | "migration"
  runId: string | null
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface NoteSuggestionDocument {
  id: string
  tenantId: string
  workspaceId: string
  runId: string | null
  type:
    | "join-group"
    | "create-group"
    | "rename-group"
    | "move-group"
    | "add-tags"
    | "add-edge"
    | "archive-edge"
    | "summary"
  status: "pending" | "accepted" | "dismissed" | "superseded"
  noteId: string | null
  groupId: string | null
  targetGroupId: string | null
  proposedParentId: string | null
  proposedName: string | null
  proposedDescription: string | null
  proposedTags: string[]
  proposedRelatedNoteIds: string[]
  confidence: number
  reason: string
  createdAt: Date
  updatedAt: Date
}

export interface NoteOrganizerRunDocument {
  id: string
  tenantId: string
  workspaceId: string
  status: "running" | "completed" | "failed"
  initiatedBy: "user" | "job" | "assistant"
  noteCount: number
  suggestionCount: number
  startedAt: Date
  completedAt: Date | null
  error: string | null
}

type WorkspaceFilter = {
  tenantId: string
  workspaceId: string
}

const baseFields = {
  id: { type: String, default: () => crypto.randomUUID(), unique: true },
  tenantId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
} as const

const noteSchema = new Schema<NoteDocument>(
  {
    ...baseFields,
    title: { type: String, required: true },
    content: { type: String, required: true, default: "" },
    contentPlainText: { type: String, required: true, default: "" },
    contentHash: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["manual", "url", "import"],
      required: true,
      default: "manual",
    },
    url: { type: String, default: null },
    description: { type: String, default: null },
    siteName: { type: String, default: null },
    favicon: { type: String, default: null },
    image: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    groupIds: { type: [String], default: [], index: true },
    manualGroupIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["open", "archived", "deleted"],
      default: "open",
      index: true,
    },
    class: { type: String, default: null },
    summary: { type: String, default: null },
    organizerStatus: {
      type: String,
      enum: ["idle", "pending", "organized", "failed"],
      default: "idle",
    },
    organizerContentHash: { type: String, default: null },
    organizerUpdatedAt: { type: Date, default: null },
    organizerError: { type: String, default: null },
    revision: { type: Number, default: 0 },
    createdByUserId: { type: String, required: true },
    updatedByUserId: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
)

const noteGroupSchema = new Schema<NoteGroupDocument>(
  {
    ...baseFields,
    name: { type: String, required: true },
    description: { type: String, default: null },
    color: { type: String, default: null },
    parentId: { type: String, default: null, index: true },
    kind: {
      type: String,
      enum: ["manual", "generated", "system"],
      default: "manual",
    },
    source: {
      type: String,
      enum: ["user", "assistant", "organizer", "migration"],
      default: "user",
    },
    lockedByUser: { type: Boolean, default: false },
    confidence: { type: Number, default: null },
    aliases: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false }
)

const noteEdgeSchema = new Schema<NoteEdgeDocument>(
  {
    ...baseFields,
    fromNoteId: { type: String, required: true, index: true },
    toNoteId: { type: String, required: true, index: true },
    strength: { type: Number, required: true, default: 0.5 },
    reason: { type: String, default: null },
    source: {
      type: String,
      enum: ["manual", "assistant", "organizer", "migration"],
      default: "manual",
    },
    runId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false }
)

const noteSuggestionSchema = new Schema<NoteSuggestionDocument>(
  {
    ...baseFields,
    runId: { type: String, default: null },
    type: {
      type: String,
      enum: [
        "join-group",
        "create-group",
        "rename-group",
        "move-group",
        "add-tags",
        "add-edge",
        "archive-edge",
        "summary",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "dismissed", "superseded"],
      default: "pending",
      index: true,
    },
    noteId: { type: String, default: null },
    groupId: { type: String, default: null },
    targetGroupId: { type: String, default: null },
    proposedParentId: { type: String, default: null },
    proposedName: { type: String, default: null },
    proposedDescription: { type: String, default: null },
    proposedTags: { type: [String], default: [] },
    proposedRelatedNoteIds: { type: [String], default: [] },
    confidence: { type: Number, default: 0 },
    reason: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
)

const noteOrganizerRunSchema = new Schema<NoteOrganizerRunDocument>(
  {
    ...baseFields,
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    initiatedBy: {
      type: String,
      enum: ["user", "job", "assistant"],
      required: true,
    },
    noteCount: { type: Number, default: 0 },
    suggestionCount: { type: Number, default: 0 },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { versionKey: false }
)

noteSchema.index({ tenantId: 1, workspaceId: 1, updatedAt: -1 })
noteSchema.index({ tenantId: 1, workspaceId: 1, title: 1 })
noteGroupSchema.index({ tenantId: 1, workspaceId: 1, name: 1 })
noteEdgeSchema.index(
  { tenantId: 1, workspaceId: 1, fromNoteId: 1, toNoteId: 1 },
  { unique: true }
)

@Injectable()
export class NotesRepository {
  readonly notes: Model<NoteDocument>
  readonly groups: Model<NoteGroupDocument>
  readonly edges: Model<NoteEdgeDocument>
  readonly suggestions: Model<NoteSuggestionDocument>
  readonly organizerRuns: Model<NoteOrganizerRunDocument>

  constructor(mongo: MongoService) {
    const connection = mongo.getConnection()
    this.notes = connection.model<NoteDocument>("Note", noteSchema)
    this.groups = connection.model<NoteGroupDocument>(
      "NoteGroup",
      noteGroupSchema
    )
    this.edges = connection.model<NoteEdgeDocument>("NoteEdge", noteEdgeSchema)
    this.suggestions = connection.model<NoteSuggestionDocument>(
      "NoteSuggestion",
      noteSuggestionSchema
    )
    this.organizerRuns = connection.model<NoteOrganizerRunDocument>(
      "NoteOrganizerRun",
      noteOrganizerRunSchema
    )
  }

  workspaceFilter(actor: AuthContext): WorkspaceFilter {
    return {
      tenantId: actor.tenantId,
      workspaceId: actor.workspaceId,
    }
  }

  async findNoteOrThrow(actor: AuthContext, id: string): Promise<NoteDocument> {
    const note = await this.notes
      .findOne({
        ...this.workspaceFilter(actor),
        id,
        status: { $ne: "deleted" },
      })
      .lean<NoteDocument>()
      .exec()
    if (!note) {
      throw new NotFoundException("Note not found")
    }
    return note
  }

  async findGroupOrThrow(
    actor: AuthContext,
    id: string
  ): Promise<NoteGroupDocument> {
    const group = await this.groups
      .findOne({ ...this.workspaceFilter(actor), id })
      .lean<NoteGroupDocument>()
      .exec()
    if (!group) {
      throw new NotFoundException("Note group not found")
    }
    return group
  }
}
