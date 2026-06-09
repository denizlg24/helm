"use client"

import { PomodoroProvider } from "@workspace/ui/pomodoro/pomodoro-provider"
import { type ReactNode, useEffect, useState } from "react"
import { apiClient, setActiveWorkspaceId } from "../lib/api"
import { authClient } from "../lib/auth-client"

// Mounts the app-wide pomodoro timer once the session resolves, so the
// countdown keeps running (and stays visible in the header activity panel)
// while the user works in other modules.
export function PomodoroHostProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (isPending || !session) {
      setEnabled(false)
      return
    }
    let cancelled = false
    apiClient.user
      .current()
      .then((response) => {
        if (cancelled) return
        setActiveWorkspaceId(response.authContext.workspaceId)
        setEnabled(response.authContext.enabledModules.includes("pomodoro"))
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [isPending, session])

  return (
    <PomodoroProvider client={apiClient} enabled={enabled}>
      {children}
    </PomodoroProvider>
  )
}
