"use client"

import { NotificationsProvider } from "@workspace/ui/notifications/notifications-provider"
import { useRouter } from "next/navigation"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { apiClient, setActiveWorkspaceId } from "../lib/api"
import { authClient } from "../lib/auth-client"
import { env } from "../lib/env"

// Mounts the app-wide notifications stream once the session resolves.
// Notifications are core infrastructure, so this only gates on auth — not on
// any module being enabled.
export function NotificationsHostProvider({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
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
        setEnabled(true)
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [isPending, session])

  const navigate = useCallback(
    (route: string) => {
      router.push(route)
    },
    [router]
  )

  const viewAll = useCallback(() => {
    router.push("/notifications")
  }, [router])

  return (
    <NotificationsProvider
      appBaseUrls={{ console: env.consoleUrl }}
      client={apiClient}
      currentApp="web"
      enabled={enabled}
      navigate={navigate}
      viewAll={viewAll}
    >
      {children}
    </NotificationsProvider>
  )
}
