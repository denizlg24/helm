"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

const MODES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

export function SettingsSection() {
  return (
    <div className="space-y-12">
      <Header />

      <section className="space-y-3">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Appearance
        </h2>
        <div className="divide-y divide-border border-border border-y">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-foreground text-sm">Theme</p>
              <p className="mt-0.5 text-muted-foreground text-sm">
                Choose light, dark, or follow your system setting.
              </p>
            </div>
            <ThemeModeToggle />
          </div>
        </div>
      </section>
    </div>
  )
}

function ThemeModeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // next-themes can't know the active value until the client mounts, so render
  // a placeholder first to avoid a hydration mismatch on the selected button.
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <Skeleton className="h-9 w-full sm:w-64" />
  }

  return (
    <fieldset className="inline-flex shrink-0 rounded-md border border-border p-0.5">
      <legend className="sr-only">Theme</legend>
      {MODES.map(({ value, label, icon: Icon }) => {
        const active = theme === value
        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-3 py-1.5 font-medium text-sm transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={value}
            onClick={() => setTheme(value)}
            type="button"
          >
            <Icon className="size-4" />
            {label}
          </button>
        )
      })}
    </fieldset>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
      <p className="max-w-2xl text-muted-foreground text-sm">
        Personalize how the console looks and behaves.
      </p>
    </div>
  )
}
