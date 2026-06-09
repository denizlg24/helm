"use client"

import type {
  PomodoroSettings,
  UpdatePomodoroSettingsInput,
} from "@workspace/types"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { NumberStepper } from "@workspace/ui/components/number-stepper"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useEffect, useState } from "react"

interface PomodoroSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: PomodoroSettings
  onSave: (input: UpdatePomodoroSettingsInput) => Promise<void>
}

interface DurationRowProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit: string
}

function DurationRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: DurationRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm">{label}</span>
      <NumberStepper
        label={label}
        max={max}
        min={min}
        onChange={onChange}
        step={step}
        unit={unit}
        value={value}
      />
    </div>
  )
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function PomodoroSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
}: PomodoroSettingsDialogProps) {
  const [draft, setDraft] = useState<PomodoroSettings>(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  const patch = (changes: Partial<PomodoroSettings>) =>
    setDraft((current) => ({ ...current, ...changes }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(draft)
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save Pomodoro settings:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Timer settings</DialogTitle>
          <DialogDescription>
            Adjust focus and break durations. Changes apply to the next
            countdown.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="durations">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="durations">Durations</TabsTrigger>
            <TabsTrigger value="behavior">Behavior</TabsTrigger>
          </TabsList>
          <TabsContent className="divide-y divide-border" value="durations">
            <DurationRow
              label="Focus session"
              max={180}
              min={1}
              onChange={(value) => patch({ focusMinutes: value })}
              step={5}
              unit="min"
              value={draft.focusMinutes}
            />
            <DurationRow
              label="Short break"
              max={60}
              min={1}
              onChange={(value) => patch({ shortBreakMinutes: value })}
              unit="min"
              value={draft.shortBreakMinutes}
            />
            <DurationRow
              label="Long break"
              max={120}
              min={1}
              onChange={(value) => patch({ longBreakMinutes: value })}
              step={5}
              unit="min"
              value={draft.longBreakMinutes}
            />
            <DurationRow
              label="Long break after"
              max={12}
              min={1}
              onChange={(value) => patch({ longBreakEvery: value })}
              unit="sess."
              value={draft.longBreakEvery}
            />
            <DurationRow
              label="Daily goal"
              max={24}
              min={1}
              onChange={(value) => patch({ dailyGoalSessions: value })}
              unit="sess."
              value={draft.dailyGoalSessions}
            />
          </TabsContent>
          <TabsContent className="divide-y divide-border" value="behavior">
            <ToggleRow
              checked={draft.autoStartBreaks}
              description="Start the break automatically when a focus session ends."
              label="Auto-start breaks"
              onCheckedChange={(checked) => patch({ autoStartBreaks: checked })}
            />
            <ToggleRow
              checked={draft.autoStartFocus}
              description="Start the next focus session as soon as a break ends."
              label="Auto-start focus"
              onCheckedChange={(checked) => patch({ autoStartFocus: checked })}
            />
            <ToggleRow
              checked={draft.soundEnabled}
              description="Play a short chime when a phase ends."
              label="Sound"
              onCheckedChange={(checked) => patch({ soundEnabled: checked })}
            />
            <ToggleRow
              checked={draft.notificationsEnabled}
              description="Show a notification when a phase ends."
              label="Notifications"
              onCheckedChange={(checked) =>
                patch({ notificationsEnabled: checked })
              }
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button disabled={saving} onClick={handleSave} type="button">
            {saving ? <Spinner className="size-4" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
