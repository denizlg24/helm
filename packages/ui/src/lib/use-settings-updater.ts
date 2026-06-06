import {
  type UpdateUserSettingsInput,
  UpdateUserSettingsInputSchema,
  type UserSettings,
} from "@workspace/types"
import { useCallback, useEffect, useRef } from "react"
import { buildSettingsUpdate } from "./settings"

interface UseSettingsUpdaterOptions {
  settings: UserSettings
  setSettings: (settings: UserSettings) => void
  persist: (
    patch: UpdateUserSettingsInput
  ) => Promise<{ settings: UserSettings }>
  // Called with the full settings on every optimistic change and on server
  // reconciliation. Hosts use it for side effects like caching the mode.
  onChange?: (settings: UserSettings) => void
  onError?: (error: unknown) => void
  delayMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Merge a freshly built patch into the accumulated pending patch so multiple
// rapid changes (e.g. mode then accent) coalesce into a single PATCH.
function deepMerge(
  target: Record<string, unknown>,
  source: object
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key]
    result[key] =
      isRecord(existing) && isRecord(value) ? deepMerge(existing, value) : value
  }
  return result
}

/**
 * Optimistic, debounced settings updater shared by the web and desktop hosts.
 *
 * Spam-switching a setting fires one PATCH per interaction, and out-of-order
 * responses overwriting newer local state cause visible flicker. This hook:
 *   - applies each change to local state immediately (instant, flicker-free UI),
 *   - coalesces rapid changes into a single debounced PATCH,
 *   - guards the in-flight response with an epoch so a stale reconciliation is
 *     dropped once the user has interacted again.
 */
export function useSettingsUpdater({
  settings,
  setSettings,
  persist,
  onChange,
  onError,
  delayMs = 400,
}: UseSettingsUpdaterOptions): (key: string, value: unknown) => void {
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const setSettingsRef = useRef(setSettings)
  setSettingsRef.current = setSettings
  const persistRef = useRef(persist)
  persistRef.current = persist
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatchRef = useRef<Record<string, unknown> | null>(null)
  // Last server-confirmed (or pre-edit) settings to roll back to on failure.
  const rollbackRef = useRef<UserSettings>(settings)
  // Bumped on every interaction so an in-flight response can detect that the
  // user edited again and skip its now-stale reconciliation / rollback.
  const epochRef = useRef(0)

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingPatchRef.current
    if (pending === null) {
      return
    }
    pendingPatchRef.current = null
    const patch = UpdateUserSettingsInputSchema.parse(pending)
    const rollback = rollbackRef.current
    const epochAtFlush = epochRef.current
    persistRef
      .current(patch)
      .then((response) => {
        rollbackRef.current = response.settings
        if (epochRef.current !== epochAtFlush) {
          return
        }
        setSettingsRef.current(response.settings)
        onChangeRef.current?.(response.settings)
      })
      .catch((error) => {
        onErrorRef.current?.(error)
        if (epochRef.current !== epochAtFlush) {
          return
        }
        setSettingsRef.current(rollback)
        onChangeRef.current?.(rollback)
      })
  }, [])

  const updateSetting = useCallback(
    (key: string, value: unknown) => {
      if (pendingPatchRef.current === null) {
        rollbackRef.current = settingsRef.current
      }
      const { settings: next, patch } = buildSettingsUpdate(
        settingsRef.current,
        key,
        value
      )
      setSettingsRef.current(next)
      onChangeRef.current?.(next)
      epochRef.current += 1
      pendingPatchRef.current = deepMerge(pendingPatchRef.current ?? {}, patch)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(flush, delayMs)
    },
    [flush, delayMs]
  )

  // Flush any pending change when the host unmounts so a last-moment switch
  // isn't lost.
  useEffect(() => flush, [flush])

  return updateSetting
}
