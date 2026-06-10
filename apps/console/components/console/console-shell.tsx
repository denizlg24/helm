"use client"

import { ForbiddenError } from "@workspace/api-client"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Spinner } from "@workspace/ui/components/spinner"
import { ConnectedNotificationMenu } from "@workspace/ui/notifications/notification-menu"
import { NotificationsProvider } from "@workspace/ui/notifications/notifications-provider"
import { LogOutIcon, MenuIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { apiClient } from "../../lib/api-client"
import { authClient } from "../../lib/auth-client"
import { env } from "../../lib/env"
import { ConsoleNavList, consoleNavItems, isActive } from "./console-nav"

interface ConsoleShellProps {
  children: React.ReactNode
}

export function ConsoleShell({ children }: ConsoleShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [checkingWorkspace, setCheckingWorkspace] = useState(true)
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  const navigate = useCallback(
    (route: string) => {
      router.push(route)
    },
    [router]
  )

  // The console has no full notifications page; "View all" hands off to the
  // web app's /notifications surface.
  const viewAllNotifications = useCallback(() => {
    window.open(
      new URL("/notifications", env.webUrl).toString(),
      "_blank",
      "noopener,noreferrer"
    )
  }, [])

  useEffect(() => {
    if (isPending || !session) {
      return
    }

    let cancelled = false

    apiClient.workspace
      .current()
      .then((currentWorkspace) => {
        if (cancelled) {
          return
        }

        if (!currentWorkspace.workspace.onboardingCompletedAt) {
          router.replace("/onboarding")
          return
        }

        setCheckingWorkspace(false)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        if (error instanceof ForbiddenError) {
          router.replace("/onboarding/workspace")
          return
        }

        setCheckingWorkspace(false)
      })

    return () => {
      cancelled = true
    }
  }, [isPending, session, router])

  if (isPending || !session || checkingWorkspace) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  const activeItem =
    consoleNavItems.find((item) => isActive(pathname, item.href)) ?? null

  const handleSignOut = async () => {
    await authClient.signOut()
    router.replace("/sign-in")
  }

  return (
    <NotificationsProvider
      appBaseUrls={{ web: env.webUrl }}
      client={apiClient}
      currentApp="console"
      enabled
      navigate={navigate}
      viewAll={viewAllNotifications}
    >
      <div className="min-h-svh bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="flex items-center gap-3">
              <Link className="font-semibold text-sm tracking-tight" href="/">
                Helm
              </Link>
              {activeItem && activeItem.href !== "/" ? (
                <span className="hidden text-muted-foreground text-sm sm:inline">
                  / {activeItem.label}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <ConnectedNotificationMenu />
              <Button
                className="hidden text-muted-foreground md:inline-flex"
                onClick={() => void handleSignOut()}
                size="sm"
                variant="ghost"
              >
                <LogOutIcon className="size-4" />
                Sign out
              </Button>

              <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    aria-label="Open navigation"
                    className="md:hidden"
                    size="sm"
                    variant="outline"
                  >
                    <MenuIcon className="size-4" />
                    {activeItem?.label ?? "Menu"}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-72 p-0" side="left">
                  <SheetHeader className="border-b">
                    <SheetTitle>Helm</SheetTitle>
                  </SheetHeader>
                  <div className="flex h-full flex-col justify-between p-3">
                    <ConsoleNavList onNavigate={() => setMobileOpen(false)} />
                    <Button
                      className="justify-start text-muted-foreground"
                      onClick={() => void handleSignOut()}
                      variant="ghost"
                    >
                      <LogOutIcon className="size-4" />
                      Sign out
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[220px_1fr] md:px-8 md:py-12">
          <aside className="hidden md:block">
            <div className="sticky top-24">
              <p className="px-3 pb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Account
              </p>
              <ConsoleNavList />
            </div>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </NotificationsProvider>
  )
}
