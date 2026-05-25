"use client"

import type { AssistantMessage } from "@workspace/types"
import { MarkdownRenderer } from "@workspace/ui/components/markdown-renderer"
import { cn } from "@workspace/ui/lib/utils"
import { Code, Eye } from "lucide-react"
import { useState } from "react"
import type {
  PendingApproval,
  TokenUsage,
  ToolResult,
} from "../hooks/use-assistant-chat"
import { ToolCallCard } from "./tool-call-card"

export interface MessageItemProps {
  message: AssistantMessage
  toolResults: Record<string, ToolResult>
  usage?: TokenUsage
  pendingApproval: PendingApproval | null
  busy: boolean
  isLast: boolean
  onApprove: () => void
  onDeny: () => void
}

export function MessageItem({
  message,
  toolResults,
  usage,
  pendingApproval,
  busy,
  isLast,
  onApprove,
  onDeny,
}: MessageItemProps) {
  const [showRaw, setShowRaw] = useState(false)

  if (message.role === "user") {
    const text = message.blocks
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
    return (
      <div className="flex animate-in justify-end fade-in slide-in-from-bottom-1 duration-300">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted/60 px-4 py-2.5 text-foreground/90 text-sm">
          {text}
        </div>
      </div>
    )
  }

  const textContent = message.blocks
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
  const hasVisibleContent = message.blocks.length > 0
  const isStreaming = message.status === "streaming"
  const renderedBlocks = message.blocks.reduce<
    Array<
      | { type: "text"; text: string; key: string }
      | {
          type: "tool_use"
          block: Extract<
            AssistantMessage["blocks"][number],
            { type: "tool_use" }
          >
        }
    >
  >((items, block) => {
    if (block.type === "text") {
      const previous = items.at(-1)
      if (previous?.type === "text") {
        previous.text += block.text
      } else {
        items.push({
          type: "text",
          text: block.text,
          key: `text-${items.length}`,
        })
      }
      return items
    }
    if (block.type === "tool_use") {
      items.push({ type: "tool_use", block })
    }
    return items
  }, [])

  return (
    <div className="group flex animate-in flex-col gap-1 fade-in duration-300">
      {showRaw ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-foreground/80 text-sm">
          {textContent}
        </pre>
      ) : (
        renderedBlocks.map((item) => {
          if (item.type === "text") {
            return <MarkdownRenderer key={item.key} content={item.text} />
          }
          if (item.type === "tool_use") {
            const { block } = item
            const isPending = pendingApproval?.toolUseId === block.id
            return (
              <ToolCallCard
                key={block.id}
                name={block.name}
                input={block.input}
                result={toolResults[block.id]}
                awaitingApproval={isPending}
                busy={busy}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            )
          }
          return null
        })
      )}

      {isStreaming && !hasVisibleContent ? (
        <ThinkingDots />
      ) : isStreaming && isLast ? (
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground/60 align-text-bottom" />
      ) : null}

      {!isStreaming && textContent ? (
        <div className="mt-1 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            aria-label={showRaw ? "Show rendered" : "Show raw markdown"}
            className="text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
          >
            {showRaw ? (
              <Eye className="size-3.5" />
            ) : (
              <Code className="size-3.5" />
            )}
          </button>
          {usage ? (
            <span className="text-[11px] text-muted-foreground/50 tabular-nums">
              {(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens
              {" · "}${(usage.costUsdCents / 100).toFixed(4)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}
