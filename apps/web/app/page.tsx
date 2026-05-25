"use client"

import { Spinner } from "@workspace/ui/components/spinner"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { DashboardHome } from "../components/dashboard-home"
import { authClient } from "../lib/auth-client"

function CenteredSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}

export default function Page() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  if (isPending || !session) {
    return <CenteredSpinner />
  }

  return (
    <DashboardHome
      user={session.user}
      onSignOut={async () => {
        try {
          await authClient.signOut()
          router.replace("/sign-in")
          router.refresh()
        } catch (err) {
          console.error("Sign-out failed:", err)
          // Could add toast notification here if available
        }
      }}
    />
  )
}
