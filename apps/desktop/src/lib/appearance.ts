import { type AppearanceMode, AppearanceModeSchema } from "@workspace/types"

// The desktop shell has no next-themes; light/dark is the `.dark` class on the
// document root (color theme is a separate `data-theme` baked at build time).
const DARK_QUERY = "(prefers-color-scheme: dark)"
const STORAGE_KEY = "helm.desktop.appearance-mode"

function setDark(isDark: boolean): void {
  document.documentElement.classList.toggle("dark", isDark)
}

// Applies the appearance mode and returns a cleanup that removes any system
// preference listener. Re-call (after cleanup) whenever the mode changes.
export function applyAppearanceMode(mode: AppearanceMode): () => void {
  if (mode === "system") {
    const media = window.matchMedia(DARK_QUERY)
    const update = () => setDark(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }

  setDark(mode === "dark")
  return () => {}
}

export function getCachedAppearanceMode(): AppearanceMode {
  try {
    const parsed = AppearanceModeSchema.safeParse(
      localStorage.getItem(STORAGE_KEY)
    )
    if (parsed.success) {
      return parsed.data
    }
  } catch {
    // Ignore unavailable or corrupt storage; fall back to system.
  }
  return "system"
}

export function cacheAppearanceMode(mode: AppearanceMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Non-fatal; server settings remain the source of truth.
  }
}

export function applyCachedAppearanceMode(): () => void {
  return applyAppearanceMode(getCachedAppearanceMode())
}

export function applyCachedAppearanceSnapshot(): void {
  const mode = getCachedAppearanceMode()
  if (mode === "system") {
    setDark(window.matchMedia(DARK_QUERY).matches)
    return
  }
  setDark(mode === "dark")
}

export function isDarkActive(): boolean {
  return document.documentElement.classList.contains("dark")
}
