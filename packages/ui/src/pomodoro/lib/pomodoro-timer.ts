"use client"

import type { PomodoroSettings } from "@workspace/types"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"

export type PomodoroPhase = "focus" | "short-break" | "long-break"
export type PomodoroTimerStatus = "idle" | "running" | "paused"

// Persists raw snapshots so hosts can plug in their own storage: the web app
// uses localStorage, the desktop app round-trips through Rust so the timer
// survives app restarts.
export interface PomodoroTimerStore {
  load: () => Promise<string | null>
  save: (snapshot: string) => Promise<void>
  clear: () => Promise<void>
}

export const createLocalStorageTimerStore = (
  key = "helm.pomodoro.timer"
): PomodoroTimerStore => ({
  load: () => {
    if (typeof localStorage === "undefined") return Promise.resolve(null)
    return Promise.resolve(localStorage.getItem(key))
  },
  save: (snapshot) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, snapshot)
    return Promise.resolve()
  },
  clear: () => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key)
    return Promise.resolve()
  },
})

const SnapshotSchema = z.object({
  phase: z.enum(["focus", "short-break", "long-break"]),
  status: z.enum(["idle", "running", "paused"]),
  endsAt: z.number().nullable(),
  remainingMs: z.number().nonnegative(),
  totalMs: z.number().positive(),
  focusStartedAt: z.number().nullable(),
  cycleCount: z.number().int().nonnegative(),
})

type TimerState = z.infer<typeof SnapshotSchema>

export interface FocusResult {
  startedAt: Date
  endedAt: Date
  plannedMinutes: number
  completedSeconds: number
}

export interface UsePomodoroTimerOptions {
  settings: PomodoroSettings
  store: PomodoroTimerStore
  onFocusComplete: (focus: FocusResult) => void
  onFocusAbandoned: (focus: FocusResult) => void
  onBreakComplete?: () => void
}

export const formatRemainingSeconds = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

const minutesToMs = (minutes: number) => minutes * 60_000

const phaseDurationMs = (
  phase: PomodoroPhase,
  settings: PomodoroSettings
): number => {
  switch (phase) {
    case "focus":
      return minutesToMs(settings.focusMinutes)
    case "short-break":
      return minutesToMs(settings.shortBreakMinutes)
    case "long-break":
      return minutesToMs(settings.longBreakMinutes)
    default:
      return minutesToMs(settings.focusMinutes)
  }
}

const idlePhaseState = (
  phase: PomodoroPhase,
  settings: PomodoroSettings,
  cycleCount: number
): TimerState => {
  const totalMs = phaseDurationMs(phase, settings)
  return {
    phase,
    status: "idle",
    endsAt: null,
    remainingMs: totalMs,
    totalMs,
    focusStartedAt: null,
    cycleCount,
  }
}

const nextBreakPhase = (
  cycleCount: number,
  settings: PomodoroSettings
): PomodoroPhase =>
  cycleCount % settings.longBreakEvery === 0 ? "long-break" : "short-break"

const focusResultFromState = (
  state: TimerState,
  endedAtMs: number
): FocusResult => {
  const startedAtMs = state.focusStartedAt ?? endedAtMs - state.totalMs
  const elapsedMs = Math.max(
    0,
    Math.min(endedAtMs - startedAtMs, state.totalMs)
  )
  return {
    startedAt: new Date(startedAtMs),
    endedAt: new Date(endedAtMs),
    plannedMinutes: Math.max(1, Math.round(state.totalMs / 60_000)),
    completedSeconds: Math.round(elapsedMs / 1000),
  }
}

