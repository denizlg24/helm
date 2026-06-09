"use client"

import type {
  PomodoroSession,
  UpdatePomodoroSessionInput,
} from "@workspace/types"
import { Flag, Pause, Play, Settings2, SkipForward } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { AppHeaderUser } from "../components/app-header"
import { AppHeader } from "../components/app-header"
import { Button } from "../components/button"
import { toast } from "../components/sonner"
import { Spinner } from "../components/spinner"
import { useBackgroundActivities } from "../lib/background-activity"
import { cn } from "../lib/utils"
import { BoatScene, type BoatSceneMode } from "./components/boat-scene"
import { PomodoroSettingsDialog } from "./components/pomodoro-settings-dialog"
import { SessionAnnotationDialog } from "./components/session-annotation-dialog"
import { SessionLog } from "./components/session-log"
import { formatRemainingSeconds } from "./lib/pomodoro-timer"
import { usePomodoro } from "./pomodoro-provider"

export type { PomodoroTimerStore } from "./lib/pomodoro-timer"
export { createLocalStorageTimerStore } from "./lib/pomodoro-timer"
export type { PomodoroClient } from "./pomodoro-provider"

export interface PomodoroDashboardProps {
  user: AppHeaderUser
  onSignOut: () => Promise<void>
  onSettings?: () => void
  onResolveWorkspace: () => Promise<void>
  headerClassName?: string
  headerDragRegion?: boolean
  headerEndSlot?: React.ReactNode
  headerTitle?: string
}

const LOG_WINDOW_DAYS = 14

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

