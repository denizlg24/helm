import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type {
  AuthContext,
  CreateNoteGroupInput,
  CreateNoteInput,
  Note,
  NoteEdge,
  NoteFolder,
  NoteGroup,
  NotesQuery,
  UpdateNoteGroupInput,
  UpdateNoteInput,
} from "@workspace/types"
import type { AuditService } from "../audit/audit.service"
import type {
  NoteDocument,
  NoteEdgeDocument,
  NoteGroupDocument,
  NotesRepository,
} from "./notes.repository"

const URL_IMPORT_MAX_BYTES = 512_000
const URL_IMPORT_TIMEOUT_MS = 8_000
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/iu,
  /^127\./u,
  /^10\./u,
  /^192\.168\./u,
  /^172\.(1[6-9]|2\d|3[0-1])\./u,
  /^169\.254\./u,
  /^0\./u,
  /^\[?::1\]?$/u,
]

const stripMarkdown = (value: string): string =>
  value
    .replace(/\[(.*?)\]\((.*?)\)/gu, "$1")
    .replace(/[#>*_`~-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()

const hashContent = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

const unique = (values: string[]): string[] => [...new Set(values)]

const normalizeTags = (tags: string[] | undefined): string[] =>
  unique((tags ?? []).map((tag) => tag.trim()).filter(Boolean)).sort((a, b) =>
    a.localeCompare(b)
  )

const sortNotes = (
  notes: NoteDocument[],
  sort: NonNullable<NotesQuery["sort"]>
): NoteDocument[] => {
  const items = [...notes]
  items.sort((left, right) => {
    switch (sort) {
      case "updated-asc":
        return left.updatedAt.getTime() - right.updatedAt.getTime()
      case "created-desc":
        return right.createdAt.getTime() - left.createdAt.getTime()
      case "created-asc":
        return left.createdAt.getTime() - right.createdAt.getTime()
      case "title-asc":
        return left.title.localeCompare(right.title)
      case "title-desc":
        return right.title.localeCompare(left.title)
      default:
        return right.updatedAt.getTime() - left.updatedAt.getTime()
    }
  })
  return items
}

const mapNote = (note: NoteDocument): Note => ({
  id: note.id,
  tenantId: note.tenantId,
  workspaceId: note.workspaceId,
  title: note.title,
  content: note.content,
  contentPlainText: note.contentPlainText,
  contentHash: note.contentHash,
  sourceType: note.sourceType,
  url: note.url,
  description: note.description,
  siteName: note.siteName,
  favicon: note.favicon,
  image: note.image,
  publishedAt: note.publishedAt,
  tags: note.tags,
  groupIds: note.groupIds,
  manualGroupIds: note.manualGroupIds,
  status: note.status,
  class: note.class,
  summary: note.summary,
  organizerStatus: note.organizerStatus,
  organizerContentHash: note.organizerContentHash,
  organizerUpdatedAt: note.organizerUpdatedAt,
  organizerError: note.organizerError,
  revision: note.revision,
  createdByUserId: note.createdByUserId,
  updatedByUserId: note.updatedByUserId,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
})

const mapGroup = (group: NoteGroupDocument): NoteGroup => ({
  id: group.id,
  tenantId: group.tenantId,
  workspaceId: group.workspaceId,
  name: group.name,
  description: group.description,
  color: group.color,
  parentId: group.parentId,
  kind: group.kind,
  source: group.source,
  lockedByUser: group.lockedByUser,
  confidence: group.confidence,
  aliases: group.aliases,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
})

const mapEdge = (edge: NoteEdgeDocument): NoteEdge => ({
  id: edge.id,
  tenantId: edge.tenantId,
  workspaceId: edge.workspaceId,
  fromNoteId: edge.fromNoteId,
  toNoteId: edge.toNoteId,
  strength: edge.strength,
  reason: edge.reason,
  source: edge.source,
  runId: edge.runId,
  metadata: edge.metadata,
  createdAt: edge.createdAt,
  updatedAt: edge.updatedAt,
})

interface UrlMetadata {
  title?: string
  description?: string
  siteName?: string
  favicon?: string
  image?: string
  publishedAt?: Date
}

function isBlockedUrl(rawUrl: string): boolean {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true
  const hostname = parsed.hostname.toLowerCase()
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

function firstMeta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "iu"
    )
    const match = pattern.exec(html)
    if (match?.[1]) return decodeHtml(match[1])
  }
  return undefined
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
}

function absolutize(baseUrl: string, value: string | undefined) {
  if (!value) return undefined
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return undefined
  }
}

