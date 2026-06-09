"use client"

import type {
  CreateNoteGroupInput,
  CreateNoteInput,
  Note,
  NoteEdge,
  NoteGroup,
  NotesGraphResponse,
  NoteTagsResponse,
  UpdateNoteGroupInput,
  UpdateNoteInput,
} from "@workspace/types"
import {
  FilePlus2,
  FileText,
  FolderPlus,
  FolderTree,
  LayoutGrid,
  Link2,
  Loader2,
  RefreshCcw,
  Tags,
  X,
} from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useModuleDataInvalidation } from "../assistant/bridge"
import type { AppHeaderUser } from "../components/app-header"
import { AppHeader } from "../components/app-header"
import { Button } from "../components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog"
import { Input } from "../components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select"
import { toast } from "../components/sonner"
import { Spinner } from "../components/spinner"
import { Tabs, TabsList, TabsTrigger } from "../components/tabs"
import { useBackgroundActivities } from "../lib/background-activity"
import { FolderExplorer } from "./components/folder-explorer"
import { GroupDetail } from "./components/group-detail"
import { GroupTreeCombobox } from "./components/group-tree-combobox"
import { NoteDetail } from "./components/note-detail"
import { NoteGraph } from "./components/note-graph"
import { TagAutocomplete } from "./components/tag-autocomplete"
import { buildDescendantIdMap, buildPathLabelMap } from "./lib/note-group-tree"

type View = "graph" | "folders"
type Sort =
  | "updated-desc"
  | "updated-asc"
  | "created-desc"
  | "created-asc"
  | "title-asc"
  | "title-desc"
type HasUrlFilter = "all" | "with-url" | "without-url"
type StatusFilter = "all" | "open" | "archived"

export interface NotesClient {
  notes: {
    graph: () => Promise<NotesGraphResponse>
    tags: () => Promise<NoteTagsResponse>
    create: (input: CreateNoteInput) => Promise<{ note: Note }>
    update: (id: string, input: UpdateNoteInput) => Promise<{ note: Note }>
    delete: (id: string) => Promise<{ id: string }>
    groups: {
      create: (input: CreateNoteGroupInput) => Promise<{ group: NoteGroup }>
      update: (
        id: string,
        input: UpdateNoteGroupInput
      ) => Promise<{ group: NoteGroup }>
      delete: (id: string) => Promise<{ id: string }>
    }
  }
}

export interface NotesDashboardProps {
  user: AppHeaderUser
  onSignOut: () => Promise<void>
  onSettings?: () => void
  onResolveWorkspace: () => Promise<void>
  client: NotesClient
  headerClassName?: string
  headerDragRegion?: boolean
  headerEndSlot?: ReactNode
  headerTitle?: string
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

function parseHttpUrl(text: string) {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

function isEditablePasteTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(
    target.closest(
      "input, textarea, [contenteditable='true'], [role='textbox']"
    )
  )
}

function sortNotes(notes: Note[], sort: Sort) {
  const items = [...notes]
  items.sort((left, right) => {
    switch (sort) {
      case "updated-asc":
        return (
          new Date(left.updatedAt).getTime() -
          new Date(right.updatedAt).getTime()
        )
      case "created-desc":
        return (
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
        )
      case "created-asc":
        return (
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime()
        )
      case "title-asc":
        return left.title.localeCompare(right.title)
      case "title-desc":
        return right.title.localeCompare(left.title)
      default:
        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        )
    }
  })
  return items
}

function matchesQuery(note: Note, query: string, groupSearchLabels: string[]) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return [
    note.title,
    note.contentPlainText,
    note.url,
    note.description,
    note.siteName,
    note.class,
    ...groupSearchLabels,
    ...note.tags,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized))
}

function collectVisibleGroups(notes: Note[], groups: NoteGroup[]) {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const visible = new Set<string>()
  for (const note of notes) {
    for (const groupId of note.groupIds) {
      let currentId: string | null | undefined = groupId
      while (currentId) {
        if (visible.has(currentId)) break
        visible.add(currentId)
        currentId = byId.get(currentId)?.parentId ?? null
      }
    }
  }
  return groups.filter((group) => visible.has(group.id))
}

