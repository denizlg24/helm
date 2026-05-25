"use client"

import type { AssistantConversationSummary } from "@workspace/types"
import { ASSISTANT_MODELS } from "@workspace/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import {
  AlertTriangle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  PlusIcon,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { useMemo, useState } from "react"

export interface ConversationSidebarProps {
  conversations: AssistantConversationSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename?: (id: string, title: string) => void
  loading?: boolean
}

const MODEL_LABELS: Record<string, string> = Object.fromEntries(
  ASSISTANT_MODELS.map((model) => [model.id, model.label])
)

interface ConversationGroup {
  label: string
  conversations: AssistantConversationSummary[]
}

// Buckets conversations into recency bands by `lastMessageAt`. Within each band
// the source order (already newest-first from the API) is preserved. Empty
// bands are dropped so headers only show when they have rows.
const groupConversationsByDate = (
  conversations: AssistantConversationSummary[]
): ConversationGroup[] => {
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const startOfYesterday = startOfToday - dayMs
  const sevenDaysAgo = startOfToday - 7 * dayMs
  const thirtyDaysAgo = startOfToday - 30 * dayMs

  const bands: ConversationGroup[] = [
    { label: "Today", conversations: [] },
    { label: "Yesterday", conversations: [] },
    { label: "Previous 7 days", conversations: [] },
    { label: "Previous 30 days", conversations: [] },
    { label: "Older", conversations: [] },
  ]
  const [today, yesterday, week, month, older] = bands

  const sorted = [...conversations].sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  )

  for (const conversation of sorted) {
    const at = conversation.lastMessageAt.getTime()
    if (at >= startOfToday) today?.conversations.push(conversation)
    else if (at >= startOfYesterday) yesterday?.conversations.push(conversation)
    else if (at >= sevenDaysAgo) week?.conversations.push(conversation)
    else if (at >= thirtyDaysAgo) month?.conversations.push(conversation)
    else older?.conversations.push(conversation)
  }

  return bands.filter((band) => band.conversations.length > 0)
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  loading,
}: ConversationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [renamingOriginalTitle, setRenamingOriginalTitle] = useState("")
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (query.length === 0) return conversations
    return conversations.filter((c) => c.title.toLowerCase().includes(query))
  }, [conversations, searchQuery])

  const groups = useMemo(() => groupConversationsByDate(filtered), [filtered])

  const commitRename = (id: string) => {
    const title = renameDraft.trim()
    setRenamingId(null)
    setRenamingOriginalTitle("")
    if (title.length > 0 && title !== renamingOriginalTitle) {
      onRename?.(id, title)
    }
  }

  const startRename = (conversation: AssistantConversationSummary) => {
    window.setTimeout(() => {
      setRenameDraft(conversation.title)
      setRenamingOriginalTitle(conversation.title)
      setRenamingId(conversation.id)
    }, 0)
  }

  const pendingDeleteTitle = conversations.find(
    (c) => c.id === pendingDeleteId
  )?.title

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-3 py-3">
        <span className="font-medium text-foreground text-sm">
          Conversations
        </span>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-2">
        {conversations.length > 0 ? (
          <>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                placeholder="Search conversations…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-8 pr-7 pl-8 text-sm"
              />
              {searchQuery.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <Separator className="my-2" />
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={onNew}
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <PlusIcon className="size-4" />
          New chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-3">
          {loading && conversations.length === 0 ? (
            <div className="flex flex-col gap-0.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholder
                  key={index}
                  className="flex items-center gap-2 px-2 py-2"
                >
                  <Skeleton className="size-3.5 shrink-0 rounded" />
                  <Skeleton
                    className="h-4 flex-1 rounded"
                    style={{ maxWidth: `${55 + ((index * 23) % 35)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <p className="px-2 py-4 text-center text-muted-foreground text-sm">
              {searchQuery.trim().length > 0
                ? "No conversations found."
                : "No conversations yet."}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 py-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.conversations.map((conversation) => {
                      const isRenaming = renamingId === conversation.id
                      const isActive = activeId === conversation.id
                      if (isRenaming) {
                        return (
                          <div key={conversation.id} className="px-1 py-0.5">
                            <Input
                              autoFocus
                              value={renameDraft}
                              onChange={(event) =>
                                setRenameDraft(event.target.value)
                              }
                              onBlur={() => commitRename(conversation.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault()
                                  commitRename(conversation.id)
                                } else if (event.key === "Escape") {
                                  event.preventDefault()
                                  setRenamingId(null)
                                  setRenamingOriginalTitle("")
                                }
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                        )
                      }
                      return (
                        <div
                          key={conversation.id}
                          className={cn(
                            "group grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 transition-colors",
                            isActive ? "bg-muted" : "hover:bg-accent/50"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(conversation.id)}
                            className="col-span-2 grid grid-cols-[auto_1fr] items-center gap-2 py-2 text-left"
                          >
                            {conversation.hasPendingApproval ? (
                              <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                            ) : (
                              <MessageSquare
                                className={cn(
                                  "size-3.5 shrink-0",
                                  isActive
                                    ? "text-foreground/60"
                                    : "text-muted-foreground/50"
                                )}
                              />
                            )}
                            <span
                              className={cn(
                                "truncate text-sm",
                                isActive
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                              )}
                            >
                              {conversation.title}
                            </span>
                          </button>

                          <div className="flex min-w-0 items-center justify-end">
                            <span
                              className={cn(
                                "truncate text-[10px] group-hover:hidden",
                                isActive
                                  ? "text-foreground/45"
                                  : "text-muted-foreground/40"
                              )}
                            >
                              {MODEL_LABELS[conversation.model] ??
                                conversation.model}
                            </span>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Conversation actions"
                                  className="hidden size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex data-[state=open]:flex"
                                >
                                  <MoreHorizontal className="size-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {onRename ? (
                                  <DropdownMenuItem
                                    onSelect={() => startRename(conversation)}
                                  >
                                    <Pencil className="size-3.5" />
                                    Rename
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() =>
                                    setPendingDeleteId(conversation.id)
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTitle
                ? `“${pendingDeleteTitle}” and its messages will be permanently deleted. This cannot be undone.`
                : "This conversation and its messages will be permanently deleted. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) onDelete(pendingDeleteId)
                setPendingDeleteId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