function extractUrlMetadata(url: string, html: string): UrlMetadata {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html)
  const title =
    firstMeta(html, ["og:title", "twitter:title"]) ??
    (titleMatch?.[1] ? decodeHtml(titleMatch[1].trim()) : undefined)
  const description = firstMeta(html, [
    "description",
    "og:description",
    "twitter:description",
  ])
  const siteName = firstMeta(html, ["og:site_name", "application-name"])
  const image = absolutize(url, firstMeta(html, ["og:image", "twitter:image"]))
  const faviconMatch =
    /<link[^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/iu.exec(
      html
    )
  const favicon = absolutize(url, faviconMatch?.[1] ?? "/favicon.ico")
  const publishedRaw = firstMeta(html, [
    "article:published_time",
    "date",
    "publish_date",
  ])
  const publishedDate = publishedRaw ? new Date(publishedRaw) : undefined

  return {
    title,
    description,
    siteName,
    favicon,
    image,
    publishedAt:
      publishedDate && !Number.isNaN(publishedDate.getTime())
        ? publishedDate
        : undefined,
  }
}

@Injectable()
export class NotesService {
  constructor(
    private readonly repository: NotesRepository,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthContext, query: NotesQuery) {
    const filter = this.repository.workspaceFilter(actor)
    const notes = await this.repository.notes
      .find({
        ...filter,
        status:
          query.status && query.status !== "all"
            ? query.status
            : { $ne: "deleted" },
        ...(query.sourceType && query.sourceType !== "all"
          ? { sourceType: query.sourceType }
          : {}),
      })
      .lean<NoteDocument[]>()
      .exec()

    const groups = await this.repository.groups
      .find(filter)
      .lean<NoteGroupDocument[]>()
      .exec()
    const descendantIds = this.collectDescendantIds(groups)
    const scopedGroupIds = query.groupId
      ? (descendantIds.get(query.groupId) ?? new Set([query.groupId]))
      : null
    const normalizedQuery = query.q?.trim().toLowerCase()

    const filtered = notes.filter((note) => {
      if (scopedGroupIds) {
        const matchesGroup = note.groupIds.some((groupId) =>
          scopedGroupIds.has(groupId)
        )
        if (!matchesGroup) return false
      }
      if (query.tag && !note.tags.includes(query.tag)) return false
      if (normalizedQuery) {
        const haystack = [
          note.title,
          note.contentPlainText,
          note.url,
          note.description,
          note.siteName,
          note.class,
          ...note.tags,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      return true
    })

    return {
      notes: sortNotes(filtered, query.sort ?? "updated-desc").map(mapNote),
    }
  }

  async graph(actor: AuthContext) {
    const filter = this.repository.workspaceFilter(actor)
    const [notes, groups, edges] = await Promise.all([
      this.repository.notes
        .find({ ...filter, status: { $ne: "deleted" } })
        .lean<NoteDocument[]>()
        .exec(),
      this.repository.groups.find(filter).lean<NoteGroupDocument[]>().exec(),
      this.repository.edges.find(filter).lean<NoteEdgeDocument[]>().exec(),
    ])

    return {
      notes: sortNotes(notes, "updated-desc").map(mapNote),
      groups: groups.map(mapGroup),
      edges: edges.map(mapEdge),
    }
  }

  async folders(actor: AuthContext) {
    const filter = this.repository.workspaceFilter(actor)
    const [notes, groups] = await Promise.all([
      this.repository.notes
        .find({ ...filter, status: { $ne: "deleted" } })
        .lean<NoteDocument[]>()
        .exec(),
      this.repository.groups.find(filter).lean<NoteGroupDocument[]>().exec(),
    ])
    return this.buildFolders(notes, groups)
  }

  async get(actor: AuthContext, id: string) {
    return { note: mapNote(await this.repository.findNoteOrThrow(actor, id)) }
  }

  async tags(actor: AuthContext) {
    const notes = await this.repository.notes
      .find({
        ...this.repository.workspaceFilter(actor),
        status: { $ne: "deleted" },
      })
      .select({ tags: 1 })
      .lean<Array<{ tags: string[] }>>()
      .exec()
    return {
      tags: unique(notes.flatMap((note) => note.tags)).sort((a, b) =>
        a.localeCompare(b)
      ),
    }
  }

  async create(actor: AuthContext, input: CreateNoteInput) {
    const metadata = input.url ? await this.fetchUrlMetadata(input.url) : {}
    const title =
      input.title?.trim() ||
      metadata.title?.trim() ||
      (input.url ? new URL(input.url).hostname : "Untitled note")
    const content = input.content ?? ""
    const contentPlainText = stripMarkdown(content)
    const contentHash = await hashContent(`${title}\n${content}`)
    const now = new Date()
    const created = await this.repository.notes.create({
      ...this.repository.workspaceFilter(actor),
      title,
      content,
      contentPlainText,
      contentHash,
      sourceType: input.url ? "url" : "manual",
      url: input.url ?? null,
      description: input.description ?? metadata.description ?? null,
      siteName: metadata.siteName ?? null,
      favicon: metadata.favicon ?? null,
      image: metadata.image ?? null,
      publishedAt: input.publishedAt ?? metadata.publishedAt ?? null,
      tags: normalizeTags(input.tags),
      groupIds: unique(input.groupIds ?? []),
      manualGroupIds: unique(input.groupIds ?? []),
      status: input.status ?? "open",
      class: input.class?.trim() || null,
      summary: null,
      organizerStatus: "pending",
      organizerContentHash: null,
      organizerUpdatedAt: null,
      organizerError: null,
      revision: 0,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    return { note: mapNote(created.toObject()) }
  }

  async update(actor: AuthContext, id: string, input: UpdateNoteInput) {
    const existing = await this.repository.findNoteOrThrow(actor, id)
    const nextTitle = input.title ?? existing.title
    const nextContent = input.content ?? existing.content
    const contentChanged =
      input.title !== undefined ||
      input.content !== undefined ||
      input.url !== undefined ||
      input.description !== undefined ||
      input.siteName !== undefined ||
      input.class !== undefined ||
      input.tags !== undefined

    const patch: Partial<NoteDocument> = {
      updatedByUserId: actor.userId,
      revision: existing.revision + 1,
    }

    if (input.title !== undefined) patch.title = nextTitle
    if (input.content !== undefined) {
      patch.content = nextContent
      patch.contentPlainText = stripMarkdown(nextContent)
    }
    if (contentChanged) {
      patch.contentHash = await hashContent(`${nextTitle}\n${nextContent}`)
      patch.organizerStatus = "pending"
      patch.organizerContentHash = null
      patch.organizerError = null
    }
    if (input.url !== undefined) patch.url = input.url
    if (input.description !== undefined) patch.description = input.description
    if (input.siteName !== undefined) patch.siteName = input.siteName
    if (input.favicon !== undefined) patch.favicon = input.favicon
    if (input.image !== undefined) patch.image = input.image
    if (input.publishedAt !== undefined) patch.publishedAt = input.publishedAt
    if (input.tags !== undefined) patch.tags = normalizeTags(input.tags)
    if (input.groupIds !== undefined) {
      patch.groupIds = unique(input.groupIds)
      patch.manualGroupIds = unique(input.groupIds)
    }
    if (input.status !== undefined) patch.status = input.status
    if (input.class !== undefined) patch.class = input.class?.trim() || null
    if (input.summary !== undefined) patch.summary = input.summary

    const updated = await this.repository.notes
      .findOneAndUpdate(
        { ...this.repository.workspaceFilter(actor), id },
        { $set: patch },
        { new: true }
      )
      .lean<NoteDocument>()
      .exec()
    if (!updated) throw new NotFoundException("Note not found")
    return { note: mapNote(updated) }
  }

  async delete(actor: AuthContext, id: string) {
    await this.repository.findNoteOrThrow(actor, id)
    await this.repository.notes.updateOne(
      { ...this.repository.workspaceFilter(actor), id },
      {
        $set: {
          status: "deleted",
          updatedByUserId: actor.userId,
        },
        $inc: { revision: 1 },
      }
    )
    await this.repository.edges.deleteMany({
      ...this.repository.workspaceFilter(actor),
      $or: [{ fromNoteId: id }, { toNoteId: id }],
    })
    await this.audit.write(actor, {
      action: "note.delete",
      resourceType: "note",
      resourceId: id,
    })
    return { id }
  }

  async listGroups(actor: AuthContext) {
    const groups = await this.repository.groups
      .find(this.repository.workspaceFilter(actor))
      .lean<NoteGroupDocument[]>()
      .exec()
    return {
      groups: groups
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(mapGroup),
    }
  }

  async createGroup(actor: AuthContext, input: CreateNoteGroupInput) {
    if (input.parentId) {
      await this.repository.findGroupOrThrow(actor, input.parentId)
    }
    const group = await this.repository.groups.create({
      ...this.repository.workspaceFilter(actor),
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
      parentId: input.parentId ?? null,
      kind: "manual",
      source: "user",
      lockedByUser: true,
      confidence: null,
      aliases: [],
    })
    return { group: mapGroup(group.toObject()) }
  }

  async updateGroup(
    actor: AuthContext,
    id: string,
    input: UpdateNoteGroupInput
  ) {
    await this.repository.findGroupOrThrow(actor, id)
    if (input.parentId !== undefined && input.parentId !== null) {
      await this.assertCanMoveGroup(actor, id, input.parentId)
    }
    const updated = await this.repository.groups
      .findOneAndUpdate(
        { ...this.repository.workspaceFilter(actor), id },
        { $set: input },
        { new: true }
      )
      .lean<NoteGroupDocument>()
      .exec()
    if (!updated) throw new NotFoundException("Note group not found")
    return { group: mapGroup(updated) }
  }

  async deleteGroup(actor: AuthContext, id: string) {
    await this.repository.findGroupOrThrow(actor, id)
    const filter = this.repository.workspaceFilter(actor)
    await this.repository.groups.updateMany(
      { ...filter, parentId: id },
      { $set: { parentId: null } }
    )
    await this.repository.notes.updateMany(
      { ...filter, groupIds: id },
      {
        $pull: {
          groupIds: id,
          manualGroupIds: id,
        },
        $inc: { revision: 1 },
      }
    )
    await this.repository.groups.deleteOne({ ...filter, id })
    await this.audit.write(actor, {
      action: "note-group.delete",
      resourceType: "note-group",
      resourceId: id,
    })
    return { id }
  }

  private async fetchUrlMetadata(url: string): Promise<UrlMetadata> {
    if (isBlockedUrl(url)) {
      throw new BadRequestException("URL is not allowed")
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), URL_IMPORT_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent": "Helm URL Importer",
          accept: "text/html,application/xhtml+xml",
        },
      })
      if (!response.ok) return {}
      const contentType = response.headers.get("content-type") ?? ""
      if (!contentType.includes("text/html")) return {}
      const text = await response.text()
      return extractUrlMetadata(url, text.slice(0, URL_IMPORT_MAX_BYTES))
    } catch {
      return {}
    } finally {
      clearTimeout(timeout)
    }
  }

