"use client"

import { moduleDefinitions } from "@workspace/module-registry"
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

const GROUP_LABELS: Record<string, string> = {
  communications: "Communications",
  core: "Core",
  infrastructure: "Infrastructure",
  knowledge: "Knowledge",
  publish: "Publish",
  relationships: "Relationships",
  work: "Work",
}

const MODULE_ICONS: Record<string, LucideIcon> = {
  "api-tokens": KeyRound,
  assistant: Bot,
  blog: NotebookPen,
  calendar: Calendar,
  comments: MessageCircle,
  "contact-form": UserSquare,
  "data-export": Download,
  home: HomeIcon,
  "imap-inbox": Inbox,
  journal: NotebookPen,
  kanban: Kanban,
  "llm-usage": Brain,
  notes: FileText,
  now: HomeIcon,
  people: UsersRound,
  pomodoro: AlarmClock,
  projects: FolderGit2,
  resources: Radio,
  settings: Settings,
  spreadsheets: Table,
  timetable: Calendar,
  timeline: FolderGit2,
  triage: Brain,
  whiteboard: PenTool,
}

const ROUTE_OVERRIDES: Record<string, string> = {
  assistant: "/",
  home: "/",
}

const EXTRA_KEYWORDS: Record<string, string[]> = {
  "api-tokens": ["token", "keys", "developer"],
  assistant: ["ai", "chat", "dashboard"],
  "data-export": ["download", "backup"],
  "imap-inbox": ["mail", "email"],
  "llm-usage": ["usage", "billing", "credits"],
  people: ["contacts", "crm", "relationships"],
  pomodoro: ["timer", "focus"],
  resources: ["infrastructure", "servers", "health"],
  triage: ["email", "review"],
  whiteboard: ["canvas", "drawing"],
}

export function CommandPalette() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
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
        return {
          disabled: !enabledModules.has(definition.id),
          group,
          href: ROUTE_OVERRIDES[definition.id] ?? definition.nav.href,
          icon: MODULE_ICONS[definition.id] ?? HomeIcon,
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
      onSelect={(entry) => {
        if (entry.href) router.push(entry.href)
      }}
    />
  )
}
