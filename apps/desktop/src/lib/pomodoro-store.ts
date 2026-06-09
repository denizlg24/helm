import { invoke } from "@tauri-apps/api/core"
import type { PomodoroTimerStore } from "@workspace/ui/pomodoro/pomodoro-dashboard"

// Timer snapshots persist through the Rust core (app data dir) so a running
// countdown survives app restarts, per the desktop architecture rules.
export const tauriPomodoroTimerStore: PomodoroTimerStore = {
  load: () => invoke<string | null>("pomodoro_load_state"),
  save: (snapshot) => invoke<void>("pomodoro_save_state", { snapshot }),
  clear: () => invoke<void>("pomodoro_clear_state"),
}
