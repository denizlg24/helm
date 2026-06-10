"use client"

import type { Notification, NotificationAction } from "@workspace/types"
import { Bell } from "lucide-react"
import { Button } from "../components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/sheet"
import { cn } from "../lib/utils"
import { useNotificationsOptional } from "./notifications-provider"

export function formatRelativeTime(value: Date): string {
  const seconds = Math.round((Date.now() - value.getTime()) / 1000)
  if (seconds < 60) return "now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return value.toLocaleDateString()
}

// Bell menu wired to the NotificationsProvider context. Renders nothing when
// no provider is mounted, so it can sit in any header unconditionally.
export function ConnectedNotificationMenu({
  mobile = false,
}: {
  mobile?: boolean
}) {
  const live = useNotificationsOptional()
  if (!live) return null
  return (
    <NotificationMenu
      items={live.items}
      mobile={mobile}
      onActionClick={(notification, action) => {
        if (notification.readAt === null) void live.markRead([notification.id])
        live.resolveAction(action)
      }}
      onItemClick={(notification) => {
        if (notification.readAt === null) void live.markRead([notification.id])
        const action = notification.actions[0]
        if (action) live.resolveAction(action)
      }}
      onMarkAllRead={() => void live.markAllRead()}
      onViewAll={live.viewAll}
      unreadCount={live.unreadCount}
    />
  )
}

export interface NotificationMenuProps {
  mobile?: boolean
  items: Notification[]
  unreadCount: number
  onItemClick?: (notification: Notification) => void
  onActionClick?: (
    notification: Notification,
    action: NotificationAction
  ) => void
  onMarkAllRead?: () => void
  onViewAll?: () => void
}

export function NotificationMenu({
  mobile = false,
  items,
  unreadCount,
  onItemClick,
  onActionClick,
  onMarkAllRead,
  onViewAll,
}: NotificationMenuProps) {
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative size-8"
      aria-label="Open notifications"
    >
      <Bell className="size-4" />
      {unreadCount > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-medium text-[0.6rem] text-primary-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </Button>
  )

  const footer =
    onMarkAllRead || onViewAll ? (
      <div className="flex items-center justify-between gap-2 border-border/70 border-t px-3 py-2">
        {onMarkAllRead ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            disabled={unreadCount === 0}
            onClick={onMarkAllRead}
          >
            Mark all read
          </Button>
        ) : (
          <span />
        )}
        {onViewAll ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={onViewAll}
          >
            View all
          </Button>
        ) : null}
      </div>
    ) : null

  if (mobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="w-full border-border/70 p-0 sm:max-w-sm">
          <SheetHeader className="border-border/70 border-b px-5 py-4">
            <SheetTitle className="text-xl">Notifications</SheetTitle>
          </SheetHeader>
          <NotificationItems
            items={items}
            onActionClick={onActionClick}
            onItemClick={onItemClick}
          />
          {footer}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="px-3 py-2 text-base text-foreground">
          Notifications
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <NotificationItems
          compact
          items={items}
          onActionClick={onActionClick}
          onItemClick={onItemClick}
        />
        {footer}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationItems({
  compact,
  items,
  onItemClick,
  onActionClick,
}: {
  compact?: boolean
  items: Notification[]
  onItemClick?: (notification: Notification) => void
  onActionClick?: (
    notification: Notification,
    action: NotificationAction
  ) => void
}) {
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "px-5 py-8 text-muted-foreground text-sm",
          compact && "px-3"
        )}
      >
        Nothing needs your attention.
      </div>
    )
  }

  return (
    <div
      className={cn(
        "divide-y divide-border/70",
        compact ? "max-h-80 overflow-auto" : "overflow-auto"
      )}
    >
      {items.map((item) => (
        <div
          className={cn(
            "px-5 py-4 text-sm",
            compact && "px-3 py-3",
            onItemClick && "hover:bg-accent/40"
          )}
          key={item.id}
        >
          <div className="flex items-start gap-3">
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
                className={cn(
                  "block w-full text-left",
                  onItemClick && "cursor-pointer"
                )}
                disabled={!onItemClick}
                onClick={onItemClick ? () => onItemClick(item) : undefined}
                type="button"
              >
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-medium text-foreground">
                    {item.title}
                  </span>
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
              {item.actions.length > 0 && onActionClick ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.actions.map((action) => (
                    <Button
                      key={action.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onActionClick(item, action)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
