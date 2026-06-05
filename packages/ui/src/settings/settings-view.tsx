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
  const visibleGroups = groups.filter((group) =>
    isVisible(group.platform, platform)
  )

  return (
    <div className="mx-auto w-full max-w-2xl space-y-10">
      {visibleGroups.map((group) => {
        const groupFields = fields.filter(
          (field) =>
            field.group === group.id && isVisible(field.scope, platform)
        )

        if (groupFields.length === 0) {
          return null
        }

        return (
          <section key={group.id} className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-medium text-base">{group.label}</h2>
              {group.description ? (
                <p className="text-muted-foreground text-sm">
                  {group.description}
                </p>
              ) : null}
            </div>

            <div className="divide-y rounded-xl border bg-card">
              {groupFields.map((field) => (
                <div
                  key={field.key}
                  className={cn(
                    "flex flex-col gap-2 p-4",
                    "sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  )}
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
                      values={values}
                      onChange={onChange}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
