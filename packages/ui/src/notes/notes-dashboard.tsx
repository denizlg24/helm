"use client"

import type {
  CreateNoteGroupInput,
  CreateNoteInput,
  Note,
  NoteEdge,
  NoteGroup,
  NotesFoldersResponse,
  NotesGraphResponse,
  NotesQuery,
  UpdateNoteInput,
} from "@workspace/types"
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  Globe,
  LayoutGrid,
  ListTree,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { AppHeaderUser } from "../components/app-header"
import { AppHeader } from "../components/app-header"
import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { Input } from "../components/input"
import { MarkdownRenderer } from "../components/markdown-renderer"
import { toast } from "../components/sonner"
import { Spinner } from "../components/spinner"
import { Tabs, TabsList, TabsTrigger } from "../components/tabs"
import { Textarea } from "../components/textarea"
import { cn } from "../lib/utils"

type ViewMode = "folders" | "graph"
type EditorMode = "write" | "preview"
type StatusFilter = NonNullable<NotesQuery["status"]>
type FolderSelection = "all" | "ungrouped" | string

export interface NotesClient {
  notes: {
    graph: () => Promise<NotesGraphResponse>
    folders: () => Promise<NotesFoldersResponse>
    create: (input: CreateNoteInput) => Promise<{ note: Note }>
    update: (id: string, input: UpdateNoteInput) => Promise<{ note: Note }>
    delete: (id: string) => Promise<{ id: string }>
    groups: {
      create: (input: CreateNoteGroupInput) => Promise<{ group: NoteGroup }>
    }
  }
}

export interface NotesDashboardProps {
  user: AppHeaderUser
  onSignOut: () => Promise<void>
  onResolveWorkspace: () => Promise<void>
  client: NotesClient
  headerClassName?: string
  headerDragRegion?: boolean
  headerEndSlot?: ReactNode
  headerTitle?: string
}

