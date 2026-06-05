import {
  type UpdateUserSettingsInput,
  UpdateUserSettingsInputSchema,
  type UserSettings,
  UserSettingsSchema,
} from "@workspace/types"

function toRecord(value: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      result[key] = entry
    }
  }
  return result
}

// Immutable deep-set down a dot path, e.g. ["appearance", "mode"].
function deepSet(
  source: Record<string, unknown>,
  path: string[],
  value: unknown
): Record<string, unknown> {
  const [head, ...rest] = path
  if (head === undefined) {
    return source
  }
  return {
    ...source,
    [head]:
      rest.length === 0 ? value : deepSet(toRecord(source[head]), rest, value),
  }
}

// Apply a single dot-path change to the user's settings, producing both the
// full next value (for optimistic local state) and the minimal partial to
// PATCH to the server. Shared by the web and desktop settings hosts.
export function buildSettingsUpdate(
  current: UserSettings,
  key: string,
  value: unknown
): { settings: UserSettings; patch: UpdateUserSettingsInput } {
  const path = key.split(".")
  return {
    settings: UserSettingsSchema.parse(deepSet(toRecord(current), path, value)),
    patch: UpdateUserSettingsInputSchema.parse(deepSet({}, path, value)),
  }
}