  private async assertCanMoveGroup(
    actor: AuthContext,
    groupId: string,
    parentId: string
  ) {
    if (groupId === parentId) {
      throw new BadRequestException("Group cannot be its own parent")
    }
    const groups = await this.repository.groups
      .find(this.repository.workspaceFilter(actor))
      .lean<NoteGroupDocument[]>()
      .exec()
    const descendants = this.collectDescendantIds(groups).get(groupId)
    if (descendants?.has(parentId)) {
      throw new BadRequestException("Group cannot be moved under its child")
    }
    if (!groups.some((group) => group.id === parentId)) {
      throw new NotFoundException("Parent group not found")
    }
  }

  private collectDescendantIds(groups: NoteGroupDocument[]) {
    const childrenByParent = new Map<string | null, NoteGroupDocument[]>()
    for (const group of groups) {
      const key = group.parentId ?? null
      childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), group])
    }

    const descendants = new Map<string, Set<string>>()
    for (const group of groups) {
      const result = new Set<string>([group.id])
      const stack = [...(childrenByParent.get(group.id) ?? [])]
      while (stack.length > 0) {
        const child = stack.pop()
        if (!child || result.has(child.id)) continue
        result.add(child.id)
        stack.push(...(childrenByParent.get(child.id) ?? []))
      }
      descendants.set(group.id, result)
    }
    return descendants
  }

  private buildFolders(notes: NoteDocument[], groups: NoteGroupDocument[]) {
    const descendantIds = this.collectDescendantIds(groups)
    const childrenByParent = new Map<string | null, string[]>()
    for (const group of groups) {
      const key = group.parentId ?? null
      childrenByParent.set(key, [
        ...(childrenByParent.get(key) ?? []),
        group.id,
      ])
    }

    const folders: NoteFolder[] = groups.map((group) => {
      const scopedIds = descendantIds.get(group.id) ?? new Set([group.id])
      const directNoteCount = notes.filter((note) =>
        note.groupIds.includes(group.id)
      ).length
      const noteCount = notes.filter((note) =>
        note.groupIds.some((groupId) => scopedIds.has(groupId))
      ).length
      return {
        group: mapGroup(group),
        noteCount,
        directNoteCount,
        children: childrenByParent.get(group.id) ?? [],
      }
    })

    return {
      groups: groups.map(mapGroup),
      folders,
      ungroupedNoteCount: notes.filter((note) => note.groupIds.length === 0)
        .length,
    }
  }
}
