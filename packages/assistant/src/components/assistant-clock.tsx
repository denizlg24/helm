"use client"

import { useEffect, useState } from "react"

// Clock + date hero shown above the composer on an empty conversation, matching
// the dashboard home. Renders nothing until mounted to avoid SSR/CSR drift.
export function AssistantClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!now) {
    return <div className="h-14" aria-hidden />
  }

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now)
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now)

  return (
    <div className="select-none text-center">
      <div className="font-light text-3xl text-foreground/80 tabular-nums tracking-tight">
        {time}
      </div>
      <div className="mt-1 text-muted-foreground/50 text-xs">{date}</div>
    </div>
  )
}
