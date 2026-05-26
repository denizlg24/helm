"use client"

import { cn } from "@workspace/ui/lib/utils"
import { AlertCircle } from "lucide-react"
import { useEffect, useState } from "react"
import type { UseAssistantChat } from "../hooks/use-assistant-chat"
import { AssistantClock } from "./assistant-clock"
import { Composer } from "./composer"
import { MessageList } from "./message-list"

const DEFAULT_SUGGESTIONS = [
  "What's on my timetable today?",
  "Summarize my recent notes",
  "What events do I have this week?",
  "Show me my kanban boards",
  "List my pending contacts",
  "Check my latest emails",
  "How are my resources doing?",
] as const

// Cross-fades through a list of prompt ideas under the clock on the empty state,
// mirroring the rotating hint in the reference dashboard.
function RotatingSuggestion({
  suggestions,
}: {
  suggestions: readonly string[]
}) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (suggestions.length <= 1) return
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((i) => (i + 1) % suggestions.length)
        setVisible(true)
      }, 300)
    }, 4000)
    return () => clearInterval(id)
  }, [suggestions.length])

  return (
    <p
      className={cn(
        "h-5 text-center text-muted-foreground/40 text-sm italic transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      {suggestions[index]}
    </p>
  )
}

export interface ChatViewProps {
  chat: UseAssistantChat
  onSelectFiles?: () => Promise<File[]>
  /** A single static hint. Prefer `suggestions` for the rotating treatment. */
  suggestion?: string
  /** Prompt ideas cross-faded under the clock; falls back to a built-in set. */
  suggestions?: readonly string[]
  className?: string
}

export function ChatView({
  chat,
  onSelectFiles,
  suggestion,
  suggestions,
  className,
}: ChatViewProps) {
  const isEmpty = chat.messages.length === 0
  const composerDisabled = chat.status === "awaiting_approval"

  const composer = (
    <Composer
      onSend={chat.send}
      onUploadFile={chat.uploadAttachment}
      onDeleteFile={chat.deleteAttachment}
      onSelectFiles={onSelectFiles}
      onStop={chat.stop}
      isStreaming={chat.isBusy}
      disabled={composerDisabled}
      autoFocus
      model={chat.model}
      onModelChange={chat.setModel}
      webSearch={chat.webSearch}
      onWebSearchChange={chat.setWebSearch}
      tools={chat.tools}
      onToolsChange={chat.setTools}
    />
  )

  const errorBanner = chat.error ? (
    <div className="mx-auto flex w-full max-w-3xl items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{chat.error}</span>
    </div>
  ) : null

  if (isEmpty) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center px-4",
          className
        )}
      >
        <div className="w-full max-w-2xl">
          <AssistantClock />
          <div className="mt-6">
            <RotatingSuggestion
              suggestions={
                suggestions ?? (suggestion ? [suggestion] : DEFAULT_SUGGESTIONS)
              }
            />
          </div>
          <div className="mt-5">{composer}</div>
          {errorBanner ? <div className="mt-3">{errorBanner}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageList
          messages={chat.messages}
          toolResults={chat.toolResults}
          usageByMessageId={chat.usageByMessageId}
          pendingApproval={chat.pendingApproval}
          busy={chat.isBusy}
          onApprove={() => void chat.resolveApproval("approve")}
          onDeny={() => void chat.resolveApproval("deny")}
        />
      </div>
      <div className="bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          {errorBanner ? <div className="mb-2">{errorBanner}</div> : null}
          {composer}
        </div>
      </div>
    </div>
  )
}
