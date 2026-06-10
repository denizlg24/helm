"use client"

import type {
  CreatePomodoroSessionInput,
  PomodoroSession,
  PomodoroSessionDetailResponse,
  PomodoroSessionsQuery,
  PomodoroSessionsResponse,
  PomodoroSettings,
  PomodoroSettingsResponse,
  UpdatePomodoroSessionInput,
  UpdatePomodoroSettingsInput,
} from "@workspace/types"
import { PomodoroSettingsSchema } from "@workspace/types"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type ClientToolOutcome,
  useModuleDataInvalidation,
  useRegisterClientTool,
} from "../assistant/bridge"
import type { AppHeaderBackgroundItem } from "../components/app-header"
import { toast } from "../components/sonner"
import { usePublishBackgroundActivity } from "../lib/background-activity"
import { useNotificationsOptional } from "../notifications/notifications-provider"
import {
  createLocalStorageTimerStore,
  type FocusResult,
  formatRemainingSeconds,
  type PomodoroPhase,
  type PomodoroTimerStatus,
  type PomodoroTimerStore,
  usePomodoroTimer,
} from "./lib/pomodoro-timer"

export interface PomodoroClient {
  pomodoro: {
    settings: {
      get: () => Promise<PomodoroSettingsResponse>
      update: (
        input: UpdatePomodoroSettingsInput
      ) => Promise<PomodoroSettingsResponse>
    }
    sessions: {
      list: (query?: PomodoroSessionsQuery) => Promise<PomodoroSessionsResponse>
      create: (
        input: CreatePomodoroSessionInput
      ) => Promise<PomodoroSessionDetailResponse>
      update: (
        id: string,
        input: UpdatePomodoroSessionInput
      ) => Promise<PomodoroSessionDetailResponse>
      delete: (id: string) => Promise<{ id: string }>
    }
  }
}

export type PomodoroSceneFlash = "arrived" | "sinking" | null

export interface PomodoroContextValue {
  enabled: boolean
  client: PomodoroClient
  settings: PomodoroSettings
  updateSettings: (input: UpdatePomodoroSettingsInput) => Promise<void>
  phase: PomodoroPhase
  status: PomodoroTimerStatus
  remainingSeconds: number
  totalMs: number
  cycleCount: number
  start: () => void
  pause: () => void
  resume: () => void
  skipBreak: () => void
  giveUp: () => void
  sceneFlash: PomodoroSceneFlash
  pendingAnnotation: PomodoroSession | null
  clearPendingAnnotation: () => void
  // Bumped whenever sessions change server-side (recorded here or mutated by
  // the assistant); the dashboard reloads its list on change.
  sessionsVersion: number
}

const PomodoroContext = createContext<PomodoroContextValue | null>(null)

export function usePomodoro(): PomodoroContextValue {
  const context = useContext(PomodoroContext)
  if (!context) {
    throw new Error("usePomodoro must be used within a PomodoroProvider")
  }
  return context
}

export function usePomodoroOptional(): PomodoroContextValue | null {
  return useContext(PomodoroContext)
}

export interface PomodoroProviderProps {
  client: PomodoroClient
  // Module enabled for the workspace (and bundled, on desktop). When false the
  // provider stays dormant: no fetches, no activity item, tools report off.
  enabled: boolean
  timerStore?: PomodoroTimerStore
  notify?: (title: string, body: string) => void
  children: ReactNode
}

const DEFAULT_SETTINGS = PomodoroSettingsSchema.parse({})
const MIN_RECORDED_ABANDON_SECONDS = 60

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

const playChime = () => {
  try {
    const context = new AudioContext()
    const playTone = (frequency: number, startSeconds: number) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, context.currentTime + startSeconds)
      gain.gain.linearRampToValueAtTime(
        0.18,
        context.currentTime + startSeconds + 0.02
      )
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + startSeconds + 0.5
      )
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(context.currentTime + startSeconds)
      oscillator.stop(context.currentTime + startSeconds + 0.55)
    }
    playTone(660, 0)
    playTone(880, 0.18)
    setTimeout(() => void context.close(), 1200)
  } catch {
    // Audio is best-effort (no output device, autoplay policy, etc.).
  }
}

