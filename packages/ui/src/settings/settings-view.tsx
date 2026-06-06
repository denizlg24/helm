"use client"

import {
  AppearanceModeSchema,
  type SettingsFieldDescriptor,
  type SettingsGroupDescriptor,
  type UserSettings,
} from "@workspace/types"
import { cn } from "@workspace/ui/lib/utils"
import { ShortcutRecorder } from "@workspace/ui/settings/controls/shortcut-recorder"
import { ThemeModeControl } from "@workspace/ui/settings/controls/theme-mode-control"
import {
  Bell,
  KeyRound,
  type LucideIcon,
  Palette,
  Settings2,
  SlidersHorizontal,
} from "lucide-react"
import { useState } from "react"

export type SettingsPlatform = "web" | "desktop"

export interface SettingsViewProps {
  groups: readonly SettingsGroupDescriptor[]
  fields: readonly SettingsFieldDescriptor[]
  values: UserSettings
  platform: SettingsPlatform
  // Emits the changed field's dot path (e.g. "appearance.mode") and its new
  // value. The host owns persistence and applying side effects.
  onChange: (key: string, value: unknown) => void
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  SlidersHorizontal,
  Palette,
  KeyRound,
  Bell,
  Settings2,
}

function resolveGroupIcon(name: string | undefined): LucideIcon {
  return (name && GROUP_ICONS[name]) || Settings2
}

function isVisible(scope: string, platform: SettingsPlatform): boolean {
  return scope === "both" || scope === platform
}

function getValueAtPath(values: UserSettings, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, values)
}

function FieldControl({
  field,
  values,
  onChange,
}: {
  field: SettingsFieldDescriptor
  values: UserSettings
  onChange: (key: string, value: unknown) => void
}) {
  const raw = getValueAtPath(values, field.key)

  switch (field.control) {
    case "theme-mode":
      return (
        <ThemeModeControl
          value={AppearanceModeSchema.catch("system").parse(raw)}
          onChange={(value) => onChange(field.key, value)}
        />
      )
    case "shortcut":
      return (
        <ShortcutRecorder
          value={typeof raw === "string" ? raw : ""}
          onChange={(value) => onChange(field.key, value)}
        />
      )
    default:
      return null
  }
}

export function SettingsView({
  groups,
  fields,
  values,
  platform,
  onChange,
}: SettingsViewProps) {
  const sections = groups
    .filter((group) => isVisible(group.platform, platform))
    .map((group) => ({
      group,
      fields: fields.filter(
        (field) => field.group === group.id && isVisible(field.scope, platform)
      ),
    }))
    .filter((section) => section.fields.length > 0)

  const [activeId, setActiveId] = useState(sections[0]?.group.id)
  // Fall back to the first section when the stored id no longer resolves
  // (e.g. a platform switch hides the previously active group).
  const active =
    sections.find((section) => section.group.id === activeId) ?? sections[0]

  if (!active) {
    return null
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 md:flex-row md:gap-10">
      <nav className="md:w-56 md:shrink-0">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
          {sections.map(({ group }) => {
            const Icon = resolveGroupIcon(group.icon)
            const selected = group.id === active.group.id
            return (
              <li className="shrink-0" key={group.id}>
                <button
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                  onClick={() => setActiveId(group.id)}
                  type="button"
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{group.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <section className="min-w-0 flex-1 space-y-6">
        <div className="space-y-1">
          <h2 className="font-medium text-lg">{active.group.label}</h2>
          {active.group.description ? (
            <p className="text-muted-foreground text-sm">
              {active.group.description}
            </p>
          ) : null}
        </div>

        <div className="divide-y rounded-xl border bg-card">
          {active.fields.map((field) => (
            <div
              className={cn(
                "flex flex-col gap-2 p-4",
                "sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              )}
              key={field.key}
            >
              <div className="space-y-0.5">
                <p className="font-medium text-sm">{field.label}</p>
                {field.description ? (
                  <p className="text-muted-foreground text-sm">
                    {field.description}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0">
                <FieldControl
                  field={field}
                  onChange={onChange}
                  values={values}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
