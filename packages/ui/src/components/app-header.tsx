"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import {
  Bell,
  ChevronDown,
  ClockFading,
  LogOut,
  Menu,
  Settings,
} from "lucide-react"

export interface AppHeaderUser {
  name?: string | null
  email?: string | null
  image?: string | null
}

export interface AppHeaderNotification {
  id: string
  title: string
  description?: string
  time?: string
  unread?: boolean
}

export interface AppHeaderBackgroundItem {
  id: string
  label: string
  status: "idle" | "running" | "attention"
}

export interface AppHeaderProps {
  title: string
  user?: AppHeaderUser
  notifications?: AppHeaderNotification[]
  backgroundItems?: AppHeaderBackgroundItem[]
  className?: string
  dragRegion?: boolean
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  onSettings?: () => void
  onLogout?: () => void
}

export function AppHeader({
  title,
  user,
  notifications = [],
  backgroundItems = [],
  className,
  dragRegion,
  sidebarOpen,
  onToggleSidebar,
  onSettings,
  onLogout,
}: AppHeaderProps) {
  const isMobile = useIsMobile()
  const unreadCount = notifications.filter((item) => item.unread).length
  const activeBackgroundCount = backgroundItems.filter(
    (item) => item.status === "running" || item.status === "attention"
  ).length

  return (
    <header
      data-tauri-drag-region={dragRegion ? true : undefined}
      className={cn(
        "flex min-h-12 items-center gap-2 border-border/70 border-b bg-background/92 px-3 backdrop-blur-sm",
        className
      )}
    >
      {onToggleSidebar ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <Menu className="size-4" />
        </Button>
      ) : null}

      <div className="min-w-0">
        <p className="truncate text-[0.95rem] text-foreground tracking-normal">
          {title.toLocaleLowerCase()}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {backgroundItems.length > 0 ? (
          <BackgroundIndicator
            activeCount={activeBackgroundCount}
            items={backgroundItems}
            mobile={isMobile}
          />
        ) : null}
        <NotificationMenu
          mobile={isMobile}
          notifications={notifications}
          unreadCount={unreadCount}
        />
        <ProfileMenu
          mobile={isMobile}
          onLogout={onLogout}
          onSettings={onSettings}
          user={user}
        />
      </div>
    </header>
  )
}

function NotificationMenu({
  mobile,
  notifications,
  unreadCount,
}: {
  mobile: boolean
  notifications: AppHeaderNotification[]
  unreadCount: number
}) {
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
          {unreadCount}
        </span>
      ) : null}
    </Button>
  )

  if (mobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="w-full border-border/70 p-0 sm:max-w-sm">
          <SheetHeader className="border-border/70 border-b px-5 py-4">
            <SheetTitle className="text-xl">Notifications</SheetTitle>
          </SheetHeader>
          <NotificationList notifications={notifications} />
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
        <NotificationList notifications={notifications} compact />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProfileMenu({
  mobile,
  onLogout,
  onSettings,
  user,
}: {
  mobile: boolean
  onLogout?: () => void
  onSettings?: () => void
  user?: AppHeaderUser
}) {
  const name = user?.name || user?.email || "Account"
  const fallback = getInitials(name)
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      className="h-8 gap-2 rounded-full px-1.5 pr-2"
      aria-label="Open profile menu"
    >
      <Avatar size="sm">
        {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <span className="hidden max-w-28 truncate text-muted-foreground text-xs sm:inline">
        {name}
      </span>
      <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
    </Button>
  )

  if (mobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="w-full border-border/70 p-0 sm:max-w-sm">
          <SheetHeader className="border-border/70 border-b px-5 py-4 text-left">
            <SheetTitle className="text-xl">{name}</SheetTitle>
            {user?.email && user.email !== name ? (
              <p className="text-muted-foreground text-sm">{user.email}</p>
            ) : null}
          </SheetHeader>
          <ProfileActions onLogout={onLogout} onSettings={onSettings} />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-foreground">{name}</span>
          {user?.email && user.email !== name ? (
            <span className="block truncate font-normal text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!onSettings} onSelect={onSettings}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!onLogout}
          onSelect={onLogout}
          variant="destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BackgroundIndicator({
  activeCount,
  items,
  mobile,
}: {
  activeCount: number
  items: AppHeaderBackgroundItem[]
  mobile: boolean
}) {
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative size-8"
      aria-label="Open background activity"
    >
      <ClockFading className="size-4" />
      {activeCount > 0 ? (
        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
      ) : null}
    </Button>
  )

  if (mobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="w-full border-border/70 p-0 sm:max-w-sm">
          <SheetHeader className="border-border/70 border-b px-5 py-4">
            <SheetTitle className="text-xl">Background activity</SheetTitle>
          </SheetHeader>
          <BackgroundList items={items} />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <DropdownMenuLabel className="px-3 py-2 text-base text-foreground">
          Background activity
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <BackgroundList items={items} compact />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationList({
  compact,
  notifications,
}: {
  compact?: boolean
  notifications: AppHeaderNotification[]
}) {
  if (notifications.length === 0) {
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
      {notifications.map((item) => (
        <div className="px-5 py-4 text-sm" key={item.id}>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-1.5 size-1.5 rounded-full",
                item.unread ? "bg-primary" : "bg-border"
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate font-medium text-foreground">
                  {item.title}
                </p>
                {item.time ? (
                  <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                    {item.time}
                  </span>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-1 text-muted-foreground leading-5">
                  {item.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function BackgroundList({
  compact,
  items,
}: {
  compact?: boolean
  items: AppHeaderBackgroundItem[]
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border/70",
        compact && "max-h-80 overflow-auto"
      )}
    >
      {items.map((item) => (
        <div
          className="flex items-center gap-3 px-5 py-3 text-sm"
          key={item.id}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              item.status === "running" && "bg-primary",
              item.status === "attention" && "bg-destructive",
              item.status === "idle" && "bg-border"
            )}
          />
          <span className="text-foreground">{item.label}</span>
          <span className="ml-auto text-muted-foreground text-xs capitalize">
            {item.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function ProfileActions({
  onLogout,
  onSettings,
}: {
  onLogout?: () => void
  onSettings?: () => void
}) {
  return (
    <div className="px-2 py-3">
      <button
        type="button"
        disabled={!onSettings}
        onClick={onSettings}
        className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-foreground text-sm disabled:opacity-50"
      >
        <Settings className="size-4 text-muted-foreground" />
        Settings
      </button>
      <button
        type="button"
        disabled={!onLogout}
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-destructive text-sm disabled:opacity-50"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </div>
  )
}

function getInitials(value: string) {
  return value
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}
