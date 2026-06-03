"use client"

import {
  coreModuleIds,
  type ModuleDefinition,
  moduleDefinitions,
} from "@workspace/module-registry"
import {
  type DesktopBuild,
  type DesktopBuildStatus,
  type DesktopTheme,
  DesktopThemeSchema,
} from "@workspace/types"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import {
  CheckIcon,
  DownloadIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiClient } from "../../lib/api-client"

interface ModuleGroup {
  group: string
  modules: ModuleDefinition[]
}

const THEMES = DesktopThemeSchema.options

const groupLabels: Record<string, string> = {
  knowledge: "Knowledge",
  work: "Work",
  relationships: "Relationships",
  communications: "Communications",
  infrastructure: "Infrastructure",
  publish: "Publish",
}

const groupOrder: readonly string[] = [
  "knowledge",
  "work",
  "relationships",
  "communications",
  "infrastructure",
  "publish",
]

const platformLabels: Record<string, string> = {
  linux: "Linux",
  windows: "Windows",
  macos: "macOS",
}

const coreSet = new Set<string>(coreModuleIds)

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

const formatDate = (date: Date) =>
  new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

const isPending = (status: DesktopBuildStatus) =>
  status === "queued" || status === "building"

// Returns true when `latest` is a strictly higher semver than `built`. Missing
// or malformed numeric parts are treated as 0, so "0.1" < "0.1.2".
const isNewerVersion = (latest: string, built: string): boolean => {
  const toParts = (value: string) =>
    value.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const a = toParts(latest)
  const b = toParts(built)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) {
      return left > right
    }
  }
  return false
}

