"use client"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { NotesDashboard } from "@workspace/ui/notes/notes-dashboard"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
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
  const [access, setAccess] = useState<
    | { kind: "checking" }
    | { kind: "allowed" }
    | { kind: "denied"; workspaceId?: string }
  >({ kind: "checking" })

  const resolveWorkspace = useCallback(async () => {
    const response = await apiClient.user.current()
    setActiveWorkspaceId(response.authContext.workspaceId)
  }, [])

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  useEffect(() => {
    if (isPending || !session) {
      setAccess({ kind: "checking" })
      return
    }

    let cancelled = false
    apiClient.user
      .current()
      .then((response) => {
        if (cancelled) return
        setActiveWorkspaceId(response.authContext.workspaceId)
        setAccess(
          response.authContext.enabledModules.includes("notes")
            ? { kind: "allowed" }
            : {
                kind: "denied",
                workspaceId: response.authContext.workspaceId,
              }
        )
      })
      .catch(() => {
        if (!cancelled) setAccess({ kind: "denied" })
      })

    return () => {
      cancelled = true
    }
  }, [isPending, session])

  if (isPending || !session || access.kind === "checking") {
    return <CenteredSpinner />
  }

  if (access.kind === "denied") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md text-center">
          <p className="font-medium text-foreground text-lg">
            Notes is not enabled
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            Enable the Notes module for this workspace before opening this page.
          </p>
          <Button
            className="mt-6"
            onClick={() => router.replace("/")}
            type="button"
            variant="outline"
          >
            Back to dashboard
          </Button>
        </div>
      </main>
    )
  }

  return (
    <NotesDashboard
      user={session.user}
      onSignOut={async () => {
        await authClient.signOut()
        router.replace("/sign-in")
        router.refresh()
      }}
      onSettings={() => router.push("/settings")}
      onResolveWorkspace={resolveWorkspace}
      client={apiClient}
    />
  )
}
