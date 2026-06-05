"use client"

import { settingsFields, settingsGroups } from "@workspace/module-registry"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { SettingsView } from "@workspace/ui/settings/settings-view"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useSettings } from "../../components/settings/settings-provider"
import { authClient } from "../../lib/auth-client"

function CenteredSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const { settings, status, updateSetting } = useSettings()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  if (isPending || !session || status === "loading") {
    return <CenteredSpinner />
  }

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="font-medium text-lg">Settings</h1>
        </div>
      </header>

      <div className="px-4 py-8">
        <SettingsView
          groups={settingsGroups}
          fields={settingsFields}
          values={settings}
          platform="web"
          onChange={updateSetting}
        />
      </div>
    </main>
  )
}