function mergePatchedNote(current: Note, server: Note, input: UpdateNoteInput) {
  return {
    ...server,
    title: input.title !== undefined ? server.title : current.title,
    content: input.content !== undefined ? server.content : current.content,
    contentPlainText:
      input.content !== undefined
        ? server.contentPlainText
        : current.contentPlainText,
    url: input.url !== undefined ? server.url : current.url,
    description:
      input.description !== undefined
        ? server.description
        : current.description,
    siteName: input.siteName !== undefined ? server.siteName : current.siteName,
    favicon: input.favicon !== undefined ? server.favicon : current.favicon,
    image: input.image !== undefined ? server.image : current.image,
    publishedAt:
      input.publishedAt !== undefined
        ? server.publishedAt
        : current.publishedAt,
    tags: input.tags !== undefined ? server.tags : current.tags,
    groupIds: input.groupIds !== undefined ? server.groupIds : current.groupIds,
    manualGroupIds:
      input.groupIds !== undefined
        ? server.manualGroupIds
        : current.manualGroupIds,
    status: input.status !== undefined ? server.status : current.status,
    class: input.class !== undefined ? server.class : current.class,
    summary: input.summary !== undefined ? server.summary : current.summary,
  } satisfies Note
}

export function NotesDashboard({
  user,
  onSignOut,
  onSettings,
  onResolveWorkspace,
  client,
  headerClassName,
  headerDragRegion,
  headerEndSlot,
  headerTitle = "Notes",
}: NotesDashboardProps) {
  const backgroundActivities = useBackgroundActivities()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<View>("graph")
  const [notes, setNotes] = useState<Note[]>([])
  const [groups, setGroups] = useState<NoteGroup[]>([])
  const [edges, setEdges] = useState<NoteEdge[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedGroupFilters, setSelectedGroupFilters] = useState<string[]>([])
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([])
  const [hasUrlFilter, setHasUrlFilter] = useState<HasUrlFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<Sort>("updated-desc")
  const [importingLink, setImportingLink] = useState(false)
  const [creatingNote, setCreatingNote] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [creatingGroup, setCreatingGroup] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true)
      else setLoading(true)
      try {
        const [graphResult, tagsResult] = await Promise.all([
          client.notes.graph(),
          client.notes.tags(),
        ])
        setNotes(graphResult.notes)
        setGroups(graphResult.groups)
        setEdges(graphResult.edges)
        setTagSuggestions(tagsResult.tags)
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not load notes"))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [client]
  )

  // Refresh when the assistant mutates notes data (create/update/delete note or
  // group) so its changes appear without a manual reload.
  useModuleDataInvalidation("notes", () => {
    void load(true)
  })

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
    if (selectedId && !notes.some((note) => note.id === selectedId)) {
      setSelectedId(null)
    }
  }, [notes, selectedId])

  useEffect(() => {
    if (
      selectedGroupId &&
      !groups.some((group) => group.id === selectedGroupId)
    ) {
      setSelectedGroupId(null)
    }
  }, [groups, selectedGroupId])

  const applyUpdatedNote = useCallback((next: Note) => {
    setNotes((current) =>
      current.some((note) => note.id === next.id)
        ? current.map((note) => (note.id === next.id ? next : note))
        : [next, ...current]
    )
  }, [])

  const handlePatchNote = useCallback(
    async (id: string, body: UpdateNoteInput) => {
      const snapshot = notes
      setNotes((current) =>
        current.map((note) => (note.id === id ? { ...note, ...body } : note))
      )
      try {
        const { note } = await client.notes.update(id, body)
        let mergedNote = note
        setNotes((current) =>
          current.some((currentNote) => currentNote.id === id)
            ? current.map((currentNote) => {
                if (currentNote.id !== id) return currentNote
                mergedNote = mergePatchedNote(currentNote, note, body)
                return mergedNote
              })
            : [note, ...current]
        )
        return mergedNote
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not save note"))
        const snapshotNote = snapshot.find((note) => note.id === id)
        setNotes((current) =>
          current.map((currentNote) =>
            currentNote.id === id && snapshotNote
              ? mergePatchedNote(currentNote, snapshotNote, body)
              : currentNote
          )
        )
        return null
      }
    },
    [client, notes]
  )

  const handleDeleteNote = useCallback(
    async (id: string) => {
      const previousNotes = notes
      const previousEdges = edges
      setNotes((current) => current.filter((note) => note.id !== id))
      setEdges((current) =>
        current.filter((edge) => edge.fromNoteId !== id && edge.toNoteId !== id)
      )
      setSelectedId(null)
      try {
        await client.notes.delete(id)
        toast.success("Note deleted")
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not delete note"))
        setNotes(previousNotes)
        setEdges(previousEdges)
      }
    },
    [client, edges, notes]
  )

  const handlePasteImport = useCallback(
    async (url: string) => {
      if (importingLink) return
      setImportingLink(true)
      const toastId = toast.loading("Importing link...")
      try {
        const { note } = await client.notes.create({ url })
        applyUpdatedNote(note)
        setSelectedGroupId(null)
        setSelectedId(note.id)
        setTagSuggestions((current) =>
          [...new Set([...current, ...note.tags])].sort((left, right) =>
            left.localeCompare(right)
          )
        )
        toast.success("Link imported", { id: toastId })
        void load(true)
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not import link"), {
          id: toastId,
        })
      } finally {
        setImportingLink(false)
      }
    },
    [applyUpdatedNote, client, importingLink, load]
  )

  const handleUpdateGroup = useCallback(
    async (id: string, patch: UpdateNoteGroupInput) => {
      const previousGroups = groups
      setGroups((current) =>
        current.map((group) =>
          group.id === id ? { ...group, ...patch } : group
        )
      )
      try {
        const { group } = await client.notes.groups.update(id, patch)
        setGroups((current) =>
          current.map((current_group) =>
            current_group.id === id ? group : current_group
          )
        )
        if (patch.parentId !== undefined) await load(true)
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not update group"))
        setGroups(previousGroups)
      }
    },
    [client, groups, load]
  )

  const handleDeleteGroup = useCallback(
    async (id: string) => {
      const previousGroups = groups
      const previousNotes = notes
      setGroups((current) => current.filter((group) => group.id !== id))
      setNotes((current) =>
        current.map((note) => ({
          ...note,
          groupIds: note.groupIds.filter((groupId) => groupId !== id),
        }))
      )
      setSelectedGroupId(null)
      try {
        await client.notes.groups.delete(id)
        toast.success("Group deleted")
        await load(true)
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not delete group"))
        setGroups(previousGroups)
        setNotes(previousNotes)
      }
    },
    [client, groups, notes, load]
  )

  const createNote = async () => {
    setCreatingNote(true)
    try {
      const inheritedGroupIds =
        view === "folders" && folderId
          ? [folderId]
          : selectedGroupFilters.length > 0
            ? selectedGroupFilters
            : undefined
      const { note } = await client.notes.create({
        title: "Untitled note",
        groupIds: inheritedGroupIds,
      })
      applyUpdatedNote(note)
      setSelectedGroupId(null)
      setSelectedId(note.id)
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create note"))
    } finally {
      setCreatingNote(false)
    }
  }

  const createGroup = async () => {
    const name = groupName.trim()
    if (!name) return
    setCreatingGroup(true)
    try {
      const { group } = await client.notes.groups.create({
        name,
        parentId:
          selectedGroupFilters.length === 1
            ? selectedGroupFilters[0]
            : undefined,
      })
      setGroups((current) => [...current, group])
      setGroupName("")
      setGroupDialogOpen(false)
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create group"))
    } finally {
      setCreatingGroup(false)
    }
  }

  const pathLabelById = useMemo(() => buildPathLabelMap(groups), [groups])
  const descendantIdsByGroup = useMemo(
    () => buildDescendantIdMap(groups),
    [groups]
  )
  const allTags = useMemo(
    () =>
      [
        ...new Set([...tagSuggestions, ...notes.flatMap((note) => note.tags)]),
      ].sort((left, right) => left.localeCompare(right)),
    [notes, tagSuggestions]
  )

  const selectedGroupScope = useMemo(() => {
    const next = new Set<string>()
    for (const groupId of selectedGroupFilters) {
      for (const scopedId of descendantIdsByGroup.get(groupId) ?? [groupId]) {
        next.add(scopedId)
      }
    }
    return next
  }, [descendantIdsByGroup, selectedGroupFilters])

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const groupSearchLabels = note.groupIds
        .map((groupId) => pathLabelById.get(groupId))
        .filter((label): label is string => Boolean(label))
      if (!matchesQuery(note, query, groupSearchLabels)) return false
      if (statusFilter !== "all" && note.status !== statusFilter) return false
      if (hasUrlFilter === "with-url" && !note.url) return false
      if (hasUrlFilter === "without-url" && note.url) return false
      if (
        selectedGroupScope.size > 0 &&
        !note.groupIds.some((groupId) => selectedGroupScope.has(groupId))
      ) {
        return false
      }
      if (
        selectedTagFilters.length > 0 &&
        !selectedTagFilters.every((tag) => note.tags.includes(tag))
      ) {
        return false
      }
      return true
    })
  }, [
    hasUrlFilter,
    notes,
    pathLabelById,
    query,
    selectedGroupScope,
    selectedTagFilters,
    statusFilter,
  ])

  const sortedNotes = useMemo(
    () => sortNotes(filteredNotes, sort),
    [filteredNotes, sort]
  )

  const graphGroups = useMemo(
    () => collectVisibleGroups(sortedNotes, groups),
    [groups, sortedNotes]
  )

  const graphEdges = useMemo(() => {
    const visibleIds = new Set(sortedNotes.map((note) => note.id))
    return edges.filter(
      (edge) => visibleIds.has(edge.fromNoteId) && visibleIds.has(edge.toNoteId)
    )
  }, [edges, sortedNotes])

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId]
  )
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  )

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (
        importingLink ||
        selectedId ||
        selectedGroupId ||
        isEditablePasteTarget(event.target)
      ) {
        return
      }
      const text = event.clipboardData?.getData("text") ?? ""
      const url = parseHttpUrl(text)
      if (!url) return
      event.preventDefault()
      void handlePasteImport(url)
    }
    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [handlePasteImport, importingLink, selectedGroupId, selectedId])

  const hasActiveFilters =
    query.trim().length > 0 ||
    selectedGroupFilters.length > 0 ||
    selectedTagFilters.length > 0 ||
    hasUrlFilter !== "all" ||
    statusFilter !== "all" ||
    sort !== "updated-desc"

  const header = (
    <AppHeader
      title={headerTitle}
      className={headerClassName}
      dragRegion={headerDragRegion}
      sidebarOpen={false}
      user={user}
      onSettings={onSettings}
      onLogout={() => void onSignOut()}
      backgroundItems={backgroundActivities}
      notifications={[]}
      endSlot={headerEndSlot}
    />
  )

  if (!ready || loading) {
    return (
      <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      </div>
    )
  }

  let body: ReactNode
  if (selectedNote) {
    body = (
      <NoteDetail
        note={selectedNote}
        allNotes={notes}
        groups={groups}
        edges={edges}
        suggestions={allTags}
        onPatch={(input) => handlePatchNote(selectedNote.id, input)}
        onDelete={() => handleDeleteNote(selectedNote.id)}
        onBack={() => setSelectedId(null)}
        onSelectNote={(note) => {
          setSelectedGroupId(null)
          setSelectedId(note.id)
        }}
        onSuggestionsChange={setTagSuggestions}
      />
    )
  } else if (selectedGroup) {
    body = (
      <GroupDetail
        group={selectedGroup}
        groups={groups}
        notes={notes}
        onBack={() => setSelectedGroupId(null)}
        onUpdate={handleUpdateGroup}
        onDelete={handleDeleteGroup}
        onSelectNote={(note) => {
          setSelectedGroupId(null)
          setSelectedId(note.id)
        }}
        onSelectGroup={(group) => setSelectedGroupId(group.id)}
      />
    )
  } else {
    body = (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <div className="flex shrink-0 items-center gap-2">
            <FileText className="size-4" />
            <span className="font-medium text-sm">Notes</span>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {sortedNotes.length} / {notes.length} · {groups.length} groups
            </span>
          </div>

          <div className="flex grow items-center gap-2 sm:ml-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, content, url, tags…"
              className="h-7 w-full! max-w-full! text-xs"
            />

            <Tabs
              value={view}
              onValueChange={(value) => setView(value as View)}
            >
              <TabsList className="h-7!">
                <TabsTrigger value="graph" className="h-5.5 px-2 text-xs">
                  <LayoutGrid className="size-3.5" />
                </TabsTrigger>
                <TabsTrigger value="folders" className="h-5.5 px-2 text-xs">
                  <FolderTree className="size-3.5" />
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => void load(true)}
              title="Refresh"
            >
              {refreshing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="size-3.5" />
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setGroupDialogOpen(true)}
            >
              <FolderPlus className="size-3.5" />
              <span className="hidden sm:inline">Group</span>
            </Button>

            <Button
              size="sm"
              className="h-7"
              onClick={() => void createNote()}
              disabled={creatingNote}
            >
              {creatingNote ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FilePlus2 className="size-3.5" />
              )}
              <span className="hidden sm:inline">Note</span>
            </Button>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 border-b px-4 py-2">
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <FolderTree className="size-3.5" />
            </span>
            <GroupTreeCombobox
              groups={groups}
              value={selectedGroupFilters}
              onChange={setSelectedGroupFilters}
              placeholder="Filter groups…"
              searchPlaceholder="Search group hierarchy…"
              emptyMessage="No groups yet"
            />
          </div>

          <div className="flex min-w-0 max-w-full items-center gap-2">
            <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <Tags className="size-3.5" />
            </span>
            <TagAutocomplete
              value={selectedTagFilters}
              onChange={setSelectedTagFilters}
              suggestions={allTags}
              placeholder="Filter tags…"
              allowCreate={false}
              searchPlaceholder="Search tags…"
              emptyMessage="No tags found"
            />
          </div>

          <Select
            value={hasUrlFilter}
            onValueChange={(value) => setHasUrlFilter(value as HasUrlFilter)}
          >
            <SelectTrigger size="sm" className="w-32 text-xs sm:ml-auto">
              <div className="flex h-4! items-center gap-1.5">
                <Link2 className="size-3.5" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all" className="text-xs">
                All links
              </SelectItem>
              <SelectItem value="with-url" className="text-xs">
                With URL
              </SelectItem>
              <SelectItem value="without-url" className="text-xs">
                Without URL
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger size="sm" className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all" className="text-xs">
                All status
              </SelectItem>
              <SelectItem value="open" className="text-xs">
                Open
              </SelectItem>
              <SelectItem value="archived" className="text-xs">
                Archived
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(value) => setSort(value as Sort)}
          >
            <SelectTrigger size="sm" className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="updated-desc" className="text-xs">
                Updated newest
              </SelectItem>
              <SelectItem value="updated-asc" className="text-xs">
                Updated oldest
              </SelectItem>
              <SelectItem value="created-desc" className="text-xs">
                Created newest
              </SelectItem>
              <SelectItem value="created-asc" className="text-xs">
                Created oldest
              </SelectItem>
              <SelectItem value="title-asc" className="text-xs">
                Title A-Z
              </SelectItem>
              <SelectItem value="title-desc" className="text-xs">
                Title Z-A
              </SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setQuery("")
                setSelectedGroupFilters([])
                setSelectedTagFilters([])
                setHasUrlFilter("all")
                setStatusFilter("all")
                setSort("updated-desc")
              }}
            >
              <X className="size-3.5" />
              Clear
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "graph" ? (
            <NoteGraph
              notes={sortedNotes}
              groups={graphGroups}
              edges={graphEdges}
              onSelectNote={(note) => {
                setSelectedGroupId(null)
                setSelectedId(note.id)
              }}
              onSelectGroup={(group) => {
                setSelectedId(null)
                setSelectedGroupId(group.id)
              }}
            />
          ) : (
            <FolderExplorer
              notes={sortedNotes}
              groups={groups}
              currentId={folderId}
              onNavigate={setFolderId}
              onSelectNote={(note) => {
                setSelectedGroupId(null)
                setSelectedId(note.id)
              }}
              onOpenGroup={(group) => {
                setSelectedId(null)
                setSelectedGroupId(group.id)
              }}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
      {header}
      {body}

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void createGroup()
            }}
          >
            <DialogHeader>
              <DialogTitle>New group</DialogTitle>
              <DialogDescription>
                {selectedGroupFilters.length === 1
                  ? "Create a group inside the filtered group."
                  : "Create a top-level group."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                autoFocus
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Group name"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGroupDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!groupName.trim() || creatingGroup}
              >
                {creatingGroup ? <Spinner className="size-3.5" /> : null}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
