"use client"

import { Spinner } from "@workspace/ui/components/spinner"
import { NotesDashboard } from "@workspace/ui/notes/notes-dashboard"
import { useRouter } from "next/navigation"
import { useCallback, useEffect } from "react"
import { apiClient, setActiveWorkspaceId } from "../../lib/api"
import { authClient } from "../../lib/auth-client"

function CenteredSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}

export default function NotesPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const resolveWorkspace = useCallback(async () => {
    const response = await apiClient.user.current()
    setActiveWorkspaceId(response.authContext.workspaceId)
  }, [])

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  if (isPending || !session) {
    return <CenteredSpinner />
  }

  return (
    <NotesDashboard
      user={session.user}
      onSignOut={async () => {
        await authClient.signOut()
        router.replace("/sign-in")
        router.refresh()
      }}
      onResolveWorkspace={resolveWorkspace}
      client={apiClient}
    />
  )
}