export function usePomodoroTimer({
  settings,
  store,
  onFocusComplete,
  onFocusAbandoned,
  onBreakComplete,
}: UsePomodoroTimerOptions) {
  const [state, setState] = useState<TimerState>(() =>
    idlePhaseState("focus", settings, 0)
  )
  const [restored, setRestored] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const onFocusCompleteRef = useRef(onFocusComplete)
  onFocusCompleteRef.current = onFocusComplete
  const onFocusAbandonedRef = useRef(onFocusAbandoned)
  onFocusAbandonedRef.current = onFocusAbandoned
  const onBreakCompleteRef = useRef(onBreakComplete)
  onBreakCompleteRef.current = onBreakComplete
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const stateRef = useRef(state)
  stateRef.current = state
  const handledEndRef = useRef<number | null>(null)
  const pendingSaveRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let cancelled = false
    store
      .load()
      .then((raw) => {
        if (cancelled || raw === null) return
        const parsed = SnapshotSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) return
        let snapshot = parsed.data
        const current = settingsRef.current
        const now = Date.now()

        // Settle all expired phases that completed while the host was closed.
        while (
          snapshot.status === "running" &&
          snapshot.endsAt !== null &&
          snapshot.endsAt <= now
        ) {
          if (snapshot.phase === "focus") {
            onFocusCompleteRef.current(
              focusResultFromState(snapshot, snapshot.endsAt)
            )
            const cycleCount = snapshot.cycleCount + 1
            const breakPhase = nextBreakPhase(cycleCount, current)
            const next = idlePhaseState(breakPhase, current, cycleCount)
            if (current.autoStartBreaks) {
              snapshot = {
                ...next,
                status: "running",
                endsAt: snapshot.endsAt + next.totalMs,
              }
            } else {
              snapshot = next
              break
            }
          } else {
            onBreakCompleteRef.current?.()
            const next = idlePhaseState("focus", current, snapshot.cycleCount)
            if (current.autoStartFocus) {
              snapshot = {
                ...next,
                status: "running",
                endsAt: snapshot.endsAt + next.totalMs,
                focusStartedAt: snapshot.endsAt,
              }
            } else {
              snapshot = next
              break
            }
          }
        }

        setState(snapshot)
      })
      .catch(() => {
        // Unreadable snapshot — start fresh.
      })
      .finally(() => {
        if (!cancelled) setRestored(true)
      })
    return () => {
      cancelled = true
    }
  }, [store])

  useEffect(() => {
    if (!restored) return
    const snapshot = JSON.stringify(state)
    pendingSaveRef.current = pendingSaveRef.current
      .then(() => store.save(snapshot))
      .catch(() => {
        // Persistence is best-effort; the timer keeps running in memory.
      })
  }, [restored, state, store])

  useEffect(() => {
    if (state.status !== "running") return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [state.status])

  // Idle countdowns track settings edits so a new focus length applies
  // immediately instead of after the next phase change.
  useEffect(() => {
    setState((current) => {
      if (current.status !== "idle") return current
      const totalMs = phaseDurationMs(current.phase, settings)
      if (totalMs === current.totalMs) return current
      return { ...current, totalMs, remainingMs: totalMs }
    })
  }, [settings])

  const remainingMs =
    state.status === "running" && state.endsAt !== null
      ? Math.max(0, state.endsAt - now)
      : state.remainingMs

  useEffect(() => {
    if (state.status !== "running" || state.endsAt === null) return
    if (remainingMs > 0) return
    if (handledEndRef.current === state.endsAt) return
    handledEndRef.current = state.endsAt

    const current = settingsRef.current
    if (state.phase === "focus") {
      onFocusCompleteRef.current(focusResultFromState(state, state.endsAt))
      const cycleCount = state.cycleCount + 1
      const next = idlePhaseState(
        nextBreakPhase(cycleCount, current),
        current,
        cycleCount
      )
      setState(
        current.autoStartBreaks
          ? {
              ...next,
              status: "running",
              endsAt: Date.now() + next.totalMs,
            }
          : next
      )
    } else {
      onBreakCompleteRef.current?.()
      const next = idlePhaseState("focus", current, state.cycleCount)
      setState(
        current.autoStartFocus
          ? {
              ...next,
              status: "running",
              endsAt: Date.now() + next.totalMs,
              focusStartedAt: Date.now(),
            }
          : next
      )
    }
  }, [remainingMs, state])

  // start/resume refresh `now` in the same batch: it only ticks while
  // running, so without this the first render after the click computes the
  // remaining time against a stale timestamp and the display flickers.
  const start = useCallback(() => {
    const startedAt = Date.now()
    setNow(startedAt)
    setState((current) => {
      if (current.status !== "idle") return current
      return {
        ...current,
        status: "running",
        endsAt: startedAt + current.remainingMs,
        focusStartedAt: current.phase === "focus" ? startedAt : null,
      }
    })
  }, [])

  const pause = useCallback(() => {
    setState((current) => {
      if (current.status !== "running" || current.endsAt === null) {
        return current
      }
      return {
        ...current,
        status: "paused",
        endsAt: null,
        remainingMs: Math.max(0, current.endsAt - Date.now()),
      }
    })
  }, [])

  const resume = useCallback(() => {
    const resumedAt = Date.now()
    setNow(resumedAt)
    setState((current) => {
      if (current.status !== "paused") return current
      return {
        ...current,
        status: "running",
        endsAt: resumedAt + current.remainingMs,
      }
    })
  }, [])

  const skipBreak = useCallback(() => {
    setState((current) => {
      if (current.phase === "focus") return current
      return idlePhaseState("focus", settingsRef.current, current.cycleCount)
    })
  }, [])

  // The abandon callback must fire outside the setState updater: React may
  // invoke updaters more than once (StrictMode does), which double-recorded
  // sessions.
  const giveUp = useCallback(() => {
    const current = stateRef.current
    if (current.phase !== "focus" || current.status === "idle") return
    onFocusAbandonedRef.current(focusResultFromState(current, Date.now()))
    setState(idlePhaseState("focus", settingsRef.current, current.cycleCount))
  }, [])

  const progress = useMemo(
    () => (state.totalMs > 0 ? 1 - remainingMs / state.totalMs : 0),
    [remainingMs, state.totalMs]
  )

  return {
    phase: state.phase,
    status: state.status,
    remainingMs,
    totalMs: state.totalMs,
    progress,
    cycleCount: state.cycleCount,
    restored,
    start,
    pause,
    resume,
    skipBreak,
    giveUp,
  }
}

export type PomodoroTimer = ReturnType<typeof usePomodoroTimer>
