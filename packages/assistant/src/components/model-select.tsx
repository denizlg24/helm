"use client"

import { ASSISTANT_MODELS, type AssistantModelId } from "@workspace/types"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { Switch } from "@workspace/ui/components/switch"
import { Globe, SlidersHorizontal, Wrench } from "lucide-react"
import { useState } from "react"

export interface ModelSelectProps {
  model: AssistantModelId
  onModelChange: (model: AssistantModelId) => void
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  tools: boolean
  onToolsChange: (enabled: boolean) => void
  disabled?: boolean
}

const currentModels = ASSISTANT_MODELS.filter((m) => !m.legacy)
const legacyModels = ASSISTANT_MODELS.filter((m) => m.legacy)

export function ModelSelect({
  model,
  onModelChange,
  webSearch,
  onWebSearchChange,
  tools,
  onToolsChange,
  disabled,
}: ModelSelectProps) {
  const [showLegacy, setShowLegacy] = useState(
    legacyModels.some((m) => m.id === model)
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Model and tools"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              Model
            </Label>
            <Select
              value={model}
              onValueChange={(value) =>
                onModelChange(value as AssistantModelId)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectLabel>Latest</SelectLabel>
                  {currentModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {showLegacy && legacyModels.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Legacy</SelectLabel>
                    {legacyModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            {legacyModels.length > 0 ? (
              <div className="flex items-center justify-between pt-0.5">
                <Label
                  htmlFor="legacy-models"
                  className="text-muted-foreground text-xs"
                >
                  Show legacy models
                </Label>
                <Switch
                  id="legacy-models"
                  checked={showLegacy}
                  onCheckedChange={setShowLegacy}
                />
              </div>
            ) : null}
          </div>

          <Separator />

          <ToggleRow
            icon={<Globe className="size-4" />}
            label="Web search"
            description="Let the assistant search the web."
            checked={webSearch}
            onChange={onWebSearchChange}
          />
          <ToggleRow
            icon={<Wrench className="size-4" />}
            label="Tools"
            description="Allow calling dashboard tools."
            checked={tools}
            onChange={onToolsChange}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex flex-1 flex-col">
        <span className="font-medium text-foreground text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
