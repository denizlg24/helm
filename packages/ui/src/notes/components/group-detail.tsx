"use client"

import type { Note, NoteGroup, UpdateNoteGroupInput } from "@workspace/types"
import { ArrowLeft, FolderTree, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/alert-dialog"
import { Button } from "../../components/button"
import { Input } from "../../components/input"
import { Label } from "../../components/label"
import { Textarea } from "../../components/textarea"
import type { GroupLike } from "../lib/note-group-tree"
import { GroupTreeCombobox } from "./group-tree-combobox"

interface Props {
  group: NoteGroup
  groups: NoteGroup[]
  notes: Note[]
  onBack: () => void
  onUpdate: (id: string, patch: UpdateNoteGroupInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSelectNote: (note: Note) => void
  onSelectGroup: (group: NoteGroup) => void
}

const NONE_VALUE = "__none__"

function descendantIds(rootId: string, groups: NoteGroup[]): Set<string> {
  const result = new Set<string>()
  const stack = [rootId]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    for (const group of groups) {
      if (group.parentId === current && !result.has(group.id)) {
        result.add(group.id)
        stack.push(group.id)
      }
    }
  }

  return result
}

export function GroupDetail({
  group,
  groups,
  notes,
  onBack,
  onUpdate,
  onDelete,
  onSelectNote,
  onSelectGroup,
}: Props) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || "")

  useEffect(() => {
    setName(group.name)
    setDescription(group.description || "")
  }, [group.id, group.name, group.description])

  const parentOptions = useMemo(() => {
    const forbidden = descendantIds(group.id, groups)
    forbidden.add(group.id)

    return groups
      .filter((candidate) => !forbidden.has(candidate.id))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [group.id, groups])

  const parent = useMemo(() => {
    if (!group.parentId) return null
    return groups.find((candidate) => candidate.id === group.parentId) ?? null
  }, [group.parentId, groups])

  const subtreeIds = useMemo(() => {
    const result = descendantIds(group.id, groups)
    result.add(group.id)
    return result
  }, [group.id, groups])

  const members = useMemo(
    () =>
      notes.filter((note) =>
        note.groupIds.some((groupId) => subtreeIds.has(groupId))
      ),
    [notes, subtreeIds]
  )

  const directMemberCount = useMemo(
    () => notes.filter((note) => note.groupIds.includes(group.id)).length,
    [notes, group.id]
  )

  const nestedMemberCount = members.length - directMemberCount
  const children = groups.filter((candidate) => candidate.parentId === group.id)

  const saveName = () => {
    if (name.trim() && name !== group.name) {
      void onUpdate(group.id, { name: name.trim() })
    }
  }

  const saveDescription = () => {
    if (description !== (group.description || "")) {
      void onUpdate(group.id, { description })
    }
  }

  const handleParentChange = (value: string) => {
    const next = value === NONE_VALUE ? null : value
    if ((group.parentId ?? null) === next) return
    void onUpdate(group.id, { parentId: next })
  }

  const parentComboGroups: GroupLike[] = [
    { id: NONE_VALUE, name: "None", parentId: null },
    ...parentOptions,
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onBack} title="Back">
            <ArrowLeft className="size-4" />
          </Button>
          <FolderTree className="size-4" />
          <div className="flex items-center gap-1.5 text-xs">
            {parent && (
              <>
                <button
                  type="button"
                  onClick={() => onSelectGroup(parent)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {parent.name}
                </button>
                <span className="text-muted-foreground">/</span>
              </>
            )}
            <span className="font-medium">{group.name}</span>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this group?</AlertDialogTitle>
              <AlertDialogDescription>
                Child groups become top-level. Notes stay but lose this
                membership.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void onDelete(group.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 p-6">
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={saveDescription}
              placeholder="What this group is about…"
              className="min-h-20 text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Parent group</Label>
            <GroupTreeCombobox
              groups={parentComboGroups}
              value={[parent ? parent.id : NONE_VALUE]}
              onChange={(next) => {
                const currentId = parent ? parent.id : NONE_VALUE
                if (next.length === 0) {
                  handleParentChange(NONE_VALUE)
                  return
                }
                const added = next.find((id) => id !== currentId)
                handleParentChange(added ?? NONE_VALUE)
              }}
              placeholder="None"
              searchPlaceholder="Search group hierarchy…"
              emptyMessage="No groups yet"
            />
          </div>

          {children.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Sub-groups ({children.length})</Label>
              <div className="flex flex-wrap gap-1">
                {children.map((child) => (
                  <button
                    type="button"
                    key={child.id}
                    onClick={() => onSelectGroup(child)}
                    className="rounded border px-2 py-0.5 text-[10px] hover:bg-muted"
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">
              Members ({members.length})
              {nestedMemberCount > 0 && (
                <span className="ml-1 font-normal text-muted-foreground">
                  · {directMemberCount} direct · {nestedMemberCount} nested
                </span>
              )}
            </Label>
            <div className="divide-y rounded border">
              {members.length === 0 ? (
                <div className="p-3 text-muted-foreground text-xs">
                  No notes in this group.
                </div>
              ) : (
                members.map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    onClick={() => onSelectNote(note)}
                    className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
                  >
                    {note.favicon ? (
                      <img
                        src={note.favicon}
                        alt=""
                        className="size-3.5 shrink-0 rounded-sm"
                      />
                    ) : (
                      <div className="flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted text-[8px] text-muted-foreground">
                        N
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {note.title}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground">
            {group.source === "user" ? "Manually created" : "Auto-created"} ·{" "}
            {new Date(group.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  )
}
