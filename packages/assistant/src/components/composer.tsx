"use client"

import { ASSISTANT_MODELS, type AssistantModelId } from "@workspace/types"
import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { ArrowUp, Paperclip, Square } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { ModelSelect } from "./model-select"

export interface ComposerProps {
  onSend: (content: string) => void
  onStop?: () => void
  isStreaming: boolean
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  model: AssistantModelId
  onModelChange: (model: AssistantModelId) => void
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  tools: boolean
  onToolsChange: (enabled: boolean) => void
}

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = "Ask anything...",
  autoFocus,
  model,
  onModelChange,
  webSearch,
  onWebSearchChange,
  tools,
  onToolsChange,
}: ComposerProps) {
  const [value, setValue] = useState("")
  const [multiLine, setMultiLine] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const modelLabel =
    ASSISTANT_MODELS.find((m) => m.id === model)?.label ?? model

  useLayoutEffect(() => {
    void value
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    setMultiLine(el.scrollHeight > 44)
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (trimmed.length === 0 || disabled) return
    onSend(trimmed)
    setValue("")
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border border-border bg-background px-2 py-1.5 shadow-sm focus-within:border-foreground/20",
        multiLine ? "items-end rounded-lg" : "rounded-full",
        disabled && "opacity-60"
      )}
    >
      <ModelSelect
        model={model}
        onModelChange={onModelChange}
        webSearch={webSearch}
        onWebSearchChange={onWebSearchChange}
        tools={tools}
        onToolsChange={onToolsChange}
        disabled={disabled}
      />

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled
              aria-label="Attach files"
              className="size-8 shrink-0 rounded-full text-muted-foreground"
            >
              <Paperclip className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Attachments coming soon</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <textarea
        ref={textareaRef}
        // biome-ignore lint/a11y/noAutofocus: composer is the primary surface.
        autoFocus={autoFocus}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        className="scrollbar-none max-h-50 flex-1 resize-none self-center bg-transparent py-1.5 text-foreground text-sm leading-6 outline-none placeholder:text-muted-foreground"
      />

      <span className="hidden shrink-0 select-none text-muted-foreground text-xs tracking-wide sm:block">
        {modelLabel}
      </span>

      {isStreaming ? (
        <Button
          type="button"
          size="icon"
          onClick={onStop}
          aria-label="Stop"
          className="size-8 shrink-0 rounded-full"
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={value.trim().length === 0 || disabled}
          aria-label="Send"
          className="size-8 shrink-0 rounded-full"
        >
          <ArrowUp className="size-4" />
        </Button>
      )}
    </div>
  )
}
