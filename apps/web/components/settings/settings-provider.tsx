"use client"

import { type UserSettings, UserSettingsSchema } from "@workspace/types"
import { useSettingsUpdater } from "@workspace/ui/lib/use-settings-updater"
import { useTheme } from "next-themes"
import {
  createContext,
  type ReactNode,
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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const { setTheme } = useTheme()
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

  const updateSetting = useSettingsUpdater({
    settings,
    setSettings,
    persist: (patch) => apiClient.user.updateSettings(patch),
    onError: (error) => console.error("Failed to save settings:", error),
  })

  return (
    <SettingsContext.Provider value={{ settings, status, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}