interface GroupNode extends NoteGroup {
  children: GroupNode[]
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const formatDate = (value: Date | string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

const safeHostname = (url: string | null) => {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const excerptFromNote = (note: Note) => {
  const source = note.description?.trim() || note.contentPlainText
  if (!source) return note.url ? safeHostname(note.url) : "Empty note"
  return source.length > 180 ? `${source.slice(0, 180).trim()}...` : source
}

const buildGroupTree = (groups: NoteGroup[]) => {
  const byId = new Map<string, GroupNode>()
  for (const group of groups) {
    byId.set(group.id, { ...group, children: [] })
  }
  const roots: GroupNode[] = []
  for (const group of byId.values()) {
    if (group.parentId && byId.has(group.parentId)) {
      byId.get(group.parentId)?.children.push(group)
    } else {
      roots.push(group)
    }
  }
  const sortNodes = (nodes: GroupNode[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name))
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(roots)
  return roots
}

const descendantIds = (groups: NoteGroup[], groupId: string) => {
  const childrenByParent = new Map<string, NoteGroup[]>()
  for (const group of groups) {
    if (!group.parentId) continue
    childrenByParent.set(group.parentId, [
      ...(childrenByParent.get(group.parentId) ?? []),
      group,
    ])
  }
  const result = new Set<string>([groupId])
  const stack = [...(childrenByParent.get(groupId) ?? [])]
  while (stack.length > 0) {
    const group = stack.pop()
    if (!group || result.has(group.id)) continue
    result.add(group.id)
    stack.push(...(childrenByParent.get(group.id) ?? []))
  }
  return result
}

export function NotesDashboard({
  user,
  onSignOut,
  onResolveWorkspace,
  client,
  headerClassName,
  headerDragRegion,
  headerEndSlot,
  headerTitle = "Notes",
}: NotesDashboardProps) {
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<ViewMode>("folders")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("open")
  const [folder, setFolder] = useState<FolderSelection>("all")
  const [notes, setNotes] = useState<Note[]>([])
  const [groups, setGroups] = useState<NoteGroup[]>([])
  const [edges, setEdges] = useState<NoteEdge[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingUrl, setCreatingUrl] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true)
      else setLoading(true)
      try {
        const [graphResult, folderResult] = await Promise.all([
          client.notes.graph(),
          client.notes.folders(),
        ])
        setNotes(graphResult.notes)
        setGroups(folderResult.groups)
        setEdges(graphResult.edges)
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not load notes"))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [client]
  )

  useEffect(() => {
    let cancelled = false
    onResolveWorkspace()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(getErrorMessage(error, "Could not resolve workspace"))
          setReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [onResolveWorkspace])

  useEffect(() => {
    if (ready) void load()
  }, [ready, load])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable='true']")
      ) {
        return
      }
      const text = event.clipboardData?.getData("text") ?? ""
      if (!isHttpUrl(text) || creatingUrl) return
      event.preventDefault()
      setCreatingUrl(true)
      client.notes
        .create({ url: text.trim() })
        .then((response) => {
          setSelectedId(response.note.id)
          toast.success("Link imported")
          return load(true)
        })
        .catch((error) => {
          toast.error(getErrorMessage(error, "Could not import link"))
        })
        .finally(() => setCreatingUrl(false))
    }
    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [client, creatingUrl, load])

  const groupTree = useMemo(() => buildGroupTree(groups), [groups])
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  )

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const scope =
      folder !== "all" && folder !== "ungrouped"
        ? descendantIds(groups, folder)
        : null

    return notes.filter((note) => {
      if (status !== "all" && note.status !== status) return false
      if (folder === "ungrouped" && note.groupIds.length > 0) return false
      if (scope && !note.groupIds.some((groupId) => scope.has(groupId))) {
        return false
      }
      if (!normalizedQuery) return true
      const groupNames = note.groupIds
        .map((groupId) => groupById.get(groupId)?.name)
        .filter((value): value is string => Boolean(value))
      const haystack = [
        note.title,
        note.contentPlainText,
        note.url,
        note.description,
        note.siteName,
        note.class,
        ...note.tags,
        ...groupNames,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [folder, groupById, groups, notes, query, status])

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId]
  )

  const createNote = async () => {
    try {
      const response = await client.notes.create({
        title: "Untitled note",
        content: "",
        groupIds:
          folder !== "all" && folder !== "ungrouped" ? [folder] : undefined,
      })
      setSelectedId(response.note.id)
      await load(true)
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create note"))
    }
  }

  const createFolder = async () => {
    const name = window.prompt("Folder name")
    if (!name?.trim()) return
    try {
      await client.notes.groups.create({
        name: name.trim(),
        parentId:
          folder !== "all" && folder !== "ungrouped" ? folder : undefined,
      })
      await load(true)
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create folder"))
    }
  }

  const updateNote = async (id: string, input: UpdateNoteInput) => {
    const response = await client.notes.update(id, input)
    setNotes((current) =>
      current.map((note) => (note.id === id ? response.note : note))
    )
    return response.note
  }

  const deleteNote = async (id: string) => {
    if (!window.confirm("Delete this note?")) return
    try {
      await client.notes.delete(id)
      setSelectedId(null)
      await load(true)
      toast.success("Note deleted")
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not delete note"))
    }
  }

  if (!ready || loading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={headerTitle}
          className={headerClassName}
          dragRegion={headerDragRegion}
          sidebarOpen={false}
          onToggleSidebar={() => undefined}
          user={user}
          onLogout={() => void onSignOut()}
          backgroundItems={[]}
          notifications={[]}
          endSlot={headerEndSlot}
        />

        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <div className="relative min-w-48 flex-1">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes, folders, tags..."
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as ViewMode)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="folders" className="h-6 px-2">
                <ListTree className="size-3.5" />
              </TabsTrigger>
              <TabsTrigger value="graph" className="h-6 px-2">
                <LayoutGrid className="size-3.5" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Spinner className="size-3.5" />
            ) : (
              <RefreshCcw className="size-3.5" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void createFolder()}
          >
            <FolderPlus className="size-3.5" />
            Folder
          </Button>
          <Button size="sm" onClick={() => void createNote()}>
            <FilePlus2 className="size-3.5" />
            Note
          </Button>
        </div>

        <main className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="min-h-0 border-r">
            <FolderSidebar
              groups={groupTree}
              notes={notes}
              selected={folder}
              onSelect={(next) => {
                setFolder(next)
                setSelectedId(null)
              }}
              status={status}
              onStatusChange={setStatus}
            />
          </aside>

          <section className="min-h-0 overflow-hidden">
            {selectedNote ? (
              <NoteDetail
                note={selectedNote}
                groups={groups}
                relatedNotes={relatedNotes(selectedNote, notes, edges)}
                onBack={() => setSelectedId(null)}
                onSelectNote={(note) => setSelectedId(note.id)}
                onSave={(input) => updateNote(selectedNote.id, input)}
                onDelete={() => deleteNote(selectedNote.id)}
              />
            ) : view === "graph" ? (
              <NotesGraph
                notes={visibleNotes}
                groups={groups}
                edges={edges}
                onSelectNote={(note) => setSelectedId(note.id)}
                onSelectGroup={(group) => setFolder(group.id)}
              />
            ) : (
              <FolderContents
                notes={visibleNotes}
                groups={groups}
                folder={folder}
                onSelectNote={(note) => setSelectedId(note.id)}
                onSelectGroup={(group) => setFolder(group.id)}
              />
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

function relatedNotes(note: Note, notes: Note[], edges: NoteEdge[]) {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.fromNoteId === note.id) ids.add(edge.toNoteId)
    if (edge.toNoteId === note.id) ids.add(edge.fromNoteId)
  }
  return notes.filter((candidate) => ids.has(candidate.id))
}

