// Keyboard shortcut helpers shared by web + desktop. Bindings are normalized
// strings of "+"-joined lowercase tokens, modifiers first, e.g. "mod+p",
// "mod+shift+l", "d". "mod" means Cmd on macOS and Ctrl elsewhere.

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"])

export interface ParsedShortcut {
  mod: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  key: string
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false
  }
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

function tokenize(binding: string): string[] {
  return binding
    .toLowerCase()
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean)
}

export function parseShortcut(binding: string): ParsedShortcut {
  const parsed: ParsedShortcut = {
    mod: false,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: "",
  }

  for (const token of tokenize(binding)) {
    switch (token) {
      case "mod":
        parsed.mod = true
        break
      case "ctrl":
      case "control":
        parsed.ctrl = true
        break
      case "alt":
      case "option":
        parsed.alt = true
        break
      case "shift":
        parsed.shift = true
        break
      case "meta":
      case "cmd":
      case "command":
      case "super":
      case "win":
        parsed.meta = true
        break
      default:
        parsed.key = token
    }
  }

  return parsed
}

export function matchShortcut(
  event: KeyboardEvent,
  binding: string,
  mac = isMacPlatform()
): boolean {
  const parsed = parseShortcut(binding)
  if (!parsed.key) {
    return false
  }

  const wantCtrl = parsed.ctrl || (parsed.mod && !mac)
  const wantMeta = parsed.meta || (parsed.mod && mac)

  return (
    event.ctrlKey === wantCtrl &&
    event.metaKey === wantMeta &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    event.key.toLowerCase() === parsed.key
  )
}

// Build a normalized binding from a keydown event for the shortcut recorder.
// Returns null for lone modifier presses or keys that can't be represented as
// a valid binding token (the schema only allows [a-z0-9] tokens).
export function eventToBinding(event: KeyboardEvent): string | null {
  const rawKey = event.key.toLowerCase()
  if (MODIFIER_KEYS.has(rawKey)) {
    return null
  }

  const key = rawKey === " " ? "space" : rawKey
  if (!/^[a-z0-9]+$/u.test(key)) {
    return null
  }

  const tokens: string[] = []
  if (event.ctrlKey || event.metaKey) {
    tokens.push("mod")
  }
  if (event.altKey) {
    tokens.push("alt")
  }
  if (event.shiftKey) {
    tokens.push("shift")
  }
  tokens.push(key)

  return tokens.join("+")
}

function prettyToken(token: string, mac: boolean): string {
  switch (token) {
    case "mod":
      return mac ? "⌘" : "Ctrl"
    case "ctrl":
    case "control":
      return mac ? "⌃" : "Ctrl"
    case "alt":
    case "option":
      return mac ? "⌥" : "Alt"
    case "shift":
      return mac ? "⇧" : "Shift"
    case "meta":
    case "cmd":
    case "command":
      return mac ? "⌘" : "Win"
    case "space":
      return "Space"
    default:
      return token.length === 1 ? token.toUpperCase() : token
  }
}

// Human-readable tokens in display order, for rendering as individual <kbd>s.
export function formatShortcutTokens(
  binding: string,
  mac = isMacPlatform()
): string[] {
  return tokenize(binding).map((token) => prettyToken(token, mac))
}

export function formatShortcut(binding: string, mac = isMacPlatform()): string {
  const tokens = formatShortcutTokens(binding, mac)
  return mac ? tokens.join("") : tokens.join("+")
}
