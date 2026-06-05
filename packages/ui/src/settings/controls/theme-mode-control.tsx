"use client"

import type { AppearanceMode } from "@workspace/types"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { LucideIcon } from "lucide-react"
import { Monitor, Moon, Sun } from "lucide-react"

const OPTIONS: { value: AppearanceMode; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export interface ThemeModeControlProps {
  value: AppearanceMode
  onChange: (value: AppearanceMode) => void
}

export function ThemeModeControl({ value, onChange }: ThemeModeControlProps) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 gap-1.5 rounded-md px-3 text-muted-foreground",
              active &&
                "bg-background text-foreground shadow-sm hover:bg-background"
            )}
          >
            <Icon className="size-4" />
            <span className="text-xs">{option.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
