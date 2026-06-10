"use client"

import type { Note } from "@workspace/types"
import {
  ChevronDownCircle,
  ChevronUpCircle,
  ClipboardX,
  Download,
  Edit2,
  Eye,
  Loader2,
  Save,
} from "lucide-react"
import type React from "react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  usePublishSurfaceContext,
  useRegisterClientTool,
} from "../../assistant/bridge"
import { Button } from "../../components/button"
import { MarkdownRenderer } from "../../components/markdown-renderer"
import { Textarea } from "../../components/textarea"
import { useTextareaEditor } from "../hooks/use-textarea-editor"
import { FindReplaceBar, type MatchResult } from "./find-replace-bar"

interface NoteEditorProps {
  note: Note
  onSaveContent: (content: string) => Promise<void>
  onContentChange?: (content: string) => void
  saveLabel?: string
  saveDisabled?: boolean
  startInEditMode?: boolean
  autoFocusEditor?: boolean
}

const EDITOR_SHORTCUT_KEYS = new Set(["b", "d", "f", "h", "i", "k", "s"])

export function NoteEditor({
  note,
  onSaveContent,
  onContentChange,
  saveLabel = "Save",
  saveDisabled,
  startInEditMode = false,
  autoFocusEditor = false,
}: NoteEditorProps) {
  const [togglePreview, setTogglePreview] = useState(!startInEditMode)
  const [initialContent, setInitialContent] = useState(note.content || "")
  const [content, setContent] = useState(initialContent)
  const [loading, setLoading] = useState(false)
  const [toolbarOpen, setToolbarOpen] = useState(true)

  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [findReplaceShowReplace, setFindReplaceShowReplace] = useState(false)
  const [findInitialQuery, setFindInitialQuery] = useState("")
  const [findMatches, setFindMatches] = useState<MatchResult[]>([])
  const [findCurrentIndex, setFindCurrentIndex] = useState(0)

  const previousNoteIdRef = useRef(note.id)
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const {
    onKeyDown: editorOnKeyDown,
    multiSelections,
    clearMultiSelections,
  } = useTextareaEditor(contentTextareaRef, content, setContent)

  useEffect(() => {
    const nextContent = note.content || ""
    if (previousNoteIdRef.current !== note.id) {
      previousNoteIdRef.current = note.id
      setInitialContent(nextContent)
      setContent(nextContent)
      return
    }
    if (content === initialContent) {
      setInitialContent(nextContent)
      setContent(nextContent)
    }
  }, [content, initialContent, note.content, note.id])

  useEffect(() => {
    setTogglePreview(!startInEditMode)
  }, [startInEditMode])

  const setEditorContent = useCallback(
    (nextContent: string) => {
      setContent(nextContent)
      onContentChange?.(nextContent)
    },
    [onContentChange]
  )

  // Expose the open note to the assistant, and let it rewrite the live buffer.
  usePublishSurfaceContext({
    module: "notes",
    route: "/notes",
    entityType: "note",
    entityId: note.id,
    payload: { title: note.title, content },
  })
  useRegisterClientTool("notes_rewrite_open", (input) => {
    if (typeof input.content !== "string") {
      return {
        result: "Invalid payload: content must be a string",
        isError: true,
      }
    }
    setEditorContent(input.content)
    setTogglePreview(false)
    return { result: "Replaced the open note's content in the editor." }
  })

  const openFind = useCallback((withReplace: boolean) => {
    const textarea = contentTextareaRef.current
    let initial = ""
    if (textarea) {
      const sel = textarea.value.slice(
        textarea.selectionStart,
        textarea.selectionEnd
      )
      if (sel && !sel.includes("\n")) initial = sel
    }
    setFindInitialQuery(initial)
    setFindReplaceShowReplace(withReplace)
    setFindReplaceOpen(true)
  }, [])

  const handleMatchesChange = useCallback(
    (matches: MatchResult[], currentIndex: number) => {
      setFindMatches(matches)
      setFindCurrentIndex(currentIndex)
    },
    []
  )

  const showOverlay =
    (findReplaceOpen && findMatches.length > 0) || multiSelections.length > 0

  useLayoutEffect(() => {
    if (showOverlay && overlayRef.current && contentTextareaRef.current) {
      overlayRef.current.scrollTop = contentTextareaRef.current.scrollTop
    }
  }, [showOverlay])

  useEffect(() => {
    if (!showOverlay || multiSelections.length === 0) return
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.classList.remove("cursors-hidden")
    const interval = setInterval(() => {
      overlay.classList.toggle("cursors-hidden")
    }, 530)
    return () => {
      clearInterval(interval)
      overlay.classList.remove("cursors-hidden")
    }
  }, [showOverlay, multiSelections])

  useEffect(() => {
    const editorElement = editorRef.current
    if (!editorElement) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const shortcutKey = e.key.toLowerCase()
      if (
        (shortcutKey === "f" || shortcutKey === "h") &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        !togglePreview
      ) {
        e.preventDefault()
        e.stopPropagation()
        openFind(shortcutKey === "h")
      }
    }
    editorElement.addEventListener("keydown", handleKeyDown, true)
    return () =>
      editorElement.removeEventListener("keydown", handleKeyDown, true)
  }, [openFind, togglePreview])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        (e.key === "f" || e.key === "h") &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey
      ) {
        e.preventDefault()
        openFind(e.key === "h")
        return
      }
      editorOnKeyDown(e)
    },
    [editorOnKeyDown, openFind]
  )

  const handleSave = useCallback(async () => {
    try {
      setLoading(true)
      await onSaveContent(content)
      setInitialContent(content)
      setTogglePreview(true)
    } finally {
      setLoading(false)
    }
  }, [content, onSaveContent])

  const onKeyDownCapture = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return

      const shortcutKey = e.key.toLowerCase()
      if (!EDITOR_SHORTCUT_KEYS.has(shortcutKey)) return

      if (shortcutKey === "k" && !e.shiftKey) return
      if (shortcutKey !== "k" && e.shiftKey) return
      if (togglePreview && shortcutKey !== "s") return

      const target = e.target
      const isEditorTextarea =
        target instanceof HTMLTextAreaElement &&
        target === contentTextareaRef.current
      if (
        (shortcutKey === "b" ||
          shortcutKey === "d" ||
          shortcutKey === "i" ||
          shortcutKey === "k") &&
        !isEditorTextarea
      ) {
        return
      }

      e.preventDefault()

      if (shortcutKey === "f" || shortcutKey === "h") {
        if (!togglePreview) {
          e.stopPropagation()
          openFind(shortcutKey === "h")
        }
        return
      }

      if (shortcutKey === "s") {
        e.stopPropagation()
        if (content !== initialContent && !loading && !saveDisabled) {
          void handleSave()
        }
      }
    },
    [
      content,
      handleSave,
      initialContent,
      loading,
      openFind,
      saveDisabled,
      togglePreview,
    ]
  )

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${note.title.trim() || "note"}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const dirty = content !== initialContent

  return (
    <div
      ref={editorRef}
      className="relative flex min-h-0 w-full flex-1 flex-col"
      onKeyDownCapture={onKeyDownCapture}
    >
      <div
        className={`fixed bottom-4 left-1/2 z-90 flex -translate-x-1/2 flex-row items-center rounded-full transition-[background-color,border-color,box-shadow] duration-300 ease-out ${
          toolbarOpen
            ? "border bg-popover px-2 py-1 shadow"
            : "border-transparent bg-transparent! p-0 shadow-none"
        }`}
      >
        <div
          className={`flex flex-row items-center gap-1 overflow-hidden transition-[max-width,opacity,margin] duration-300 ease-out ${
            toolbarOpen
              ? "mr-1 max-w-150 opacity-100"
              : "mr-0 max-w-0 opacity-0"
          }`}
        >
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setTogglePreview((prev) => !prev)}
            title={togglePreview ? "Edit" : "Preview"}
          >
            {togglePreview ? <Edit2 /> : <Eye />}
          </Button>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleDownload}
            disabled={dirty || loading}
            title="Download markdown"
          >
            <Download />
          </Button>

          <Button
            onClick={handleSave}
            size="icon-sm"
            disabled={(saveDisabled ?? !dirty) || loading}
            title={saveLabel}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Save />}
            <span className="sr-only">{saveLabel}</span>
          </Button>

          <Button
            onClick={() => setEditorContent(initialContent)}
            disabled={!dirty || loading}
            variant="secondary"
            size="icon-sm"
            title="Discard changes"
          >
            <ClipboardX />
          </Button>
        </div>

        <Button
          variant="outline"
          size="icon-sm"
          className="rounded-full"
          onClick={() => setToolbarOpen((prev) => !prev)}
          title={toolbarOpen ? "Hide toolbar" : "Show toolbar"}
        >
          {toolbarOpen ? <ChevronDownCircle /> : <ChevronUpCircle />}
        </Button>
      </div>

      {!togglePreview && (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {showOverlay && (
            <div
              ref={overlayRef}
              className="editor-overlay pointer-events-none absolute inset-0 z-2 overflow-y-auto"
              aria-hidden="true"
            >
              <div
                className={`wrap-break-word whitespace-pre-wrap px-3 pt-2 font-mono text-sm text-transparent leading-5 [font-variant-ligatures:none] ${
                  findReplaceOpen ? "pb-52" : "pb-28"
                }`}
              >
                {(() => {
                  const regions: Array<{
                    start: number
                    end: number
                    type: "find" | "findCurrent" | "multiSelect"
                  }> = []

                  if (findReplaceOpen && findMatches.length > 0) {
                    findMatches.forEach((m, i) => {
                      regions.push({
                        start: m.start,
                        end: m.end,
                        type: i === findCurrentIndex ? "findCurrent" : "find",
                      })
                    })
                  } else {
                    multiSelections.forEach((s) => {
                      regions.push({
                        start: s.start,
                        end: s.end,
                        type: "multiSelect",
                      })
                    })
                  }

                  const sorted = [...regions].sort((a, b) => a.start - b.start)
                  const parts: React.ReactNode[] = []
                  let lastEnd = 0

                  for (const region of sorted) {
                    const rk = `${region.start}-${region.end}`
                    if (region.start > lastEnd) {
                      parts.push(
                        <span key={`t-${rk}`}>
                          {content.slice(lastEnd, region.start)}
                        </span>
                      )
                    }

                    if (region.type === "multiSelect") {
                      if (region.start === region.end) {
                        parts.push(
                          <span key={`c-${rk}`} className="editor-cursor" />
                        )
                      } else {
                        parts.push(
                          <mark
                            key={`m-${rk}`}
                            className="rounded-sm bg-blue-400/30 text-transparent"
                          >
                            {content.slice(region.start, region.end)}
                          </mark>
                        )
                        parts.push(
                          <span key={`c-${rk}`} className="editor-cursor" />
                        )
                      }
                    } else {
                      const bgClass =
                        region.type === "findCurrent"
                          ? "bg-[#e85d00]/40"
                          : "bg-[#ffeb3b]/25"

                      parts.push(
                        <mark
                          key={`m-${rk}`}
                          className={`${bgClass} rounded-sm text-transparent`}
                        >
                          {content.slice(region.start, region.end) || "​"}
                        </mark>
                      )
                    }

                    lastEnd = Math.max(lastEnd, region.end)
                  }

                  if (lastEnd < content.length) {
                    parts.push(
                      <span key="t-last">{content.slice(lastEnd)}</span>
                    )
                  }
                  parts.push("\n")
                  return parts
                })()}
              </div>
            </div>
          )}
          <Textarea
            ref={contentTextareaRef}
            autoFocus={autoFocusEditor && !togglePreview}
            value={content}
            onChange={(e) => setEditorContent(e.target.value)}
            onKeyDown={onKeyDown}
            onMouseDown={clearMultiSelections}
            onScroll={(e) => {
              if (overlayRef.current) {
                overlayRef.current.scrollTop = e.currentTarget.scrollTop
              }
            }}
            placeholder="Write in markdown…"
            className={`resize-none! bg-transparent! relative z-1 min-h-0 flex-1 overflow-y-auto rounded-none border-none! px-3 pt-2 font-mono text-sm leading-5 shadow-none! outline-none! ring-0! selection:bg-blue-400/30 selection:text-foreground [font-variant-ligatures:none] ${
              findReplaceOpen ? "pb-52" : "pb-28"
            }`}
          />
        </div>
      )}

      {togglePreview && (
        <div className="mx-auto min-h-0 w-full max-w-full! flex-1 overflow-y-auto bg-background px-3 pt-2 pb-28">
          {content.trim() ? (
            <MarkdownRenderer content={content} />
          ) : (
            <p className="text-muted-foreground text-xs italic">
              No content yet.
            </p>
          )}
        </div>
      )}

      {findReplaceOpen && !togglePreview && (
        <div className="fixed right-4 bottom-18 left-4 z-100 mx-auto max-w-5xl">
          <FindReplaceBar
            textareaRef={contentTextareaRef}
            content={content}
            setContent={setContent}
            showReplace={findReplaceShowReplace}
            onClose={() => {
              setFindReplaceOpen(false)
              setFindMatches([])
              setFindCurrentIndex(0)
            }}
            initialQuery={findInitialQuery}
            onMatchesChange={handleMatchesChange}
          />
        </div>
      )}
    </div>
  )
}
