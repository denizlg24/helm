"use client"

import { Button } from "@workspace/ui/components/button"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import {
  eventToBinding,
  formatShortcutTokens,
} from "@workspace/ui/lib/shortcuts"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useState } from "react"

export interface ShortcutRecorderProps {
  value: string
  onChange: (binding: string) => void
}

export function ShortcutRecorder({ value, onChange }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) {
      return
    }

    const handleKeydown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === "Escape") {
        setRecording(false)
        return
      }

      const binding = eventToBinding(event)
      if (binding) {
        onChange(binding)
        setRecording(false)
      }
    }

    window.addEventListener("keydown", handleKeydown, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleKeydown, { capture: true })
  }, [recording, onChange])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setRecording((current) => !current)}
      className={cn(
        "h-8 min-w-32 justify-center gap-1",
        recording && "border-primary ring-1 ring-primary"
      )}
    >
      {recording ? (
        <span className="text-muted-foreground text-xs">Press keys…</span>
      ) : (
        <KbdGroup>
          {formatShortcutTokens(value).map((token) => (
            <Kbd key={token}>{token}</Kbd>
          ))}
        </KbdGroup>
      )}
    </Button>
  )
}
