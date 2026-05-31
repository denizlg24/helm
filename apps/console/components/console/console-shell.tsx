"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Spinner } from "@workspace/ui/components/spinner"
import { LogOutIcon, MenuIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { authClient } from "../../lib/auth-client"
import { ConsoleNavList, consoleNavItems } from "./console-nav"

interface ConsoleShellProps {
  children: React.ReactNode
}

export function ConsoleShell({ children }: ConsoleShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in")
    }
  }, [isPending, session, router])

  if (isPending || !session) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  const activeItem =
    consoleNavItems.find((item) =>
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname?.startsWith(`${item.href}/`)
    ) ?? null

  const handleSignOut = async () => {
    await authClient.signOut()
    router.replace("/sign-in")
  }

  return (
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
  )
}
