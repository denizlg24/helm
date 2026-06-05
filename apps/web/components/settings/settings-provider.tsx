"use client"

import { type UserSettings, UserSettingsSchema } from "@workspace/types"
import { buildSettingsUpdate } from "@workspace/ui/lib/settings"
import { matchShortcut } from "@workspace/ui/lib/shortcuts"
import { useTheme } from "next-themes"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { apiClient, setActiveWorkspaceId } from "../../lib/api"
import { authClient } from "../../lib/auth-client"

const DEFAULT_SETTINGS = UserSettingsSchema.parse({})

type SettingsStatus = "loading" | "ready" | "unauthenticated"

interface SettingsContextValue {
  settings: UserSettings
  status: SettingsStatus
  updateSetting: (key: string, value: unknown) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const { resolvedTheme, setTheme } = useTheme()
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<SettingsStatus>("loading")

  useEffect(() => {
    if (isPending) {
      return
    }
    if (!session) {
      setSettings(DEFAULT_SETTINGS)
      setStatus("unauthenticated")
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        const me = await apiClient.user.current()
        setActiveWorkspaceId(me.authContext.workspaceId)
        const response = await apiClient.user.settings()
        if (!cancelled) {
          setSettings(response.settings)
          setStatus("ready")
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load settings:", error)
          setStatus("ready")
        }
      }
    }
    void load()

    return () => {
      cancelled = true
    }
  }, [isPending, session])

  // Server settings are the source of truth for the active theme.
  useEffect(() => {
    if (status !== "ready") {
      return
    }
    setTheme(settings.appearance.mode)
  }, [status, settings.appearance.mode, setTheme])

  const updateSetting = useCallback(
    (key: string, value: unknown) => {
      const { settings: next, patch } = buildSettingsUpdate(
        settings,
        key,
        value
      )
      setSettings(next)
      apiClient.user
        .updateSettings(patch)
        .then((response) => setSettings(response.settings))
        .catch((error) => {
          console.error("Failed to save settings:", error)
        })
    },
    [settings]
  )

  useEffect(() => {
    if (status !== "ready") {
      return
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      if (!matchShortcut(event, settings.shortcuts.toggleTheme)) {
        return
      }
      event.preventDefault()
      updateSetting(
        "appearance.mode",
        resolvedTheme === "dark" ? "light" : "dark"
      )
    }

    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  }, [status, settings.shortcuts.toggleTheme, resolvedTheme, updateSetting])

  return (
    <SettingsContext.Provider value={{ settings, status, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}