const outcome = (payload: Record<string, unknown>): ClientToolOutcome => ({
  result: JSON.stringify(payload),
})

const errorOutcome = (message: string): ClientToolOutcome => ({
  result: message,
  isError: true,
})

export function PomodoroProvider({
  client,
  enabled,
  timerStore,
  notify,
  children,
}: PomodoroProviderProps) {
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS)
  const [pendingAnnotation, setPendingAnnotation] =
    useState<PomodoroSession | null>(null)
  const [sessionsVersion, setSessionsVersion] = useState(0)
  const [sceneFlash, setSceneFlash] = useState<PomodoroSceneFlash>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const store = useMemo(
    () => timerStore ?? createLocalStorageTimerStore(),
    [timerStore]
  )

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const flashScene = useCallback(
    (mode: "arrived" | "sinking", durationMs: number) => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      setSceneFlash(mode)
      flashTimeoutRef.current = setTimeout(
        () => setSceneFlash(null),
        durationMs
      )
    },
    []
  )

  useEffect(
    () => () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    },
    []
  )

  // When a NotificationsProvider is mounted, user-facing notices are persisted
  // as pomodoro notifications — the SSE echo renders the toast on every
  // connected device. Without one (or when the create fails) they fall back to
  // a local toast so feedback is never lost.
  const notificationsContext = useNotificationsOptional()
  const publishRef = useRef(notificationsContext?.publish ?? null)
  publishRef.current = notificationsContext?.publish ?? null

  const emitUserNotice = useCallback(
    (title: string, body: string, severity: "info" | "error" = "info") => {
      const showToast = () => {
        if (severity === "error") {
          toast.error(title, { description: body })
        } else {
          toast(title, { description: body })
        }
      }
      const publish = publishRef.current
      if (publish) {
        void publish({ category: "pomodoro", title, body, severity }).catch(
          showToast
        )
        return
      }
      showToast()
    },
    []
  )

  const announce = useCallback(
    (title: string, body: string) => {
      if (!settingsRef.current.notificationsEnabled) return
      notify?.(title, body)
      const publish = publishRef.current
      if (publish) {
        void publish({
          category: "pomodoro",
          title,
          body,
          severity: "info",
        }).catch(() => {})
      }
    },
    [notify]
  )

  const chime = useCallback(() => {
    if (settingsRef.current.soundEnabled) playChime()
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const response = await client.pomodoro.settings.get()
      setSettings(response.settings)
    } catch {
      // Defaults remain; the dashboard surfaces load errors on its own fetch.
    }
  }, [client])

  useEffect(() => {
    if (enabled) void loadSettings()
  }, [enabled, loadSettings])

  // The assistant mutates pomodoro data through server tools; refresh both the
  // settings (timer durations may have changed) and the session list version.
  useModuleDataInvalidation("pomodoro", () => {
    if (!enabled) return
    void loadSettings()
    setSessionsVersion((version) => version + 1)
  })

  const recordSession = useCallback(
    async (focus: FocusResult, status: "completed" | "abandoned") => {
      const response = await client.pomodoro.sessions.create({
        status,
        startedAt: focus.startedAt,
        endedAt: focus.endedAt,
        plannedMinutes: focus.plannedMinutes,
        completedSeconds: focus.completedSeconds,
      })
      setSessionsVersion((version) => version + 1)
      return response.session
    },
    [client]
  )

  const handleFocusComplete = useCallback(
    (focus: FocusResult) => {
      if (!enabled) return
      flashScene("arrived", 5000)
      chime()
      announce("Focus complete", "Focus session finished — time for a break.")
      recordSession(focus, "completed")
        .then((session) => setPendingAnnotation(session))
        .catch((error) => {
          emitUserNotice(
            "Could not save the session",
            getErrorMessage(error, "The focus session was not recorded."),
            "error"
          )
        })
    },
    [enabled, announce, chime, emitUserNotice, flashScene, recordSession]
  )

  const handleFocusAbandoned = useCallback(
    (focus: FocusResult) => {
      if (!enabled) return
      flashScene("sinking", 1600)
      if (focus.completedSeconds < MIN_RECORDED_ABANDON_SECONDS) {
        emitUserNotice(
          "Session ended",
          "Sessions under a minute are not logged."
        )
        return
      }
      recordSession(focus, "abandoned")
        .then(() => {
          emitUserNotice(
            "Session ended early",
            "Logged as an unfinished session."
          )
        })
        .catch((error) => {
          emitUserNotice(
            "Could not save the session",
            getErrorMessage(error, "The focus session was not recorded."),
            "error"
          )
        })
    },
    [enabled, emitUserNotice, flashScene, recordSession]
  )

  const handleBreakComplete = useCallback(() => {
    if (!enabled) return
    chime()
    announce("Break over", "Ready for the next focus session.")
  }, [enabled, announce, chime])

  const timer = usePomodoroTimer({
    settings,
    store,
    onFocusComplete: handleFocusComplete,
    onFocusAbandoned: handleFocusAbandoned,
    onBreakComplete: handleBreakComplete,
  })

  const timerRef = useRef(timer)
  timerRef.current = timer

  const updateSettings = useCallback(
    async (input: UpdatePomodoroSettingsInput) => {
      const response = await client.pomodoro.settings.update(input)
      setSettings(response.settings)
    },
    [client]
  )

  const clearPendingAnnotation = useCallback(
    () => setPendingAnnotation(null),
    []
  )

  // --- Assistant client tools -------------------------------------------------
  // Registered app-wide so the assistant can drive the local timer from any
  // surface. The server only offers these tools when the module is enabled,
  // but each handler still guards so a stale turn cannot act while disabled.

  const makeStatusPayload = useCallback(
    (
      phase: PomodoroPhase,
      status: PomodoroTimerStatus,
      remainingMs: number,
      totalMs: number,
      cycleCount: number
    ) => {
      const currentSettings = settingsRef.current
      const remainingSeconds = Math.ceil(remainingMs / 1000)
      return {
        phase,
        status,
        remaining: formatRemainingSeconds(remainingSeconds),
        remainingSeconds,
        plannedMinutes: Math.round(totalMs / 60_000),
        focusSessionsInCurrentCycle:
          cycleCount % currentSettings.longBreakEvery,
        longBreakEvery: currentSettings.longBreakEvery,
      }
    },
    []
  )

  const statusPayload = useCallback(() => {
    const current = timerRef.current
    return makeStatusPayload(
      current.phase,
      current.status,
      current.remainingMs,
      current.totalMs,
      current.cycleCount
    )
  }, [makeStatusPayload])

  const guardDisabled = useCallback(
    (run: () => ClientToolOutcome): ClientToolOutcome => {
      if (!enabled) {
        return errorOutcome("The Pomodoro module is not enabled.")
      }
      return run()
    },
    [enabled]
  )

  useRegisterClientTool("pomodoro_status", () =>
    guardDisabled(() => outcome(statusPayload()))
  )

  useRegisterClientTool("pomodoro_start", () =>
    guardDisabled(() => {
      const current = timerRef.current
      if (current.status === "running") {
        return errorOutcome("The timer is already running.")
      }
      // Compute post-action state: start/resume sets status to "running"
      const postStatus: PomodoroTimerStatus = "running"
      const postRemainingMs = current.remainingMs

      if (current.status === "paused") current.resume()
      else current.start()

      return outcome({
        started: true,
        ...makeStatusPayload(
          current.phase,
          postStatus,
          postRemainingMs,
          current.totalMs,
          current.cycleCount
        ),
      })
    })
  )

  useRegisterClientTool("pomodoro_pause", () =>
    guardDisabled(() => {
      const current = timerRef.current
      if (current.status !== "running") {
        return errorOutcome("The timer is not running.")
      }
      // Compute post-action state: pause sets status to "paused"
      const postStatus: PomodoroTimerStatus = "paused"
      const postRemainingMs = current.remainingMs

      timerRef.current.pause()

      return outcome({
        paused: true,
        ...makeStatusPayload(
          current.phase,
          postStatus,
          postRemainingMs,
          current.totalMs,
          current.cycleCount
        ),
      })
    })
  )

  useRegisterClientTool("pomodoro_resume", () =>
    guardDisabled(() => {
      const current = timerRef.current
      if (current.status !== "paused") {
        return errorOutcome("The timer is not paused.")
      }
      // Compute post-action state: resume sets status to "running"
      const postStatus: PomodoroTimerStatus = "running"
      const postRemainingMs = current.remainingMs

      timerRef.current.resume()

      return outcome({
        resumed: true,
        ...makeStatusPayload(
          current.phase,
          postStatus,
          postRemainingMs,
          current.totalMs,
          current.cycleCount
        ),
      })
    })
  )

  useRegisterClientTool("pomodoro_skip_break", () =>
    guardDisabled(() => {
      const current = timerRef.current
      if (current.phase === "focus") {
        return errorOutcome("No break is in progress.")
      }
      // Compute post-action state: skipBreak moves to idle focus phase
      const currentSettings = settingsRef.current
      const postPhase: PomodoroPhase = "focus"
      const postStatus: PomodoroTimerStatus = "idle"
      const postTotalMs = currentSettings.focusMinutes * 60_000
      const postRemainingMs = postTotalMs

      timerRef.current.skipBreak()

      return outcome({
        skipped: true,
        ...makeStatusPayload(
          postPhase,
          postStatus,
          postRemainingMs,
          postTotalMs,
          current.cycleCount
        ),
      })
    })
  )

  useRegisterClientTool("pomodoro_give_up", () =>
    guardDisabled(() => {
      const current = timerRef.current
      if (current.phase !== "focus" || current.status === "idle") {
        return errorOutcome("No focus session is in progress.")
      }
      // Compute post-action state: giveUp moves to idle focus phase
      const currentSettings = settingsRef.current
      const postPhase: PomodoroPhase = "focus"
      const postStatus: PomodoroTimerStatus = "idle"
      const postTotalMs = currentSettings.focusMinutes * 60_000
      const postRemainingMs = postTotalMs

      current.giveUp()

      return outcome({
        abandoned: true,
        ...makeStatusPayload(
          postPhase,
          postStatus,
          postRemainingMs,
          postTotalMs,
          current.cycleCount
        ),
      })
    })
  )

  // --- Activity panel -----------------------------------------------------

  const remainingSeconds = Math.ceil(timer.remainingMs / 1000)

  const backgroundItem = useMemo<AppHeaderBackgroundItem | null>(() => {
    if (!enabled) return null
    if (timer.status === "idle") {
      return pendingAnnotation
        ? {
            id: "pomodoro",
            label: "Pomodoro · session ready to log",
            status: "attention",
          }
        : null
    }
    const phaseLabel = timer.phase === "focus" ? "Focus" : "Break"
    const time = formatRemainingSeconds(remainingSeconds)
    return {
      id: "pomodoro",
      label:
        timer.status === "paused"
          ? `${phaseLabel} paused · ${time}`
          : `${phaseLabel} · ${time}`,
      status: timer.status === "running" ? "running" : "idle",
    }
  }, [enabled, timer.status, timer.phase, remainingSeconds, pendingAnnotation])

  usePublishBackgroundActivity("pomodoro", backgroundItem)

  const value = useMemo<PomodoroContextValue>(
    () => ({
      enabled,
      client,
      settings,
      updateSettings,
      phase: timer.phase,
      status: timer.status,
      remainingSeconds,
      totalMs: timer.totalMs,
      cycleCount: timer.cycleCount,
      start: timer.start,
      pause: timer.pause,
      resume: timer.resume,
      skipBreak: timer.skipBreak,
      giveUp: timer.giveUp,
      sceneFlash,
      pendingAnnotation,
      clearPendingAnnotation,
      sessionsVersion,
    }),
    [
      enabled,
      client,
      settings,
      updateSettings,
      timer.phase,
      timer.status,
      remainingSeconds,
      timer.totalMs,
      timer.cycleCount,
      timer.start,
      timer.pause,
      timer.resume,
      timer.skipBreak,
      timer.giveUp,
      sceneFlash,
      pendingAnnotation,
      clearPendingAnnotation,
      sessionsVersion,
    ]
  )

  return (
    <PomodoroContext.Provider value={value}>
      {children}
    </PomodoroContext.Provider>
  )
}
