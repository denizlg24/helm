const STORAGE_KEY = "helm.desktop.local-settings"

function read(): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return result
    }
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = value
      }
    }
  } catch {
    // Ignore corrupt storage; fall back to empty.
  }
  return result
}

export function getLocalSettings(): Record<string, unknown> {
  return read()
}

export function setLocalSetting(key: string, value: unknown): void {
  const next = read()
  next[key] = value
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (error) {
    console.error("Failed to write to localStorage:", error)
  }
}
