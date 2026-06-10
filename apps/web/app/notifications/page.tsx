"use client"

import { AppHeader } from "@workspace/ui/components/app-header"
import { Spinner } from "@workspace/ui/components/spinner"
import { useBackgroundActivities } from "@workspace/ui/lib/background-activity"
import { NotificationsView } from "@workspace/ui/notifications/notifications-view"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { authClient } from "../../lib/auth-client"

export default function NotificationsPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const backgroundActivities = useBackgroundActivities()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  if (isPending || !session) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader
        backgroundItems={backgroundActivities}
        onLogout={() => {
          void authClient.signOut().then(() => {
            router.replace("/sign-in")
            router.refresh()
          })
        }}
        onSettings={() => router.push("/settings")}
        title="notifications"
        user={session.user}
      />
      <main className="min-h-0 flex-1 overflow-auto px-4 py-6">
        <NotificationsView />
      </main>
    </div>
  )
}