export function PomodoroDashboard({
  user,
  onSignOut,
  onSettings,
  onResolveWorkspace,
  headerClassName,
  headerDragRegion,
  headerEndSlot,
  headerTitle = "Pomodoro",
}: PomodoroDashboardProps) {
  const pomodoro = usePomodoro()
  const backgroundActivities = useBackgroundActivities()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<PomodoroSession[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [annotating, setAnnotating] = useState<PomodoroSession | null>(null)
  const [workspaceError, setWorkspaceError] = useState<unknown>(null)

  const { client, settings } = pomodoro

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const from = new Date()
        from.setDate(from.getDate() - LOG_WINDOW_DAYS)
        const response = await client.pomodoro.sessions.list({
          from,
          limit: 200,
        })
        setSessions(response.sessions)
      } catch (error) {
        if (!silent) {
          toast.error(getErrorMessage(error, "Could not load pomodoro data"))
        }
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  useEffect(() => {
    let cancelled = false
    setWorkspaceError(null)
    onResolveWorkspace()
      .then(() => {
        if (!cancelled) {
          setReady(true)
          setWorkspaceError(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceError(error)
          setReady(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [onResolveWorkspace])

  useEffect(() => {
    if (ready) void load()
  }, [ready, load])

  // The provider bumps this after recording a session or an assistant
  // mutation; refresh silently so the log stays current.
  const { sessionsVersion } = pomodoro
  useEffect(() => {
    if (ready && sessionsVersion > 0) void load(true)
  }, [ready, sessionsVersion, load])

  const handleSaveSettings = useCallback(
    async (input: Parameters<typeof pomodoro.updateSettings>[0]) => {
      try {
        await pomodoro.updateSettings(input)
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not save settings"))
        throw error
      }
    },
    [pomodoro.updateSettings]
  )

  const handleAnnotate = useCallback(
    async (id: string, input: UpdatePomodoroSessionInput) => {
      try {
        const response = await client.pomodoro.sessions.update(id, input)
        setSessions((current) => {
          const exists = current.some((session) => session.id === id)
          return exists
            ? current.map((session) =>
                session.id === id ? response.session : session
              )
            : [response.session, ...current]
        })
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not save the log"))
        throw error
      }
    },
    [client]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await client.pomodoro.sessions.delete(id)
        setSessions((current) => current.filter((session) => session.id !== id))
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not delete the session"))
        throw error
      }
    },
    [client]
  )

  const annotationSession = annotating ?? pomodoro.pendingAnnotation

  const closeAnnotation = useCallback(
    (open: boolean) => {
      if (open) return
      setAnnotating(null)
      pomodoro.clearPendingAnnotation()
    },
    [pomodoro.clearPendingAnnotation]
  )

  const { phase, status, remainingSeconds, totalMs, cycleCount, sceneFlash } =
    pomodoro
  const progress = totalMs > 0 ? 1 - (remainingSeconds * 1000) / totalMs : 0

  const sceneMode: BoatSceneMode =
    sceneFlash ??
    (phase !== "focus"
      ? "break"
      : status === "running"
        ? "sailing"
        : status === "paused"
          ? "paused"
          : "idle")

  const statusCopy =
    sceneFlash === "arrived"
      ? "Session complete"
      : sceneFlash === "sinking"
        ? "Ending session…"
        : phase !== "focus"
          ? status === "running"
            ? "On a break"
            : "Break ready when you are"
          : status === "running"
            ? "Focusing…"
            : status === "paused"
              ? "Paused"
              : "Ready when you are"

  const phaseLabel =
    phase === "focus"
      ? "Focus"
      : phase === "short-break"
        ? "Short break"
        : "Long break"

  const cycleSlots = settings.longBreakEvery
  const filledSlots =
    phase === "long-break" ? cycleSlots : cycleCount % cycleSlots

  const today = new Date()
  const completedToday = sessions.filter(
    (session) =>
      session.status === "completed" &&
      isSameLocalDay(new Date(session.startedAt), today)
  ).length

  const header = (
    <AppHeader
      backgroundItems={backgroundActivities}
      className={headerClassName}
      dragRegion={headerDragRegion}
      endSlot={headerEndSlot}
      notifications={[]}
      onLogout={() => void onSignOut()}
      onSettings={onSettings}
      sidebarOpen={false}
      title={headerTitle}
      user={user}
    />
  )

  if (workspaceError) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md px-6 text-center">
            <p className="font-medium text-foreground text-lg">
              Could not resolve workspace
            </p>
            <p className="mt-2 text-muted-foreground text-sm">
              {getErrorMessage(workspaceError, "An unexpected error occurred")}
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                setWorkspaceError(null)
                setReady(false)
              }}
              type="button"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!ready || loading) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      {header}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-10 px-6 py-10">
          <section className="relative px-6 py-8 text-center sm:px-10">
            <Button
              aria-label="Timer settings"
              className="absolute top-4 right-4 text-muted-foreground"
              onClick={() => setSettingsOpen(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Settings2 className="size-4" />
            </Button>

            <BoatScene
              className="mx-auto max-w-md"
              mode={sceneMode}
              progress={progress}
            />

            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                {phaseLabel}
              </span>
              <span className="flex items-center gap-1.5">
                {Array.from({ length: cycleSlots }, (_, index) => (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      index < filledSlots ? "bg-foreground" : "bg-border"
                    )}
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size cycle slots.
                    key={index}
                  />
                ))}
              </span>
            </div>

            <p className="mt-2 font-semibold text-6xl tabular-nums tracking-tight sm:text-7xl">
              {formatRemainingSeconds(remainingSeconds)}
            </p>
            <p className="mt-2 text-muted-foreground text-sm">{statusCopy}</p>

            <div className="mt-8 flex items-center justify-center gap-3">
              {phase === "focus" ? (
                <>
                  {status !== "idle" ? (
                    <Button
                      onClick={pomodoro.giveUp}
                      type="button"
                      variant="ghost"
                    >
                      <Flag className="size-4" />
                      End early
                    </Button>
                  ) : null}
                  <Button
                    className="rounded-full px-8"
                    onClick={
                      status === "running"
                        ? pomodoro.pause
                        : status === "paused"
                          ? pomodoro.resume
                          : pomodoro.start
                    }
                    size="lg"
                    type="button"
                  >
                    {status === "running" ? (
                      <>
                        <Pause className="size-4" />
                        Pause
                      </>
                    ) : status === "paused" ? (
                      <>
                        <Play className="size-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Play className="size-4" />
                        Start focus
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={pomodoro.skipBreak}
                    type="button"
                    variant="ghost"
                  >
                    <SkipForward className="size-4" />
                    Skip break
                  </Button>
                  <Button
                    className="rounded-full px-8"
                    onClick={
                      status === "running"
                        ? pomodoro.pause
                        : status === "paused"
                          ? pomodoro.resume
                          : pomodoro.start
                    }
                    size="lg"
                    type="button"
                    variant="outline"
                  >
                    {status === "running" ? (
                      <>
                        <Pause className="size-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-4" />
                        {status === "paused" ? "Resume" : "Start break"}
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>

            <p className="mt-8 text-muted-foreground text-xs tabular-nums">
              {completedToday} of {settings.dailyGoalSessions} sessions
              completed today
            </p>
          </section>

          <section>
            <h2 className="font-medium text-sm uppercase tracking-[0.2em]">
              Session log
            </h2>
            <div className="mt-4">
              <SessionLog
                dailyGoal={settings.dailyGoalSessions}
                onAnnotate={setAnnotating}
                onDelete={handleDelete}
                sessions={sessions}
              />
            </div>
          </section>
        </div>
      </main>

      <PomodoroSettingsDialog
        onOpenChange={setSettingsOpen}
        onSave={handleSaveSettings}
        open={settingsOpen}
        settings={settings}
      />
      <SessionAnnotationDialog
        onOpenChange={closeAnnotation}
        onSave={handleAnnotate}
        session={annotationSession}
      />
    </div>
  )
}
