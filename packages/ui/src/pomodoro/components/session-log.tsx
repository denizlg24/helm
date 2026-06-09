"use client"

import type { PomodoroSession } from "@workspace/types"
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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { MarkdownRenderer } from "@workspace/ui/components/markdown-renderer"
import { cn } from "@workspace/ui/lib/utils"
import { format, isToday, isYesterday } from "date-fns"
import { ChevronDown, PenLine, Sailboat, Trash2, Waves } from "lucide-react"
import { useMemo, useState } from "react"

interface SessionLogProps {
  sessions: PomodoroSession[]
  dailyGoal: number
  onAnnotate: (session: PomodoroSession) => void
  onDelete: (id: string) => Promise<void>
}

interface DayGroup {
  key: string
  date: Date
  sessions: PomodoroSession[]
  completedCount: number
}

const dayLabel = (date: Date): string => {
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "EEEE, MMM d")
}

const durationLabel = (seconds: number): string => {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const groupByDay = (sessions: PomodoroSession[]): DayGroup[] => {
  const groups = new Map<string, DayGroup>()
  for (const session of sessions) {
    const startedAt = new Date(session.startedAt)
    const key = format(startedAt, "yyyy-MM-dd")
    const group = groups.get(key) ?? {
      key,
      date: startedAt,
      sessions: [],
      completedCount: 0,
    }
    group.sessions.push(session)
    if (session.status === "completed") group.completedCount += 1
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key))
}

export function SessionLog({
  sessions,
  dailyGoal,
  onAnnotate,
  onDelete,
}: SessionLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PomodoroSession | null>(null)
  const [deleting, setDeleting] = useState(false)
  const groups = useMemo(() => groupByDay(sessions), [sessions])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await onDelete(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-border border-dashed px-6 py-12 text-center">
        <Sailboat className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 font-medium text-sm">No sessions yet</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Completed focus sessions will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key}>
          <header className="flex items-baseline justify-between gap-4">
            <h3 className="font-medium text-sm">{dayLabel(group.date)}</h3>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {Array.from({ length: Math.max(dailyGoal, 0) }, (_, index) => (
                <Sailboat
                  className={cn(
                    "size-3.5",
                    index < group.completedCount
                      ? "text-foreground"
                      : "opacity-30"
                  )}
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size goal slots.
                  key={index}
                />
              ))}
              <span className="ml-1 text-xs tabular-nums">
                {group.completedCount}/{dailyGoal}
              </span>
            </div>
          </header>
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {group.sessions.map((session) => {
              const expanded = expandedId === session.id
              const abandoned = session.status === "abandoned"
              return (
                <li key={session.id}>
                  <button
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => setExpandedId(expanded ? null : session.id)}
                    type="button"
                  >
                    {abandoned ? (
                      <Waves className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Sailboat className="size-4 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          !session.subject && "text-muted-foreground italic"
                        )}
                      >
                        {session.subject ??
                          (abandoned ? "Ended early" : "Untitled session")}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {format(new Date(session.startedAt), "HH:mm")} ·{" "}
                        {durationLabel(session.completedSeconds)}
                        {abandoned ? ` of ${session.plannedMinutes} min` : null}
                      </p>
                    </div>
                    {session.topics.length > 0 ? (
                      <div className="hidden items-center gap-1 sm:flex">
                        {session.topics.slice(0, 3).map((topic) => (
                          <Badge key={topic} variant="outline">
                            {topic}
                          </Badge>
                        ))}
                        {session.topics.length > 3 ? (
                          <span className="text-muted-foreground text-xs">
                            +{session.topics.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        expanded && "rotate-180"
                      )}
                    />
                  </button>
                  {expanded ? (
                    <div className="border-border border-t bg-muted/30 px-4 py-3">
                      {session.notes.trim() ? (
                        <MarkdownRenderer content={session.notes} />
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          No notes for this session.
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          onClick={() => onAnnotate(session)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <PenLine className="size-3.5" />
                          Edit notes
                        </Button>
                        <Button
                          onClick={() => setDeleteTarget(session)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The session and its notes will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
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
