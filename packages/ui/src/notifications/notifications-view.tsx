"use client"

import {
  type Notification,
  type NotificationCategory,
  NotificationCategorySchema,
} from "@workspace/types"
import { Archive, BellOff, Inbox } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { Spinner } from "../components/spinner"
import { Tabs, TabsList, TabsTrigger } from "../components/tabs"
import { cn } from "../lib/utils"
import { formatRelativeTime } from "./notification-menu"
import { useNotifications } from "./notifications-provider"

type StatusFilter = "all" | "unread"

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  billing: "Billing",
  system: "System",
  pomodoro: "Pomodoro",
}

export function NotificationsView({ className }: { className?: string }) {
  const {
    items,
    unreadCount,
    loading,
    hasMore,
    loadMore,
    markRead,
    markAllRead,
    archive,
    resolveAction,
  } = useNotifications()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [category, setCategory] = useState<NotificationCategory | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (status === "all" || item.readAt === null) &&
          (category === null || item.category === category)
      ),
    [items, status, category]
  )

  const handleItemClick = (notification: Notification) => {
    if (notification.readAt === null) {
      void markRead([notification.id])
    }
    const action = notification.actions[0]
    if (action) resolveAction(action)
  }

  const handleLoadMore = async () => {
    setLoadingMore(true)
    try {
      await loadMore()
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-4", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-medium text-foreground text-lg">Notifications</h1>
        {unreadCount > 0 ? (
          <Badge variant="secondary">{unreadCount} unread</Badge>
        ) : null}
        <div className="ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0}
            onClick={() =>
              void markAllRead(category ? { category } : undefined)
            }
          >
            <BellOff className="size-4" />
            Mark all read
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          onValueChange={(value) => {
            if (value === "all" || value === "unread") setStatus(value)
          }}
          value={status}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-1.5">
          {NotificationCategorySchema.options.map((option) => (
            <Button
              key={option}
              type="button"
              variant={category === option ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() =>
                setCategory((current) => (current === option ? null : option))
              }
            >
              {CATEGORY_LABELS[option]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="size-5" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Inbox className="size-6" />
          <p className="text-sm">
            {status === "unread"
              ? "You're all caught up."
              : "Nothing needs your attention."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/70 rounded-lg border border-border/70">
          {visible.map((item) => (
            <div
              className="group flex items-start gap-3 px-4 py-4 text-sm hover:bg-accent/30"
              key={item.id}
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  item.readAt === null
                    ? item.severity === "error"
                      ? "bg-destructive"
                      : "bg-primary"
                    : "bg-border"
                )}
              />
              <div className="min-w-0 flex-1">
                {/* The clickable area is a real button; the per-action buttons
                    below are siblings, never nested inside it. */}
                <button
                  className="block w-full cursor-pointer text-left"
                  onClick={() => handleItemClick(item)}
                  type="button"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-medium text-foreground">
                      {item.title}
                    </span>
                    <Badge
                      className="shrink-0 text-[0.65rem]"
                      variant="outline"
                    >
                      {CATEGORY_LABELS[item.category]}
                    </Badge>
                    <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </span>
                  {item.body ? (
                    <span className="mt-1 block text-muted-foreground leading-5">
                      {item.body}
                    </span>
                  ) : null}
                </button>
                {item.actions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.actions.map((action) => (
                      <Button
                        key={action.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          if (item.readAt === null) void markRead([item.id])
                          resolveAction(action)
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button
                aria-label="Archive notification"
                className="size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => void archive(item.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Archive className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {hasMore && !loading ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          disabled={loadingMore}
          onClick={() => void handleLoadMore()}
        >
          {loadingMore ? <Spinner className="size-4" /> : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}