function FolderSidebar({
  groups,
  notes,
  selected,
  onSelect,
  status,
  onStatusChange,
}: {
  groups: GroupNode[]
  notes: Note[]
  selected: FolderSelection
  onSelect: (folder: FolderSelection) => void
  status: NotesQuery["status"]
  onStatusChange: (status: StatusFilter) => void
}) {
  const ungroupedCount = notes.filter(
    (note) => note.status !== "deleted" && note.groupIds.length === 0
  ).length
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Folders
        </span>
        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as StatusFilter)
          }
          className="h-7 rounded-md border bg-background px-2 text-xs outline-none"
        >
          <option value="open">Open</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <FolderButton
          label="All notes"
          count={notes.filter((note) => note.status !== "deleted").length}
          selected={selected === "all"}
          onClick={() => onSelect("all")}
        />
        <FolderButton
          label="Ungrouped"
          count={ungroupedCount}
          selected={selected === "ungrouped"}
          onClick={() => onSelect("ungrouped")}
        />
        <div className="mt-2 space-y-0.5">
          {groups.map((group) => (
            <FolderTreeNode
              key={group.id}
              group={group}
              notes={notes}
              selected={selected}
              onSelect={onSelect}
              depth={0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function FolderButton({
  label,
  count,
  selected,
  onClick,
  depth = 0,
}: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
  depth?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted",
        selected && "bg-muted text-foreground"
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <Folder className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </button>
  )
}

function FolderTreeNode({
  group,
  notes,
  selected,
  onSelect,
  depth,
}: {
  group: GroupNode
  notes: Note[]
  selected: FolderSelection
  onSelect: (folder: FolderSelection) => void
  depth: number
}) {
  const scope = useMemo(() => collectGroupIds(group), [group])
  const count = notes.filter((note) =>
    note.groupIds.some((groupId) => scope.has(groupId))
  ).length
  return (
    <div>
      <FolderButton
        label={group.name}
        count={count}
        selected={selected === group.id}
        onClick={() => onSelect(group.id)}
        depth={depth}
      />
      {group.children.length > 0 ? (
        <div>
          {group.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              group={child}
              notes={notes}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function collectGroupIds(group: GroupNode) {
  const result = new Set<string>([group.id])
  const stack = [...group.children]
  while (stack.length > 0) {
    const child = stack.pop()
    if (!child) continue
    result.add(child.id)
    stack.push(...child.children)
  }
  return result
}

function FolderContents({
  notes,
  groups,
  folder,
  onSelectNote,
  onSelectGroup,
}: {
  notes: Note[]
  groups: NoteGroup[]
  folder: FolderSelection
  onSelectNote: (note: Note) => void
  onSelectGroup: (group: NoteGroup) => void
}) {
  const childGroups = groups.filter((group) =>
    folder === "all" || folder === "ungrouped"
      ? group.parentId === null
      : group.parentId === folder
  )
  const groupById = new Map(groups.map((group) => [group.id, group]))

  if (notes.length === 0 && childGroups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No notes here yet.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl p-4">
        {childGroups.length > 0 ? (
          <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {childGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelectGroup(group)}
                className="flex h-12 items-center gap-2 rounded-md border px-3 text-left hover:bg-muted"
              >
                <Folder className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {group.name}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="divide-y border-y">
          {notes.map((note) => (
            <button
              type="button"
              key={note.id}
              onClick={() => onSelectNote(note)}
              className="grid w-full grid-cols-[1.5rem_minmax(0,1.3fr)_minmax(0,1fr)_7rem] gap-3 px-2 py-3 text-left hover:bg-muted/50"
            >
              <NoteIcon note={note} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {note.title}
                  </span>
                  {note.url ? (
                    <ExternalLink className="size-3 text-muted-foreground" />
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {excerptFromNote(note)}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap content-start gap-1">
                {note.groupIds.slice(0, 3).map((groupId) => {
                  const group = groupById.get(groupId)
                  if (!group) return null
                  return (
                    <Badge key={group.id} variant="secondary" className="h-5">
                      {group.name}
                    </Badge>
                  )
                })}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {formatDate(note.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function NoteIcon({ note }: { note: Note }) {
  if (note.favicon) {
    return (
      <img src={note.favicon} alt="" className="mt-0.5 size-4 rounded-sm" />
    )
  }
  return note.url ? (
    <Globe className="mt-0.5 size-4 text-muted-foreground" />
  ) : (
    <FileText className="mt-0.5 size-4 text-muted-foreground" />
  )
}

function NoteDetail({
  note,
  groups,
  relatedNotes,
  onBack,
  onSelectNote,
  onSave,
  onDelete,
}: {
  note: Note
  groups: NoteGroup[]
  relatedNotes: Note[]
  onBack: () => void
  onSelectNote: (note: Note) => void
  onSave: (input: UpdateNoteInput) => Promise<Note>
  onDelete: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [mode, setMode] = useState<EditorMode>("preview")
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTitle(note.title)
    setContent(note.content)
    setMode(note.content.trim() ? "preview" : "write")
  }, [note.id, note.title, note.content])

  const saveTitle = useCallback(
    async (nextTitle: string) => {
      const trimmed = nextTitle.trim()
      if (!trimmed || trimmed === note.title) return
      try {
        await onSave({ title: trimmed })
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not save title"))
      }
    },
    [note.title, onSave]
  )

  const scheduleTitleSave = (nextTitle: string) => {
    setTitle(nextTitle)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveTitle(nextTitle)
    }, 700)
  }

  const saveContent = async () => {
    try {
      setSaving(true)
      await onSave({ content })
      setMode("preview")
      toast.success("Note saved")
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save note"))
    } finally {
      setSaving(false)
    }
  }

  const exportMarkdown = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${title.trim() || "note"}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const noteGroups = note.groupIds
    .map((groupId) => groups.find((group) => group.id === groupId))
    .filter((group): group is NoteGroup => Boolean(group))

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <NoteIcon note={note} />
          <span className="truncate text-xs text-muted-foreground">
            {note.url ? safeHostname(note.url) : "Markdown note"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-6">
          <Input
            value={title}
            onChange={(event) => scheduleTitleSave(event.target.value)}
            onBlur={() => void saveTitle(title)}
            placeholder="Untitled note"
            className="h-auto border-none bg-transparent px-0 py-1 text-2xl font-semibold shadow-none focus-visible:ring-0"
          />

          <div className="mt-5 divide-y border-y text-xs">
            <PropertyRow label="created">
              {formatDate(note.createdAt)}
            </PropertyRow>
            {note.url ? (
              <PropertyRow label="source">
                <a
                  href={note.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                >
                  <span className="truncate">{note.url}</span>
                  <ExternalLink className="size-3" />
                </a>
              </PropertyRow>
            ) : null}
            <PropertyRow label="folders">
              <div className="flex flex-wrap gap-1">
                {noteGroups.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  noteGroups.map((group) => (
                    <Badge key={group.id} variant="secondary">
                      {group.name}
                    </Badge>
                  ))
                )}
              </div>
            </PropertyRow>
            <PropertyRow label="tags">
              <div className="flex flex-wrap gap-1">
                {note.tags.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  note.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))
                )}
              </div>
            </PropertyRow>
            {relatedNotes.length > 0 ? (
              <PropertyRow label="related">
                <div className="flex flex-wrap gap-1">
                  {relatedNotes.map((related) => (
                    <button
                      type="button"
                      key={related.id}
                      onClick={() => onSelectNote(related)}
                      className="rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-muted"
                    >
                      {related.title}
                    </button>
                  ))}
                </div>
              </PropertyRow>
            ) : null}
          </div>

          <div className="mt-7 flex min-h-[55vh] flex-col border">
            <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
              <Tabs
                value={mode}
                onValueChange={(value) => setMode(value as EditorMode)}
              >
                <TabsList className="h-8">
                  <TabsTrigger value="write" className="h-6 px-2 text-xs">
                    Write
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="h-6 px-2 text-xs">
                    Preview
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={exportMarkdown}>
                  <Download className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  disabled={content === note.content || saving}
                  onClick={() => void saveContent()}
                >
                  {saving ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </div>
            {mode === "write" ? (
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[55vh] flex-1 resize-none rounded-none border-0 p-4 font-mono text-sm shadow-none focus-visible:ring-0"
                placeholder="Write in markdown..."
              />
            ) : (
              <div className="min-h-[55vh] flex-1 overflow-y-auto p-4">
                {content.trim() ? (
                  <MarkdownRenderer content={content} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Empty note
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PropertyRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 px-2 py-1.5">
      <span className="font-mono text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function NotesGraph({
  notes,
  groups,
  edges,
  onSelectNote,
  onSelectGroup,
}: {
  notes: Note[]
  groups: NoteGroup[]
  edges: NoteEdge[]
  onSelectNote: (note: Note) => void
  onSelectGroup: (group: NoteGroup) => void
}) {
  const visibleIds = new Set(notes.map((note) => note.id))
  const visibleEdges = edges.filter(
    (edge) => visibleIds.has(edge.fromNoteId) && visibleIds.has(edge.toNoteId)
  )
  const positions = new Map<string, { x: number; y: number }>()
  const centerX = 50
  const centerY = 48
  const radius = 32
  notes.forEach((note, index) => {
    const angle = (index / Math.max(notes.length, 1)) * Math.PI * 2
    positions.set(note.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    })
  })

  if (notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No notes match the current filters.
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden bg-muted/10">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        {visibleEdges.map((edge) => {
          const from = positions.get(edge.fromNoteId)
          const to = positions.get(edge.toNoteId)
          if (!from || !to) return null
          return (
            <line
              key={edge.id}
              x1={`${from.x}%`}
              y1={`${from.y}%`}
              x2={`${to.x}%`}
              y2={`${to.y}%`}
              stroke="hsl(var(--border))"
              strokeWidth={1 + edge.strength}
            />
          )
        })}
      </svg>
      <div className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1">
        {groups.slice(0, 12).map((group) => (
          <button
            type="button"
            key={group.id}
            onClick={() => onSelectGroup(group)}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
          >
            <Folder className="size-3" />
            {group.name}
          </button>
        ))}
      </div>
      {notes.map((note) => {
        const point = positions.get(note.id)
        if (!point) return null
        return (
          <button
            type="button"
            key={note.id}
            onClick={() => onSelectNote(note)}
            className="-translate-x-1/2 -translate-y-1/2 absolute max-w-44 rounded-md border bg-background px-3 py-2 text-left shadow-sm hover:bg-muted"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <GitBranch className="size-3.5 text-muted-foreground" />
              <span className="truncate text-xs font-medium">{note.title}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {safeHostname(note.url) ??
                note.tags.slice(0, 2).join(", ") ??
                "note"}
            </div>
          </button>
        )
      })}
    </div>
  )
}
