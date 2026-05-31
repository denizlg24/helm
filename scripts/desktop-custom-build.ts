import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const desktopDir = join(repoRoot, "apps", "desktop")
const tauriDir = join(desktopDir, "src-tauri")
const tauriConfigPath = join(tauriDir, "tauri.conf.json")
const generatedConfigPath = join(
  desktopDir,
  "src",
  "generated",
  "custom-build.ts"
)

const ALLOWED_THEMES = new Set([
  "rose",
  "coral",
  "blush",
  "amber",
  "butter",
  "mint",
  "cyan",
  "sky",
  "lavender",
  "plum",
])

interface TauriConfig {
  productName?: string
  identifier?: string
  app?: {
    windows?: Array<{ title?: string }>
  }
  bundle?: {
    icon?: string[]
  }
}

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback
}

function parseFeatures(raw: string): string[] {
  return raw
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean)
    .filter((feature, index, all) => all.indexOf(feature) === index)
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function requireSafeAppName(input: string): string {
  if (!input || input.length > 64) {
    throw new Error("HELM_CUSTOM_APP_NAME must be 1-64 characters")
  }
  if (!/^[\w .'-]+$/u.test(input)) {
    throw new Error(
      "HELM_CUSTOM_APP_NAME can only contain letters, numbers, spaces, dots, apostrophes, underscores, and hyphens"
    )
  }
  return input
}

function requireSafeIdentifier(input: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+$/u.test(input)) {
    throw new Error(
      "HELM_CUSTOM_IDENTIFIER must be a reverse-DNS style identifier"
    )
  }
  return input
}

async function collectIconFiles(iconDir: string, buildId: string) {
  const source = resolve(repoRoot, iconDir)
  const sourceStat = await stat(source)
  if (!sourceStat.isDirectory()) {
    throw new Error(`HELM_CUSTOM_ICON_DIR is not a directory: ${iconDir}`)
  }

  const targetRoot = join(tauriDir, "icons-custom", buildId)
  await rm(targetRoot, { force: true, recursive: true })
  await mkdir(targetRoot, { recursive: true })
  await cp(source, targetRoot, { recursive: true })

  const files: string[] = []
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (!/\.(png|ico|icns)$/iu.test(entry.name)) {
        continue
      }
      files.push(relative(tauriDir, absolute).split(sep).join("/"))
    }
  }

  await walk(targetRoot)
  if (files.length === 0) {
    throw new Error(
      "HELM_CUSTOM_ICON_DIR did not contain png, ico, or icns files"
    )
  }
  return { files: files.sort(), targetRoot }
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`)
  }
}

async function main() {
  const appName = requireSafeAppName(env("HELM_CUSTOM_APP_NAME", "Helm"))
  const buildId = slugify(env("HELM_CUSTOM_BUILD_ID", randomUUID()))
  if (!buildId) {
    throw new Error(
      "HELM_CUSTOM_BUILD_ID must contain at least one alphanumeric character"
    )
  }
  const theme = env("HELM_CUSTOM_THEME", "sky")
  if (!ALLOWED_THEMES.has(theme)) {
    throw new Error(
      `HELM_CUSTOM_THEME must be one of: ${Array.from(ALLOWED_THEMES).join(", ")}`
    )
  }
  const enabledFeatures = parseFeatures(env("HELM_CUSTOM_FEATURES"))
  const identifier = requireSafeIdentifier(
    env("HELM_CUSTOM_IDENTIFIER", `com.helm.${buildId}`)
  )
  const iconDir = env("HELM_CUSTOM_ICON_DIR")

  const originalTauriConfig = await readFile(tauriConfigPath, "utf8")
  const originalGeneratedConfig = await readFile(generatedConfigPath, "utf8")
  let customIconRoot: string | null = null

  try {
    const tauriConfig = JSON.parse(originalTauriConfig) as TauriConfig
    tauriConfig.productName = appName
    tauriConfig.identifier = identifier
    if (tauriConfig.app?.windows?.[0]) {
      tauriConfig.app.windows[0].title = appName
    }
    if (iconDir) {
      tauriConfig.bundle ??= {}
      const iconResult = await collectIconFiles(iconDir, buildId)
      tauriConfig.bundle.icon = iconResult.files
      customIconRoot = iconResult.targetRoot
    }

    await writeFile(
      tauriConfigPath,
      `${JSON.stringify(tauriConfig, null, 2)}\n`
    )
    await writeFile(
      generatedConfigPath,
      [
        "export const customBuild = {",
        `  appName: ${JSON.stringify(appName)},`,
        `  buildId: ${JSON.stringify(buildId)},`,
        `  enabledFeatures: ${JSON.stringify(enabledFeatures)},`,
        `  theme: ${JSON.stringify(theme)},`,
        "} as const",
        "",
      ].join("\n")
    )

    run("bun", ["--filter", "desktop", "tauri", "build"])

    const bundleDir = join(tauriDir, "target", "release", "bundle")
    console.log("Custom desktop build complete")
    console.log(`Bundle directory: ${bundleDir}`)
  } finally {
    await writeFile(tauriConfigPath, originalTauriConfig)
    await writeFile(generatedConfigPath, originalGeneratedConfig)
    if (customIconRoot) {
      await rm(customIconRoot, { force: true, recursive: true })
    }
  }
}

await main()