export function DesktopInstallerSection() {
  const [currentBuild, setCurrentBuild] = useState<DesktopBuild | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appName, setAppName] = useState("Helm")
  const [theme, setTheme] = useState<DesktopTheme>("default")
  const [features, setFeatures] = useState<Set<string>>(new Set())
  const [enabledModuleIds, setEnabledModuleIds] = useState<string[] | null>(
    null
  )
  const [generating, setGenerating] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Selections are restored from the existing installer exactly once, so polling
  // and re-renders never clobber edits the user is making to the form.
  const hydratedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const response = await apiClient.desktopInstaller.list()
      const build = response.builds[0] ?? null
      setCurrentBuild(build)
      setLoaded(true)
      setError(null)
      if (!hydratedRef.current && build) {
        hydratedRef.current = true
        setAppName(build.appName)
        setTheme(build.theme)
        setFeatures(new Set(build.features))
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your installer."
      )
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    apiClient.desktopInstaller
      .latestVersion()
      .then((response) => {
        if (!cancelled) {
          setLatestVersion(response.version)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLatestVersion(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The features a build can include are the modules this workspace actually
  // has enabled (purchased + free defaults). Core modules are always baked in,
  // so they aren't offered as toggles.
  useEffect(() => {
    let cancelled = false
    apiClient.workspace
      .current()
      .then((workspace) => {
        if (!cancelled) {
          setEnabledModuleIds(workspace.enabledModules)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabledModuleIds([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Poll while the installer is still being produced.
  useEffect(() => {
    const anyPending = currentBuild ? isPending(currentBuild.status) : false
    if (!anyPending) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    if (pollRef.current) {
      return
    }
    pollRef.current = setInterval(() => {
      void load()
    }, 4000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [currentBuild, load])

  const toggleFeature = useCallback((id: string) => {
    setFeatures((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const build = await apiClient.desktopInstaller.create({
        appName: appName.trim() || "Helm",
        theme,
        features: [...features],
      })
      setCurrentBuild(build)
      toast.success(
        "Installer build started. Your download will appear here when ready."
      )
    } catch (createError) {
      toast.error(
        createError instanceof Error
          ? createError.message
          : "Could not start the build."
      )
    } finally {
      setGenerating(false)
    }
  }, [appName, theme, features])

  const groupedModules = useMemo(() => {
    if (!enabledModuleIds) {
      return null
    }
    const enabledSet = new Set(enabledModuleIds)
    const selectable = moduleDefinitions.filter(
      (definition) =>
        !coreSet.has(definition.id) && enabledSet.has(definition.id)
    )
    const groups = new Map<string, typeof selectable>()
    for (const definition of selectable) {
      const list = groups.get(definition.group) ?? []
      list.push(definition)
      groups.set(definition.group, list)
    }
    return groupOrder
      .filter((group) => groups.has(group))
      .map((group) => ({ group, modules: groups.get(group) ?? [] }))
  }, [enabledModuleIds])

  // Only prompt to update a finished installer whose recorded version is behind
  // the latest release — never mid-build.
  const updateAvailable =
    currentBuild?.status === "ready" &&
    currentBuild.appVersion != null &&
    latestVersion != null &&
    isNewerVersion(latestVersion, currentBuild.appVersion)

  return (
    <div className="space-y-10">
      <Header />

      <section className="space-y-6">
        <div className="space-y-2 sm:max-w-sm">
          <Label htmlFor="app-name">App name</Label>
          <Input
            id="app-name"
            maxLength={64}
            onChange={(event) => setAppName(event.target.value)}
            placeholder="Helm"
            value={appName}
          />
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-foreground text-sm">Theme</p>
            <p className="text-muted-foreground text-sm">
              Each preview shows the theme applied to your dashboard. Pick the
              look you want your app to ship with.
            </p>
          </div>
          <ThemePicker onChange={setTheme} value={theme} />
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-foreground text-sm">
              Included features
            </p>
            <p className="text-muted-foreground text-sm">
              Choose which of your modules to bundle, or leave everything
              unchecked to include all of them. Core features are always
              included.
            </p>
          </div>

          <FeaturePicker
            features={features}
            groupedModules={groupedModules}
            onToggle={toggleFeature}
          />
        </div>

        <Button
          aria-busy={generating}
          disabled={generating}
          onClick={() => void handleGenerate()}
        >
          {generating
            ? "Starting…"
            : currentBuild
              ? "Regenerate installer"
              : "Generate installer"}
        </Button>
        <p className="text-muted-foreground text-xs">
          You can keep one installer at a time. Generating a new one replaces
          the current download.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Your installer
        </h2>
        {updateAvailable && currentBuild?.appVersion && latestVersion ? (
          <Alert>
            <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>
                Update available — v{currentBuild.appVersion} → v{latestVersion}
              </span>
              <Button
                aria-busy={generating}
                className="ml-auto"
                disabled={generating}
                onClick={() => void handleGenerate()}
                size="sm"
              >
                {generating ? "Starting…" : "Update"}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <CurrentInstaller
          build={currentBuild}
          error={error}
          loaded={loaded}
          onRetry={() => void load()}
        />
      </section>
    </div>
  )
}

function ThemePicker({
  value,
  onChange,
}: {
  value: DesktopTheme
  onChange: (theme: DesktopTheme) => void
}) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {THEMES.map((option) => {
        const selected = option === value
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "space-y-1.5 rounded-lg border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary ring-2 ring-primary"
                : "border-border hover:border-foreground/30"
            )}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            <ThemePreview dark={dark} theme={option} />
            <div className="flex items-center justify-between px-0.5">
              <span className="font-medium text-foreground text-xs">
                {capitalize(option)}
              </span>
              {selected ? (
                <CheckIcon className="size-3.5 text-primary" />
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// A miniature, non-interactive mock of the dashboard home (sidebar + header +
// chat surface) rendered under the theme's `data-theme` scope so each card
// shows the actual colors the generated app ships with. The `dark` class
// mirrors the console's current mode so every preview (including "default",
// which has no [data-theme] override and falls through to :root) renders the
// same light/dark variant consistently.
function ThemePreview({ theme, dark }: { theme: DesktopTheme; dark: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none flex h-24 overflow-hidden rounded-md border border-border bg-background",
        dark && "dark"
      )}
      data-theme={theme}
    >
      <div className="flex w-1/4 flex-col gap-1.5 border-border border-r bg-sidebar p-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-primary" />
        <div className="h-1.5 w-full rounded-full bg-muted" />
        <div className="h-1.5 w-2/3 rounded-full bg-muted" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-border border-b px-2 py-1.5">
          <div className="h-1.5 w-10 rounded-full bg-foreground/70" />
          <div className="ml-auto size-2.5 rounded-full bg-accent" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <div className="h-2 w-3/4 self-start rounded-md bg-muted" />
          <div className="h-2 w-1/2 self-end rounded-md bg-primary" />
          <div className="mt-auto h-3 w-full rounded-md border border-border bg-card" />
        </div>
      </div>
    </div>
  )
}

function FeaturePicker({
  groupedModules,
  features,
  onToggle,
}: {
  groupedModules: ModuleGroup[] | null
  features: Set<string>
  onToggle: (id: string) => void
}) {
  if (!groupedModules) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-40" />
      </div>
    )
  }

  if (groupedModules.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You don't have any optional modules yet. Core features are included
        automatically.{" "}
        <Link className="text-foreground underline" href="/modules">
          Browse modules
        </Link>{" "}
        to add more to your builds.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {groupedModules.map(({ group, modules }) => (
        <div className="space-y-2" key={group}>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {groupLabels[group] ?? group}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {modules.map((definition) => {
              const checkboxId = `feature-${definition.id}`
              return (
                <div className="flex items-center gap-2.5" key={definition.id}>
                  <Checkbox
                    checked={features.has(definition.id)}
                    id={checkboxId}
                    onCheckedChange={() => onToggle(definition.id)}
                  />
                  <Label
                    className="cursor-pointer font-normal text-foreground text-sm"
                    htmlFor={checkboxId}
                  >
                    {definition.name}
                  </Label>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="font-semibold text-2xl tracking-tight">Desktop app</h1>
      <p className="max-w-2xl text-muted-foreground text-sm">
        Build a desktop installer customized with your theme and the features
        you want. Builds run in the background; installers for Linux, Windows,
        and macOS appear here when ready.
      </p>
    </div>
  )
}

function CurrentInstaller({
  build,
  error,
  loaded,
  onRetry,
}: {
  build: DesktopBuild | null
  error: string | null
  loaded: boolean
  onRetry: () => void
}) {
  if (error && !build) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={onRetry} variant="outline">
          Try again
        </Button>
      </div>
    )
  }

  if (!loaded) {
    return <Skeleton className="h-20 w-full" />
  }

  if (!build) {
    return (
      <p className="text-muted-foreground text-sm">
        No installer yet. Generate your first one above.
      </p>
    )
  }

  return (
    <div className="border-border border-y">
      <BuildRow build={build} />
    </div>
  )
}

function BuildRow({ build }: { build: DesktopBuild }) {
  return (
    <div className="space-y-3 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="font-medium text-foreground text-sm">{build.appName}</p>
        <Badge className="font-normal text-xs" variant="outline">
          {capitalize(build.theme)}
        </Badge>
        <StatusBadge status={build.status} />
        <span className="ml-auto text-muted-foreground text-xs tabular-nums">
          {formatDate(build.createdAt)}
        </span>
      </div>

      {build.features.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {build.features.length} feature
          {build.features.length === 1 ? "" : "s"} included
        </p>
      ) : null}

      {build.status === "failed" && build.error ? (
        <p className="text-destructive text-xs">{build.error}</p>
      ) : null}

      {build.artifacts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {build.artifacts.map((artifact) => (
            <Button
              asChild
              key={`${artifact.platform}-${artifact.filename}`}
              size="sm"
              variant="outline"
            >
              <a download href={artifact.downloadUrl}>
                <DownloadIcon className="size-3.5" />
                {platformLabels[artifact.platform] ?? artifact.platform}
                <span className="text-muted-foreground">
                  {artifact.filename}
                </span>
              </a>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }: { status: DesktopBuildStatus }) {
  if (status === "ready") {
    return (
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        <CheckIcon className="size-3.5" />
        Ready
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 text-destructive text-xs">
        <TriangleAlertIcon className="size-3.5" />
        Failed
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <LoaderCircleIcon className="size-3.5 animate-spin" />
      {status === "queued" ? "Queued" : "Building"}
    </span>
  )
}
