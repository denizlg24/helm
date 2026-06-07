"use client"

import type { AssistantDockPosition } from "@workspace/types"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react"

const OPTIONS: {
  value: AssistantDockPosition
  label: string
  icon: LucideIcon
}[] = [
  { value: "bottom-right", label: "Bottom right", icon: ArrowDownRight },
  { value: "bottom-left", label: "Bottom left", icon: ArrowDownLeft },
  { value: "top-right", label: "Top right", icon: ArrowUpRight },
  { value: "top-left", label: "Top left", icon: ArrowUpLeft },
]

export interface AssistantDockPositionControlProps {
  value: AssistantDockPosition
  onChange: (value: AssistantDockPosition) => void
}

export function AssistantDockPositionControl({
  value,
  onChange,
}: AssistantDockPositionControlProps) {
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
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 gap-1.5 rounded-md px-2.5 text-muted-foreground",
              active &&
                "bg-background text-foreground shadow-sm hover:bg-background"
            )}
          >
            <Icon className="size-4" />
            <span className="sr-only">{option.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
