"use client"

import {
  ChatView,
  ConversationSidebar,
  useAssistantChat,
} from "@workspace/assistant"
import type { AssistantConversationSummary } from "@workspace/types"
import {
  AppHeader,
  type AppHeaderUser,
} from "@workspace/ui/components/app-header"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { apiClient, setActiveWorkspaceId } from "../lib/api"

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export interface DashboardHomeProps {
  user: AppHeaderUser
  onSignOut: () => Promise<void>
}

export function DashboardHome({ user, onSignOut }: DashboardHomeProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [ready, setReady] = useState(false)
  const [conversations, setConversations] = useState<
    AssistantConversationSummary[]
  >([])
  const [loadingList, setLoadingList] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await apiClient.assistant.listConversations()
      setConversations(result.conversations)
    } catch {
      // Non-fatal: the sidebar simply stays as-is.
    } finally {
      setLoadingList(false)
    }
  }, [])

  const chat = useAssistantChat({
    client: apiClient,
    onConversationChange: () => {
      void refresh()
    },
  })

  useEffect(() => {
    let cancelled = false
    apiClient.user
      .current()
      .then((response) => {
        if (cancelled) return
        setActiveWorkspaceId(response.authContext.workspaceId)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])

  const handleSelect = useCallback(
    (id: string) => {
      void chat.loadConversation(id)
      if (isMobile) setSidebarOpen(false)
    },
    [chat, isMobile]
  )

  const handleNew = useCallback(() => {
    chat.newChat()
    if (isMobile) setSidebarOpen(false)
  }, [chat, isMobile])

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await apiClient.assistant.deleteConversation(id)
        if (chat.conversationId === id) chat.newChat()
        await refresh()
      } catch {
        toast.error("Could not delete conversation")
      }
    },
    [chat, refresh]
  )

  const handleRename = useCallback(async (id: string, title: string) => {
    try {
      const updated = await apiClient.assistant.renameConversation(id, {
        title,
      })
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch (error) {
      console.error("Could not rename conversation", error)
      toast.error(getErrorMessage(error, "Could not rename conversation"))
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeId={chat.conversationId}
      onSelect={handleSelect}
      onNew={handleNew}
      onDelete={(id) => void handleDelete(id)}
      onRename={(id, title) => void handleRename(id, title)}
      loading={loadingList}
    />
  )

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      {!isMobile ? (
        <aside
          aria-hidden={!sidebarOpen}
          className={cn(
            "shrink-0 overflow-hidden border-border border-r transition-[width] duration-200 ease-out",
            sidebarOpen ? "w-64" : "w-0"
          )}
        >
          <div
            className={cn(
              "h-full w-64 transition duration-200 ease-out",
              sidebarOpen
                ? "translate-x-0 opacity-100"
                : "pointer-events-none -translate-x-2 opacity-0"
            )}
          >
            {sidebar}
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title="Dashboard"
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          user={user}
          onSettings={() => router.push("/settings")}
          onLogout={() => void onSignOut()}
          backgroundItems={[]}
          notifications={[]}
        />

        <main className="min-h-0 flex-1">
          <ChatView chat={chat} />
        </main>
      </div>

      {isMobile ? (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            {sidebar}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
