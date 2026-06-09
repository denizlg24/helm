"use client"

import type {
  PomodoroSession,
  UpdatePomodoroSessionInput,
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { MarkdownRenderer } from "@workspace/ui/components/markdown-renderer"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { useEffect, useState } from "react"

interface SessionAnnotationDialogProps {
  session: PomodoroSession | null
  onOpenChange: (open: boolean) => void
  onSave: (id: string, input: UpdatePomodoroSessionInput) => Promise<void>
}

const parseTopics = (raw: string): string[] => [
  ...new Set(
    raw
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean)
  ),
]

export function SessionAnnotationDialog({
  session,
  onOpenChange,
  onSave,
}: SessionAnnotationDialogProps) {
  const [subject, setSubject] = useState("")
  const [topics, setTopics] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!session) return
    setSubject(session.subject ?? "")
    setTopics(session.topics.join(", "))
    setNotes(session.notes)
  }, [session])

  const handleSave = async () => {
    if (!session) return
    setSaving(true)
    try {
      await onSave(session.id, {
        subject: subject.trim() || null,
        topics: parseTopics(topics),
        notes,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={session !== null}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log this session</DialogTitle>
          <DialogDescription>
            What did you work on? Notes support markdown.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pomodoro-session-subject">Subject</Label>
            <Input
              id="pomodoro-session-subject"
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Linear algebra revision"
              value={subject}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pomodoro-session-topics">Topics</Label>
            <Input
              id="pomodoro-session-topics"
              onChange={(event) => setTopics(event.target.value)}
              placeholder="Comma separated, e.g. eigenvalues, proofs"
              value={topics}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Tabs defaultValue="write">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <Textarea
                  className="min-h-36 font-mono text-sm"
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="## What I covered&#10;- ..."
                  value={notes}
                />
              </TabsContent>
              <TabsContent value="preview">
                <div className="max-h-64 min-h-36 overflow-y-auto rounded-md border border-border px-4 py-3">
                  {notes.trim() ? (
                    <MarkdownRenderer content={notes} />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Nothing to preview yet.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            Skip
          </Button>
          <Button disabled={saving} onClick={handleSave} type="button">
            {saving ? <Spinner className="size-4" /> : null}
            Save log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
