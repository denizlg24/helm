"use client"

import type { Note, NoteGroup } from "@workspace/types"
import {
  ChevronRight,
  CornerLeftUp,
  FileText,
  Folder,
  Globe,
  House,
  Settings2,
} from "lucide-react"
import { useMemo } from "react"
import { Button } from "../../components/button"
import { ScrollArea } from "../../components/scroll-area"
import { cn } from "../../lib/utils"
import { buildDescendantIdMap } from "../lib/note-group-tree"

function safeHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

interface Props {
  notes: Note[]
  groups: NoteGroup[]
  currentId: string | null
  onNavigate: (id: string | null) => void
  onSelectNote: (note: Note) => void
  onOpenGroup: (group: NoteGroup) => void
}

export function FolderExplorer({
  notes,
  groups,
  currentId,
  onNavigate,
  onSelectNote,
  onOpenGroup,
}: Props) {
  const setCurrentId = onNavigate

  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  )
  const descendantIdsByGroup = useMemo(
    () => buildDescendantIdMap(groups),
    [groups]
  )

  // If the current folder disappears (deleted/reparented), fall back to root.
  const current = currentId ? (groupById.get(currentId) ?? null) : null
  const activeId = current ? current.id : null

  const breadcrumb = useMemo(() => {
    const trail: NoteGroup[] = []
    let cursor: string | null | undefined = activeId
    const visited = new Set<string>()
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor)
      const group = groupById.get(cursor)
      if (!group) break
      trail.unshift(group)
      cursor = group.parentId ?? null
    }
    return trail
  }, [activeId, groupById])

  const childFolders = useMemo(
    () =>
      groups
        .filter((group) => (group.parentId ?? null) === activeId)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [groups, activeId]
  )

  const folderNoteCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of groups) {
      const scope = descendantIdsByGroup.get(group.id) ?? new Set([group.id])
      counts.set(
        group.id,
        notes.filter((note) =>
          note.groupIds.some((groupId) => scope.has(groupId))
        ).length
      )
    }
    return counts
  }, [groups, notes, descendantIdsByGroup])

  const folderNotes = useMemo(() => {
    if (activeId === null) {
      return notes.filter((note) => note.groupIds.length === 0)
    }
    return notes.filter((note) => note.groupIds.includes(activeId))
  }, [notes, activeId])

  const isEmpty = childFolders.length === 0 && folderNotes.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3 text-xs">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={activeId === null}
          onClick={() => setCurrentId(current?.parentId ?? null)}
          title="Up one level"
        >
          <CornerLeftUp />
        </Button>
        <button
          type="button"
          onClick={() => setCurrentId(null)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted",
            activeId === null
              ? "font-medium text-foreground"
              : "text-muted-foreground"
          )}
        >
          <House className="size-3.5" />
          Notes
        </button>
        {breadcrumb.map((group, index) => (
          <span key={group.id} className="flex items-center gap-1">
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setCurrentId(group.id)}
              className={cn(
                "max-w-40 truncate rounded px-1.5 py-0.5 hover:bg-muted",
                index === breadcrumb.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {group.name}
            </button>
          </span>
        ))}
        {current && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={() => onOpenGroup(current)}
            title="Folder details"
          >
            <Settings2 />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isEmpty ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground text-xs">
            This folder is empty.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 p-4">
            {childFolders.map((group) => (
              <FolderTile
                key={group.id}
                group={group}
                count={folderNoteCount.get(group.id) ?? 0}
                onOpen={() => setCurrentId(group.id)}
                onDetails={() => onOpenGroup(group)}
              />
            ))}
            {folderNotes.map((note) => (
              <NoteTile
                key={note.id}
                note={note}
                onOpen={() => onSelectNote(note)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function FolderTile({
  group,
  count,
  onOpen,
  onDetails,
}: {
  group: NoteGroup
  count: number
  onOpen: () => void
  onDetails: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onDoubleClick={onOpen}
        onClick={onOpen}
        className="flex w-full flex-col items-center gap-2 rounded-lg border border-transparent px-3 py-4 text-center transition-colors hover:border-border hover:bg-muted/50"
        title={group.name}
      >
        <Folder
          className="size-9"
          style={{ color: group.color ?? undefined }}
          fill={group.color ?? "currentColor"}
          fillOpacity={0.15}
        />
        <span className="line-clamp-2 w-full wrap-break-word font-medium text-xs leading-tight">
          {group.name}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {count} {count === 1 ? "note" : "notes"}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onDetails}
        title="Folder details"
      >
        <Settings2 />
      </Button>
    </div>
  )
}

function NoteTile({ note, onOpen }: { note: Note; onOpen: () => void }) {
  return (
    <button
      type="button"
      onDoubleClick={onOpen}
      onClick={onOpen}
      className="flex flex-col items-center gap-2 rounded-lg border border-transparent px-3 py-4 text-center transition-colors hover:border-border hover:bg-muted/50"
      title={note.title}
    >
      <span className="flex size-9 items-center justify-center">
        {note.favicon ? (
          <img src={note.favicon} alt="" className="size-6 rounded-sm" />
        ) : note.url ? (
          <Globe className="size-8 text-muted-foreground" />
        ) : (
          <FileText
            className="size-8 text-muted-foreground"
            strokeWidth={1.25}
          />
        )}
      </span>
      <span className="line-clamp-2 w-full wrap-break-word font-medium text-xs leading-tight">
        {note.title}
      </span>
      <span className="w-full truncate text-[10px] text-muted-foreground">
        {note.url ? safeHostname(note.url) : "note"}
      </span>
    </button>
  )
}
