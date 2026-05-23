"use client"

import { Wordmark } from "@workspace/ui/components/auth-shell"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
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
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  if (isPending || !session) {
    return <CenteredSpinner />
  }

  const signOut = async () => {
    setSigningOut(true)
    const result = await authClient.signOut()
    if (result.error) {
      setSigningOut(false)
      toast.error(result.error.message ?? "Sign out failed")
      return
    }
    router.replace("/sign-in")
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-border border-b px-6 py-4 sm:px-10">
        <Wordmark />
        <Button
          loading={signingOut}
          onClick={signOut}
          size="sm"
          type="button"
          variant="ghost"
        >
          Sign out
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-14 sm:px-10">
        <h1 className="font-medium text-2xl text-foreground tracking-tight">
          Welcome back
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Signed in as {session.user.email}. Your modules will appear here.
        </p>
      </main>
    </div>
  )
}
