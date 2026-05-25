"use client"

import { cn } from "@workspace/ui/lib/utils"
import {
  Check,
  ChevronRight,
  Globe2,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react"
import { useState } from "react"
import type { ToolResult } from "../hooks/use-assistant-chat"

export interface ToolCallCardProps {
  name: string
  input: Record<string, unknown>
  result?: ToolResult
  awaitingApproval: boolean
  busy: boolean
  onApprove?: () => void
  onDeny?: () => void
}

const humanizeName = (name: string): string =>
  name === "web_search"
    ? "Web Search"
    : name.replace(/[_.]/g, " ").replace(/\b\w/gu, (c) => c.toUpperCase())

const tryFormatJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export function ToolCallCard({
  name,
  input,
  result,
  awaitingApproval,
  busy,
  onApprove,
  onDeny,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const serverSideToolComplete =
    name === "web_search" && !busy && !awaitingApproval
  const hasResult = result !== undefined || serverSideToolComplete
  const isError = result?.isError ?? false
  const canExpand = result !== undefined || Object.keys(input).length > 0

  return (
    <div className="my-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs transition-colors">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => canExpand && setExpanded((v) => !v)}
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-muted-foreground/70 transition-colors hover:text-foreground",
            !canExpand && "cursor-default"
          )}
        >
          <StatusIcon
            awaitingApproval={awaitingApproval}
            busy={busy}
            hasResult={hasResult}
            isError={isError}
          />
          {name === "web_search" ? (
            <Globe2 className="size-3 shrink-0 text-muted-foreground/70" />
          ) : null}
          <span className="truncate">{humanizeName(name)}</span>
          {canExpand ? (
            <ChevronRight
              className={cn(
                "size-3 shrink-0 transition-transform",
                expanded && "rotate-90"
              )}
            />
          ) : null}
        </button>

        {awaitingApproval ? (
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              aria-label="Approve"
              className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onDeny}
              disabled={busy}
              aria-label="Deny"
              className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-1.5 flex flex-col gap-1.5 border-border/60 border-t pt-1.5">
          {Object.keys(input).length > 0 ? (
            <pre className="wrap-break-word max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] text-muted-foreground/80">
              {JSON.stringify(input, null, 2)}
            </pre>
          ) : null}
          {result !== undefined ? (
            <pre
              className={cn(
                "wrap-break-word max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px]",
                isError ? "text-destructive" : "text-muted-foreground/80"
              )}
            >
              {tryFormatJson(result?.content ?? "")}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function StatusIcon({
  awaitingApproval,
  busy,
  hasResult,
  isError,
}: {
  awaitingApproval: boolean
  busy: boolean
  hasResult: boolean
  isError: boolean
}) {
  if (awaitingApproval) {
    return <TriangleAlert className="size-3 shrink-0 text-amber-500" />
  }
  if (hasResult) {
    return isError ? (
      <X className="size-3 shrink-0 text-destructive" />
    ) : (
      <Check className="size-3 shrink-0 text-foreground" />
    )
  }
  if (busy) {
    return <Loader2 className="size-3 shrink-0 animate-spin" />
  }
  return (
    <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground/40" />
  )
}
