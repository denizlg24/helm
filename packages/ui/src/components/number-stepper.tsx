"use client"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { Minus, Plus } from "lucide-react"

export interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  label: string
  className?: string
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  label,
  className,
}: NumberStepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        aria-label={`Decrease ${label}`}
        className="size-7 rounded-full"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        size="icon"
        type="button"
        variant="outline"
      >
        <Minus className="size-3.5" />
      </Button>
      <div className="w-14 text-center">
        <span className="font-medium tabular-nums">{value}</span>
        {unit ? (
          <span className="ml-1 text-muted-foreground text-xs">{unit}</span>
        ) : null}
      </div>
      <Button
        aria-label={`Increase ${label}`}
        className="size-7 rounded-full"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        size="icon"
        type="button"
        variant="outline"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}
