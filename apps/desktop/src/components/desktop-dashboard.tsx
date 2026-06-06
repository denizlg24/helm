import { invoke } from "@tauri-apps/api/core"
import { platform } from "@tauri-apps/plugin-os"
import {
  ChatView,
  ConversationSidebar,
  useAssistantChat,
} from "@workspace/assistant"
import {
  EXTRA_KEYWORDS,
  GROUP_LABELS,
  MODULE_ICONS,
  moduleDefinitions,
  settingsFields,
  settingsGroups,
} from "@workspace/module-registry"
import {
  type AssistantConversationSummary,
  type UserSettings,
  UserSettingsSchema,
} from "@workspace/types"
import {
  AppHeader,
  type AppHeaderUser,
} from "@workspace/ui/components/app-header"
import { Button } from "@workspace/ui/components/button"
import {
  type CommandPaletteEntry,
  CommandPaletteOverlay,
} from "@workspace/ui/components/command-palette-overlay"
import { Spinner } from "@workspace/ui/components/spinner"
import { buildSettingsUpdate } from "@workspace/ui/lib/settings"
import { cn } from "@workspace/ui/lib/utils"
import { SettingsView } from "@workspace/ui/settings/settings-view"
import type { LucideIcon } from "lucide-react"
import {
  AlarmClock,
  ArrowLeft,
  Bot,
  Brain,
  Calendar,
  Download,
  FileText,
  FolderGit2,
  HomeIcon,
  Inbox,
  Kanban,
  KeyRound,
  MessageCircle,
  NotebookPen,
  PenTool,
  Radio,
  Settings,
  Table,
  UserSquare,
  UsersRound,
} from "lucide-react"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { apiClient, setApiToken, setApiWorkspaceId } from "../lib/api"
import { applyAppearanceMode, cacheAppearanceMode } from "../lib/appearance"
import { featureGatedImport } from "../lib/feature-gated-import"
import { isFeatureEnabled } from "../lib/features"
import { WindowControls } from "./window-controls"

const DEFAULT_SETTINGS = UserSettingsSchema.parse({})

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

const NotesDashboard = lazy(async () => {
  const module = await featureGatedImport(
    "notes",
    () => import("@workspace/ui/notes/notes-dashboard")
  )

  if (!module) {
    return {
      default: () => (
        <div className="flex h-svh items-center justify-center bg-background px-6 text-center">
          <div className="max-w-sm">
            <p className="font-medium text-foreground">Notes is not bundled</p>
            <p className="mt-2 text-muted-foreground text-sm">
              This desktop build does not include the Notes module.
            </p>
          </div>
        </div>
      ),
    }
  }

  return { default: module.NotesDashboard }
})

const ICON_MAP: Record<string, LucideIcon> = {
  AlarmClock,
  Bot,
  Brain,
  Calendar,
  Download,
  FileText,
  FolderGit2,
  HomeIcon,
  Inbox,
  Kanban,
  KeyRound,
  MessageCircle,
  NotebookPen,
  PenTool,
  Radio,
  Settings,
  Table,
  UserSquare,
  UsersRound,
}

