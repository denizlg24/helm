import { invoke } from "@tauri-apps/api/core"
import type { PomodoroTimerStore } from "@workspace/ui/pomodoro/pomodoro-dashboard"

// Timer snapshots persist through the Rust core (app data dir) so a running
// countdown survives app restarts, per the desktop architecture rules.
export const createTauriPomodoroTimerStore = (
  workspaceId: string,
  userId: string
): PomodoroTimerStore => {
  const scope = `${workspaceId}_${userId}`
  return {
    load: () => invoke<string | null>("pomodoro_load_state", { scope }),
    save: (snapshot) => invoke<void>("pomodoro_save_state", { scope, snapshot }),
    clear: () => invoke<void>("pomodoro_clear_state", { scope }),
  }
}
