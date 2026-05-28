"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { ArrowLeftIcon, MenuIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { SettingsNavList, settingsNavItems } from "./settings-nav"

interface SettingsShellProps {
  children: React.ReactNode
}

export function SettingsShell({ children }: SettingsShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const activeItem =
    settingsNavItems.find(
      (item) => pathname === item.href || pathname?.startsWith(`${item.href}/`)
    ) ?? null

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/">
                <ArrowLeftIcon className="size-4" />
                <span className="hidden sm:inline">Back</span>
              </Link>
            </Button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <p className="font-medium text-sm tracking-tight">Settings</p>
            {activeItem ? (
              <span className="hidden text-muted-foreground text-sm sm:inline">
                / {activeItem.label}
              </span>
            ) : null}
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="md:hidden"
                aria-label="Open settings navigation"
              >
                <MenuIcon className="size-4" />
                {activeItem?.label ?? "Sections"}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>Settings</SheetTitle>
              </SheetHeader>
              <div className="p-3">
                <SettingsNavList onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[220px_1fr] md:px-8 md:py-12">
        <aside className="hidden md:block">
          <div className="sticky top-24">
            <p className="px-3 pb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              Workspace
            </p>
            <SettingsNavList />
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
