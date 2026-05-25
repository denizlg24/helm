"use client"

import type { AssistantMessage } from "@workspace/types"
import { useEffect, useRef } from "react"
import type {
  PendingApproval,
  TokenUsage,
  ToolResult,
} from "../hooks/use-assistant-chat"
import { MessageItem } from "./message-item"

export interface MessageListProps {
  messages: AssistantMessage[]
  toolResults: Record<string, ToolResult>
  usageByMessageId: Record<string, TokenUsage>
  pendingApproval: PendingApproval | null
  busy: boolean
  onApprove: () => void
  onDeny: () => void
}

export function MessageList({
  messages,
  toolResults,
  usageByMessageId,
  pendingApproval,
  busy,
  onApprove,
  onDeny,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  // Track the rendered text length so we re-scroll as tokens stream in.
  const signature = messages
    .map(
      (m) =>
        `${m.id}:${m.blocks.map((b) => (b.type === "text" ? (b.text?.length ?? 0) : 0)).join(",")}`
    )
    .join("|")

  useEffect(() => {
    void signature
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [signature])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          toolResults={toolResults}
          usage={usageByMessageId[message.id] ?? message.usage ?? undefined}
          pendingApproval={pendingApproval}
          busy={busy}
          isLast={index === messages.length - 1}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
