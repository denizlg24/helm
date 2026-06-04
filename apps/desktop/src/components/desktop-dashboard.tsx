import { invoke } from "@tauri-apps/api/core"
import { platform } from "@tauri-apps/plugin-os"
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
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { NotesDashboard } from "@workspace/ui/notes/notes-dashboard"
import { FileText, MessageSquare } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { apiClient, setApiToken, setApiWorkspaceId } from "../lib/api"
import { WindowControls } from "./window-controls"

interface NativeSelectedFile {
  name: string
  mimeType: string
  bytes: number[]
}

const isNativeSelectedFile = (value: unknown): value is NativeSelectedFile => {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.name === "string" &&
    typeof candidate.mimeType === "string" &&
    Array.isArray(candidate.bytes) &&
    candidate.bytes.every(
      (byte) =>
        typeof byte === "number" &&
        Number.isInteger(byte) &&
        Number.isFinite(byte) &&
        byte >= 0 &&
        byte <= 255
    )
  )
}

const selectNativeFiles = async (): Promise<File[]> => {
  try {
    const selected = await invoke<unknown>("select_files")
    if (!Array.isArray(selected)) return []
    return selected.filter(isNativeSelectedFile).map(
      (file) =>
        new File([new Uint8Array(file.bytes)], file.name, {
          type: file.mimeType,
        })
    )
  } catch (error) {
    console.error("File selection failed:", error)
    return []
  }
}

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
  const [surface, setSurface] = useState<"assistant" | "notes">("assistant")
  const [ready, setReady] = useState(false)
  const [conversations, setConversations] = useState<
    AssistantConversationSummary[]
  >([])
  const [displayUser, setDisplayUser] = useState(user)
  const [loadingList, setLoadingList] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMac] = useState(() => platform() === "macos")

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

  const resolveWorkspace = useCallback(async () => {
    setApiToken(token)
    const response = await apiClient.user.current()
    setApiWorkspaceId(response.authContext.workspaceId)
    setDisplayUser({
      email: response.user.email ?? response.authContext.userEmail,
      name: response.user.name ?? response.authContext.userName,
    })
  }, [token])

  useEffect(() => {
    setApiToken(token)
    setReady(false)
    setApiWorkspaceId(null)
    setConversations([])
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

  if (surface === "notes") {
    return (
      <NotesDashboard
        client={apiClient}
        headerClassName={isMac ? "pl-20" : undefined}
        headerDragRegion
        headerEndSlot={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSurface("assistant")}
            >
              <MessageSquare className="size-3.5" />
              Assistant
            </Button>
            <WindowControls />
          </>
        }
        onResolveWorkspace={resolveWorkspace}
        onSignOut={async () => onDisconnect()}
        user={displayUser}
      />
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
          className={isMac ? "pl-20" : undefined}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          user={displayUser}
          onLogout={onDisconnect}
          backgroundItems={[]}
          notifications={[]}
          endSlot={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSurface("notes")}
              >
                <FileText className="size-3.5" />
                Notes
              </Button>
              <WindowControls />
            </>
          }
        />

        <main className="min-h-0 flex-1">
          <ChatView chat={chat} onSelectFiles={selectNativeFiles} />
        </main>
      </div>
    </div>
  )
}
