"use client"

import {
  EXTRA_KEYWORDS,
  GROUP_LABELS,
  MODULE_ICONS,
  moduleDefinitions,
  ROUTE_OVERRIDES,
} from "@workspace/module-registry"
import type { CommandPaletteEntry } from "@workspace/ui/components/command-palette-overlay"
import { CommandPaletteOverlay } from "@workspace/ui/components/command-palette-overlay"
import type { LucideIcon } from "lucide-react"
import {
  AlarmClock,
  Bot,
  Brain,
  Calendar,
  Download,
  FileText,
  FolderGit2,
  HomeIcon,
  Inbox,
  Kanban,
  KeyRound,
  MessageCircle,
  NotebookPen,
  PenTool,
  Radio,
  Settings,
  Table,
  UserSquare,
  UsersRound,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { apiClient } from "../lib/api"
import { authClient } from "../lib/auth-client"
import { useSettings } from "./settings/settings-provider"

const ICON_MAP: Record<string, LucideIcon> = {
  AlarmClock,
  Bot,
  Brain,
  Calendar,
  Download,
  FileText,
  FolderGit2,
  HomeIcon,
  Inbox,
  Kanban,
  KeyRound,
  MessageCircle,
  NotebookPen,
  PenTool,
  Radio,
  Settings,
  Table,
  UserSquare,
  UsersRound,
}

export function CommandPalette() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const { settings } = useSettings()
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!session) {
      setEnabledModules(new Set())
      return
    }

    let cancelled = false
    apiClient.user
      .current()
      .then((response) => {
        if (cancelled) return
        setEnabledModules(new Set(response.authContext.enabledModules))
      })
      .catch(() => {
        if (!cancelled) setEnabledModules(new Set())
      })

    return () => {
      cancelled = true
    }
  }, [session])

  const entries = useMemo<CommandPaletteEntry[]>(
    () =>
      moduleDefinitions.map((definition) => {
        const group = GROUP_LABELS[definition.group] ?? definition.group
        const iconName = MODULE_ICONS[definition.id]
        const icon = iconName ? (ICON_MAP[iconName] ?? HomeIcon) : HomeIcon
        return {
          disabled: !enabledModules.has(definition.id),
          group,
          href: ROUTE_OVERRIDES[definition.id] ?? definition.nav.href,
          icon,
          id: definition.id,
          keywords: [
            definition.name,
            definition.id,
            definition.group,
            ...definition.requiredScopes,
            ...(EXTRA_KEYWORDS[definition.id] ?? []),
          ],
          label: definition.nav.label,
        }
      }),
    [enabledModules]
  )

  return (
    <CommandPaletteOverlay
      entries={entries}
      shortcut={settings.shortcuts.commandPalette}
      onSelect={(entry) => {
        if (entry.href) router.push(entry.href)
      }}
    />
  )
}
