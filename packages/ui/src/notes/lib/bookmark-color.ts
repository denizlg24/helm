const FALLBACK_HUE = 210

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export type ColorScheme = "dark" | "light"

export function hueFromKey(key: string | undefined | null): number {
  if (!key || key.trim().length === 0) return FALLBACK_HUE
  return hashString(key.trim().toLowerCase()) % 360
}

export function classColor(
  key: string | undefined | null,
  scheme: ColorScheme = "dark"
): string {
  const hue = hueFromKey(key)
  const sat = 62
  const light = scheme === "dark" ? 64 : 42
  return `hsl(${hue} ${sat}% ${light}%)`
}

type Rgb = { r: number; g: number; b: number }
type Hsl = { h: number; s: number; l: number }

let sharedColorContext: CanvasRenderingContext2D | null | undefined

function getColorContext(): CanvasRenderingContext2D | null {
  if (sharedColorContext !== undefined) return sharedColorContext
  if (typeof document === "undefined") {
    sharedColorContext = null
    return null
  }
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  sharedColorContext = canvas.getContext("2d", { willReadFrequently: true })
  return sharedColorContext
}

// Resolve any CSS color string (hex, rgb, hsl, oklch, var-resolved value) to RGB
// by letting the canvas engine do the parsing. Returns null in non-DOM contexts
// or for values the engine cannot resolve.
function resolveCssColorToRgb(color: string): Rgb | null {
  const context = getColorContext()
  if (!context) return null
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = "#000000"
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const data = context.getImageData(0, 0, 1, 1).data
  return { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 }
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return { h: 0, s: 0, l }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  return { h, s, l }
}

export function hueFromCssColor(color: string): number | null {
  const rgb = resolveCssColorToRgb(color)
  if (!rgb) return null
  const { h, s } = rgbToHsl(rgb)
  // A near-grey accent carries no meaningful hue to bias toward.
  return s < 0.05 ? null : h
}

// Shortest circular rotation of `hue` toward `target` by `strength` (0..1).
function rotateHueToward(
  hue: number,
  target: number,
  strength: number
): number {
  const diff = ((target - hue + 540) % 360) - 180
  return (hue + diff * strength + 360) % 360
}

const alphaCache = new Map<string, string>()

// Build an rgba() string from any CSS color at the given alpha (0..1). Themes
// expose colors as oklch/var, so naive hex-alpha concatenation produces invalid
// strings that the canvas silently renders as black.
export function colorWithAlpha(color: string, alpha: number): string {
  const cacheKey = `${color}|${alpha}`
  const cached = alphaCache.get(cacheKey)
  if (cached) return cached

  const rgb = resolveCssColorToRgb(color)
  const result = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : color
  alphaCache.set(cacheKey, result)
  return result
}

const biasCache = new Map<string, string>()

// Pull an auto-generated color toward the theme accent hue while keeping its own
// saturation/lightness, so graph nodes stay distinct but live in the theme family.
export function biasColorToward(
  color: string,
  accentHue: number,
  strength: number
): string {
  const cacheKey = `${color}|${accentHue}|${strength}`
  const cached = biasCache.get(cacheKey)
  if (cached) return cached

  const rgb = resolveCssColorToRgb(color)
  if (!rgb) return color
  const { h, s, l } = rgbToHsl(rgb)
  const nextHue = Math.round(rotateHueToward(h, accentHue, strength))
  const result = `hsl(${nextHue} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
  biasCache.set(cacheKey, result)
  return result
}
