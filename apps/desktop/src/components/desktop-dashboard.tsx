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
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { useCallback, useEffect, useState } from "react"
import { apiClient, setApiToken, setApiWorkspaceId } from "../lib/api"

export interface DesktopDashboardProps {
  token: string
  user: AppHeaderUser
  onDisconnect: () => void
}

export function DesktopDashboard({
  token,
  user,
  onDisconnect,
}: DesktopDashboardProps) {
  const [ready, setReady] = useState(false)
  const [conversations, setConversations] = useState<
    AssistantConversationSummary[]
  >([])
  const [displayUser, setDisplayUser] = useState(user)
  const [loadingList, setLoadingList] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await apiClient.assistant.listConversations()
      setConversations(result.conversations)
    } catch {
      // Non-fatal.
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
    setApiToken(token)
    setDisplayUser(user)
    let cancelled = false
    apiClient.user
      .current()
      .then((response) => {
        if (cancelled) return
        setApiWorkspaceId(response.authContext.workspaceId)
        setDisplayUser({
          email: response.user.email ?? response.authContext.userEmail,
          name: response.user.name ?? response.authContext.userName,
        })
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, user])

  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await apiClient.assistant.deleteConversation(id)
        if (chat.conversationId === id) chat.newChat()
        await refresh()
      } catch {
        // Ignore — list stays as-is.
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
    } catch {
      // Ignore — list stays as-is.
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
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
          <div className="h-full overflow-hidden">
            <ConversationSidebar
              conversations={conversations}
              activeId={chat.conversationId}
              onSelect={(id) => void chat.loadConversation(id)}
              onNew={() => chat.newChat()}
              onDelete={(id) => void handleDelete(id)}
              onRename={(id, title) => void handleRename(id, title)}
              loading={loadingList}
            />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title="Dashboard"
          dragRegion
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          user={displayUser}
          onLogout={onDisconnect}
          backgroundItems={[]}
          notifications={[]}
        />

        <main className="min-h-0 flex-1">
          <ChatView chat={chat} />
        </main>
      </div>
    </div>
  )
}