const DESKTOP_SURFACES = new Set(["assistant", "home", "notes", "settings"])

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
  const [surface, setSurface] = useState<"assistant" | "notes" | "settings">(
    "assistant"
  )
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [conversations, setConversations] = useState<
    AssistantConversationSummary[]
  >([])
  const [displayUser, setDisplayUser] = useState(user)
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set())
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
    setEnabledModules(new Set(response.authContext.enabledModules))
  }, [token])

  useEffect(() => {
    setApiToken(token)
    setReady(false)
    setApiWorkspaceId(null)
    setConversations([])
    setDisplayUser(user)
    setEnabledModules(new Set())
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
        setEnabledModules(new Set(response.authContext.enabledModules))
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, user])

  const notesAvailable =
    enabledModules.has("notes") && isFeatureEnabled("notes")

  useEffect(() => {
    if (surface === "notes" && !notesAvailable) {
      setSurface("assistant")
    }
  }, [notesAvailable, surface])

  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])

  useEffect(() => {
    if (!ready) {
      return
    }
    let cancelled = false
    apiClient.user
      .settings()
      .then((response) => {
        if (!cancelled) {
          cacheAppearanceMode(response.settings.appearance.mode)
          setSettings(response.settings)
        }
      })
      .catch(() => {
        // Non-fatal — fall back to defaults.
      })
    return () => {
      cancelled = true
    }
  }, [ready])

  // Server settings are the source of truth for the active light/dark mode.
  useEffect(
    () => applyAppearanceMode(settings.appearance.mode),
    [settings.appearance.mode]
  )

  const updateSetting = useCallback(
    (key: string, value: unknown) => {
      const previous = settings
      const previousMode = previous.appearance.mode
      const { settings: next, patch } = buildSettingsUpdate(
        settings,
        key,
        value
      )
      setSettings(next)
      cacheAppearanceMode(next.appearance.mode)
      apiClient.user
        .updateSettings(patch)
        .then((response) => {
          cacheAppearanceMode(response.settings.appearance.mode)
          setSettings(response.settings)
        })
        .catch((error) => {
          console.error("Failed to save settings:", error)
          setSettings(previous)
          cacheAppearanceMode(previousMode)
        })
    },
    [settings]
  )

  const commandEntries = useMemo<CommandPaletteEntry[]>(
    () =>
      moduleDefinitions.map((definition) => {
        // Settings is a core surface that ships in every build.
        const bundled =
          definition.id === "settings" || isFeatureEnabled(definition.id)
        const implemented = DESKTOP_SURFACES.has(definition.id)
        const enabled = enabledModules.has(definition.id)
        const group = GROUP_LABELS[definition.group] ?? definition.group
        const iconName = MODULE_ICONS[definition.id]
        const icon = iconName ? (ICON_MAP[iconName] ?? HomeIcon) : HomeIcon

        return {
          disabled: !enabled || !bundled || !implemented,
          group,
          icon,
          id: definition.id,
          keywords: [
            definition.name,
            definition.id,
            definition.group,
            ...definition.requiredScopes,
            ...(EXTRA_KEYWORDS[definition.id] ?? []),
          ],
          label: definition.nav.label,
        }
      }),
    [enabledModules]
  )

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

  const handleCommandSelect = useCallback((entry: CommandPaletteEntry) => {
    if (entry.id === "notes") {
      setSurface("notes")
    } else if (entry.id === "settings") {
      setSurface("settings")
    } else {
      setSurface("assistant")
    }
  }, [])

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

  if (surface === "settings") {
    return (
      <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
        <CommandPaletteOverlay
          entries={commandEntries}
          shortcut={settings.shortcuts.commandPalette}
          onSelect={handleCommandSelect}
        />
        <header
          data-tauri-drag-region
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-border border-b px-3",
            isMac && "pl-20"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back"
            onClick={() => setSurface("assistant")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <span className="font-medium text-sm">Settings</span>
          <div className="ml-auto">
            <WindowControls />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
          <SettingsView
            groups={settingsGroups}
            fields={settingsFields}
            values={settings}
            platform="desktop"
            onChange={updateSetting}
          />
        </main>
      </div>
    )
  }

  if (surface === "notes") {
    return (
      <Suspense
        fallback={
          <div className="flex h-svh items-center justify-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        }
      >
        <CommandPaletteOverlay
          entries={commandEntries}
          shortcut={settings.shortcuts.commandPalette}
          onSelect={handleCommandSelect}
        />
        <NotesDashboard
          client={apiClient}
          headerClassName={isMac ? "pl-20" : undefined}
          headerDragRegion
          headerEndSlot={<WindowControls />}
          onResolveWorkspace={resolveWorkspace}
          onSettings={() => setSurface("settings")}
          onSignOut={async () => onDisconnect()}
          user={displayUser}
        />
      </Suspense>
    )
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <CommandPaletteOverlay
        entries={commandEntries}
        shortcut={settings.shortcuts.commandPalette}
        onSelect={handleCommandSelect}
      />
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
          onSettings={() => setSurface("settings")}
          onLogout={onDisconnect}
          backgroundItems={[]}
          notifications={[]}
          endSlot={<WindowControls />}
        />

        <main className="min-h-0 flex-1">
          <ChatView chat={chat} onSelectFiles={selectNativeFiles} />
        </main>
      </div>
    </div>
  )
}
