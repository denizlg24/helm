"use client"

import {
  ASSISTANT_MODELS,
  type AssistantModelId,
  type FileRef,
} from "@workspace/types"
import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import {
  ArrowUp,
  FileArchive,
  FileCode,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Square,
  X,
} from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ModelSelect } from "./model-select"

type AttachmentStatus = "uploading" | "ready" | "error"

interface AttachmentDraft {
  localId: string
  file: File
  status: AttachmentStatus
  previewUrl: string | null
  ref: FileRef | null
  error: string | null
}

export interface ComposerProps {
  onSend: (content: string, attachments: FileRef[]) => void
  onUploadFile: (file: File) => Promise<FileRef>
  onDeleteFile: (fileId: string) => Promise<void>
  onSelectFiles?: () => Promise<File[]>
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

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const extensionFor = (filename: string) => {
  const extension = filename.split(".").pop()
  return extension && extension !== filename
    ? extension.slice(0, 5).toUpperCase()
    : "FILE"
}

export function Composer({
  onSend,
  onUploadFile,
  onDeleteFile,
  onSelectFiles,
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
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [multiLine, setMultiLine] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const attachmentsRef = useRef<AttachmentDraft[]>([])
  const removedAttachmentIdsRef = useRef<Set<string>>(new Set())

  const modelLabel =
    ASSISTANT_MODELS.find((m) => m.id === model)?.label ?? model

  useLayoutEffect(() => {
    void value
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const nextHeight = Math.min(el.scrollHeight, 160)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden"
    setMultiLine(el.scrollHeight > 44)
  }, [value])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
    },
    []
  )

  const hasUnreadyAttachment = attachments.some(
    (attachment) => attachment.status !== "ready"
  )
  const readyAttachments = attachments
    .map((attachment) => attachment.ref)
    .filter((attachment): attachment is FileRef => attachment !== null)
  const canSend =
    !disabled &&
    !hasUnreadyAttachment &&
    (value.trim().length > 0 || readyAttachments.length > 0)

  const uploadFiles = (files: File[]) => {
    for (const file of files) {
      const localId = `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null
      setAttachments((current) => [
        ...current,
        {
          localId,
          file,
          status: "uploading",
          previewUrl,
          ref: null,
          error: null,
        },
      ])
      void onUploadFile(file)
        .then((ref) => {
          if (removedAttachmentIdsRef.current.delete(localId)) {
            void onDeleteFile(ref.id)
            return
          }
          setAttachments((current) =>
            current.map((attachment) =>
              attachment.localId === localId
                ? { ...attachment, status: "ready", ref }
                : attachment
            )
          )
        })
        .catch((error) => {
          removedAttachmentIdsRef.current.delete(localId)
          setAttachments((current) =>
            current.map((attachment) =>
              attachment.localId === localId
                ? {
                    ...attachment,
                    status: "error",
                    error:
                      error instanceof Error ? error.message : "Upload failed",
                  }
                : attachment
            )
          )
        })
    }
  }

  const removeAttachment = (localId: string) => {
    let fileId: string | null = null
    setAttachments((current) => {
      const removed = current.find(
        (attachment) => attachment.localId === localId
      )
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      if (removed?.ref) {
        fileId = removed.ref.id
      } else if (removed?.status === "uploading") {
        removedAttachmentIdsRef.current.add(localId)
      }
      return current.filter((attachment) => attachment.localId !== localId)
    })
    if (fileId) {
      void onDeleteFile(fileId)
    }
  }

  const openPicker = async () => {
    if (disabled) return
    if (onSelectFiles) {
      const files = await onSelectFiles()
      uploadFiles(files)
      return
    }
    inputRef.current?.click()
  }

  const submit = () => {
    const trimmed = value.trim()
    if (!canSend) return
    onSend(trimmed, readyAttachments)
    setValue("")
    for (const attachment of attachments) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
    setAttachments([])
  }

  return (
    <div
      className={cn(
        "flex h-max! flex-col gap-2 border border-border bg-background px-2 py-1.5 shadow-sm focus-within:border-foreground/20",
        multiLine || attachments.length > 0 ? "rounded-lg" : "rounded-full",
        disabled && "opacity-60"
      )}
    >
      {attachments.length > 0 ? (
        <div className="flex max-w-full flex-row items-center gap-1.5 overflow-x-auto">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.localId)}
            />
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "flex w-full gap-1.5",
          multiLine || attachments.length > 0 ? "items-end" : "items-center"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            uploadFiles(Array.from(event.target.files ?? []))
            event.currentTarget.value = ""
          }}
        />
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
                disabled={disabled}
                onClick={() => void openPicker()}
                aria-label="Attach files"
                className="size-8 shrink-0 rounded-full text-muted-foreground"
              >
                <Paperclip className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach files</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <textarea
            ref={textareaRef}
            // biome-ignore lint/a11y/noAutofocus: composer is the primary surface.
            autoFocus={autoFocus}
            rows={1}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length > 0) uploadFiles(files)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            className="max-h-40 min-h-9 w-full resize-none overflow-hidden bg-transparent py-1.5 text-foreground text-sm leading-6 outline-none placeholder:text-muted-foreground"
          />
        </div>

        <span
          className={cn(
            "hidden shrink-0 select-none text-muted-foreground text-xs tracking-wide sm:block",
            multiLine || attachments.length > 0 ? "mb-1.5" : "mb-0"
          )}
        >
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
            disabled={!canSend}
            aria-label="Send"
            className="size-8 shrink-0 rounded-full"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AttachmentDraft
  onRemove: () => void
}) {
  const isImage = attachment.file.type.startsWith("image/")
  const Icon = iconForFile(attachment.file)
  return (
    <div className="group relative flex max-w-56 items-center gap-2 rounded-md border border-border bg-muted/40 py-1 pr-7 pl-1 text-xs">
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-background text-muted-foreground">
        {isImage && attachment.previewUrl ? (
          <img
            src={attachment.previewUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <Icon className="size-4" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">{attachment.file.name}</div>
        <div
          className={cn(
            "truncate text-muted-foreground",
            attachment.status === "error" && "text-destructive"
          )}
        >
          {attachment.status === "uploading"
            ? "Uploading..."
            : attachment.status === "error"
              ? (attachment.error ?? "Upload failed")
              : isImage
                ? formatSize(attachment.file.size)
                : `${extensionFor(attachment.file.name)} · ${formatSize(attachment.file.size)}`}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.file.name}`}
        className="absolute top-1.5 right-1.5 rounded-full p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

function iconForFile(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon
  if (
    file.type.includes("zip") ||
    file.type.includes("tar") ||
    file.name.match(/\.(zip|tar|gz|rar|7z)$/iu)
  ) {
    return FileArchive
  }
  if (
    file.type.includes("json") ||
    file.type.includes("javascript") ||
    file.type.includes("typescript") ||
    file.name.match(/\.(js|jsx|ts|tsx|json|html|css|md)$/iu)
  ) {
    return FileCode
  }
  return FileText
}
