import { z } from "zod"

// Where a tool executes. Server tools run in the assistant loop against a
// service; client tools suspend the turn and run in the web/desktop client
// against live UI state (open editor, router) before posting a result back.
export type AssistantToolSide = "server" | "client"

// Whether a tool may run without user confirmation. `approval` tools
// (destructive / outward-facing) suspend the turn until the user approves —
// security invariant: delete/send/reboot/publish always require confirmation.
// Client tools currently carry no extra gate (see assistant-actions-decisions).
export type AssistantToolRisk = "auto" | "approval"

// Isomorphic declaration shared by API and clients. Handlers are NOT declared
// here — each side binds its own (the API injects services, the client binds
// UI-mutating handlers). The Anthropic tool definition is derived from
// `inputSchema`; we never hand-write JSON Schema.
export interface AssistantToolDeclaration {
  name: string
  description: string
  inputSchema: z.ZodType
  side: AssistantToolSide
  risk: AssistantToolRisk
  // Module that owns this tool. Used for enabled-module + entitlement gating,
  // mirroring `module-registry`'s `assistantTools` declarations.
  moduleId: string
  // True when the tool changes server-side module data, so clients can refresh
  // the affected surface after it runs. Read-only tools omit this.
  mutates?: boolean
}

// --- Core assistant tools ----------------------------------------------------
// These belong to the always-on `assistant` module and have no module-entity
// dependencies. Migrated from the API's former hand-written registry.

const getCurrentDatetime: AssistantToolDeclaration = {
  name: "get_current_datetime",
  description:
    "Returns the current date and time. Use when the user asks about today, the current time, or to ground date-relative reasoning.",
  inputSchema: z.object({
    timeZone: z
      .string()
      .min(1)
      .optional()
      .describe("IANA time zone, e.g. 'Europe/Lisbon'. Defaults to UTC."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "assistant",
}

const rememberFact: AssistantToolDeclaration = {
  name: "remember_fact",
  description:
    "Persist a small preference or fact about the user for future conversations (e.g. 'timezone' -> 'Europe/Lisbon'). Overwrites an existing fact with the same key.",
  inputSchema: z.object({
    key: z.string().min(1).max(120).describe("Short identifier for the fact."),
    value: z.string().min(1).max(2000).describe("The fact to remember."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "assistant",
}

const forgetAllFacts: AssistantToolDeclaration = {
  name: "forget_all_facts",
  description:
    "Permanently delete every remembered fact and preference for this workspace. Destructive and irreversible.",
  inputSchema: z.object({}),
  side: "server",
  risk: "approval",
  moduleId: "assistant",
}

// --- Navigation (client) -----------------------------------------------------

const navigate: AssistantToolDeclaration = {
  name: "app_navigate",
  description:
    "Navigate the user to a route within the app, e.g. '/notes' or '/calendar'. Use when the user asks to go to or open a section.",
  inputSchema: z.object({
    route: z
      .string()
      .min(1)
      .describe("App-relative path beginning with '/', e.g. '/notes'."),
  }),
  side: "client",
  risk: "auto",
  moduleId: "assistant",
}

// --- Notes -------------------------------------------------------------------

const noteSortSchema = z
  .enum([
    "updated-desc",
    "updated-asc",
    "created-desc",
    "created-asc",
    "title-asc",
    "title-desc",
  ])
  .optional()
  .describe("Sort order for results. Defaults to most recently updated.")

const notesList: AssistantToolDeclaration = {
  name: "notes_list",
  description:
    "List or search the user's notes. Returns compact rows (id, title, snippet, tags, groups, status) — use notes_get for the full body of a specific note. Filter by free-text query, group, tag, status, or source. Use this to answer 'what notes do I have', 'find my note about X', or to resolve a note id before updating/deleting.",
  inputSchema: z.object({
    q: z
      .string()
      .max(200)
      .optional()
      .describe("Free-text search across title, body, url, tags, and class."),
    groupId: z
      .string()
      .optional()
      .describe("Restrict to a group/folder and its descendants."),
    tag: z.string().max(64).optional().describe("Restrict to a single tag."),
    status: z
      .enum(["open", "archived", "all"])
      .optional()
      .describe("Note status filter. Defaults to open."),
    sourceType: z
      .enum(["manual", "url", "import", "all"])
      .optional()
      .describe("Filter by how the note was created. Defaults to all."),
    sort: noteSortSchema,
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max rows to return (1-50). Defaults to 20."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesGet: AssistantToolDeclaration = {
  name: "notes_get",
  description:
    "Fetch a single note by id, including its full markdown body, tags, groups, summary, and metadata. Use after notes_list when you need the actual content (e.g. to answer questions about it or summarize it).",
  inputSchema: z.object({
    id: z.string().min(1).describe("The note id."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesCreate: AssistantToolDeclaration = {
  name: "notes_create",
  mutates: true,
  description:
    "Create a new note. When the user is on the notes surface, default the group to the one currently in focus unless they specify otherwise. Provide either markdown content or a URL to bookmark.",
  inputSchema: z.object({
    title: z.string().max(300).optional().describe("Note title."),
    content: z.string().max(100_000).optional().describe("Markdown body."),
    tags: z
      .array(z.string().max(64))
      .max(64)
      .optional()
      .describe("Tags to attach to the note."),
    groupId: z
      .string()
      .optional()
      .describe("Target group/folder id. Defaults to the focused group."),
    url: z
      .string()
      .url()
      .optional()
      .describe("URL to bookmark instead of markdown content."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesUpdate: AssistantToolDeclaration = {
  name: "notes_update",
  mutates: true,
  description:
    "Update an existing note by id. Only the provided fields change; omit a field to leave it as-is. Use to retitle, edit content, retag, re-file into groups, archive/unarchive, or set a class. To delete a note use notes_delete instead.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The note id to update."),
    title: z.string().max(240).optional().describe("New title."),
    content: z
      .string()
      .max(100_000)
      .optional()
      .describe("Replacement markdown body (replaces the entire body)."),
    tags: z
      .array(z.string().max(64))
      .max(64)
      .optional()
      .describe("Replacement tag set (replaces existing tags)."),
    groupIds: z
      .array(z.string().min(1))
      .max(64)
      .optional()
      .describe("Replacement group/folder membership (replaces existing)."),
    status: z
      .enum(["open", "archived"])
      .optional()
      .describe("Set the note status."),
    class: z
      .string()
      .max(80)
      .optional()
      .describe("Free-form classification label."),
    summary: z
      .string()
      .max(2000)
      .optional()
      .describe("Short summary to store on the note."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesDelete: AssistantToolDeclaration = {
  name: "notes_delete",
  mutates: true,
  description:
    "Delete a note by id. Destructive: the note is moved to the deleted state and its graph links are removed. Always confirm with the user before calling.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The note id to delete."),
  }),
  side: "server",
  risk: "approval",
  moduleId: "notes",
}

const notesListGroups: AssistantToolDeclaration = {
  name: "notes_list_groups",
  description:
    "List the user's note groups/folders with their hierarchy and note counts. Use to answer 'what folders do I have', to find a group id before filing a note, or to understand how notes are organized.",
  inputSchema: z.object({}),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesCreateGroup: AssistantToolDeclaration = {
  name: "notes_create_group",
  mutates: true,
  description:
    "Create a new note group/folder. Optionally nest it under a parent group and give it a color.",
  inputSchema: z.object({
    name: z.string().min(1).max(120).describe("Group name."),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe("Optional description of what the group holds."),
    color: z
      .string()
      .max(40)
      .optional()
      .describe("Optional color label or hex value."),
    parentId: z
      .string()
      .min(1)
      .optional()
      .describe("Optional parent group id to nest under."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesUpdateGroup: AssistantToolDeclaration = {
  name: "notes_update_group",
  mutates: true,
  description:
    "Update a note group/folder by id: rename, re-describe, recolor, or move it under a different parent (pass parentId null to move it to the top level). Only provided fields change.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The group id to update."),
    name: z.string().min(1).max(120).optional().describe("New name."),
    description: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .describe("New description, or null to clear it."),
    color: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .describe("New color, or null to clear it."),
    parentId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe("New parent group id, or null to move to the top level."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesDeleteGroup: AssistantToolDeclaration = {
  name: "notes_delete_group",
  mutates: true,
  description:
    "Delete a note group/folder by id. Destructive: notes are removed from the group (not deleted) and child groups are moved to the top level. Always confirm with the user before calling.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The group id to delete."),
  }),
  side: "server",
  risk: "approval",
  moduleId: "notes",
}

const notesListTags: AssistantToolDeclaration = {
  name: "notes_list_tags",
  description:
    "List every tag used across the user's notes. Use to suggest existing tags or to answer 'what tags do I use'.",
  inputSchema: z.object({}),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesSummarize: AssistantToolDeclaration = {
  name: "notes_summarize",
  description:
    "Generate a concise summary of a note's content using a separate model call and return it. Optionally persist the summary onto the note. Use for 'summarize this note' / 'tl;dr of note X'. Best for longer notes; for trivially short notes just read them with notes_get.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The note id to summarize."),
    persist: z
      .boolean()
      .optional()
      .describe(
        "When true, save the generated summary onto the note. Defaults to false (return only)."
      ),
  }),
  side: "server",
  risk: "auto",
  moduleId: "notes",
}

const notesRewriteOpen: AssistantToolDeclaration = {
  name: "notes_rewrite_open",
  description:
    "Replace the content of the note the user currently has open in the editor. Use for 'improve/rewrite this note' requests. Provide the full new markdown body; the current content is in the surface context. Only valid when a note is open.",
  inputSchema: z.object({
    content: z
      .string()
      .max(100_000)
      .describe("The complete new markdown body for the open note."),
  }),
  side: "client",
  risk: "auto",
  moduleId: "notes",
}

// --- Pomodoro ------------------------------------------------------------------
// Timer control runs on the client (the countdown lives in the host app and,
// on desktop, persists through Rust). Settings and the session log live on the
// server, so those tools run in the assistant loop.

const pomodoroStatus: AssistantToolDeclaration = {
  name: "pomodoro_status",
  description:
    "Read the current state of the user's pomodoro timer: phase (focus or break), whether it is running/paused/idle, time remaining, and progress through the long-break cycle.",
  inputSchema: z.object({}),
  side: "client",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroStart: AssistantToolDeclaration = {
  name: "pomodoro_start",
  description:
    "Start the pomodoro countdown for the current phase (focus session or break). Resumes if the timer is paused. Fails if it is already running.",
  inputSchema: z.object({}),
  side: "client",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroPause: AssistantToolDeclaration = {
  name: "pomodoro_pause",
  description: "Pause the running pomodoro countdown.",
  inputSchema: z.object({}),
  side: "client",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroResume: AssistantToolDeclaration = {
  name: "pomodoro_resume",
  description: "Resume a paused pomodoro countdown.",
  inputSchema: z.object({}),
  side: "client",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroSkipBreak: AssistantToolDeclaration = {
  name: "pomodoro_skip_break",
  description:
    "Skip the current break and return the timer to an idle focus session, ready to start.",
  inputSchema: z.object({}),
  side: "client",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroGiveUp: AssistantToolDeclaration = {
  name: "pomodoro_give_up",
  description:
    "Abandon the focus session in progress. Sessions longer than a minute are logged as abandoned; the countdown resets. Only use when the user clearly asks to stop or abandon the session.",
  inputSchema: z.object({}),
  side: "client",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroGetSettings: AssistantToolDeclaration = {
  name: "pomodoro_get_settings",
  description:
    "Read the workspace's pomodoro timer settings: focus/break durations, long-break cadence, daily goal, and behavior toggles.",
  inputSchema: z.object({}),
  side: "server",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroUpdateSettings: AssistantToolDeclaration = {
  name: "pomodoro_update_settings",
  description:
    "Update the workspace's pomodoro timer settings. Only pass the fields to change. Changes apply to the next countdown.",
  inputSchema: z.object({
    focusMinutes: z
      .number()
      .int()
      .min(1)
      .max(180)
      .optional()
      .describe("Length of a focus session in minutes."),
    shortBreakMinutes: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe("Length of a short break in minutes."),
    longBreakMinutes: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("Length of a long break in minutes."),
    longBreakEvery: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("Number of focus sessions between long breaks."),
    autoStartBreaks: z
      .boolean()
      .optional()
      .describe("Start breaks automatically when a focus session ends."),
    autoStartFocus: z
      .boolean()
      .optional()
      .describe("Start the next focus session automatically after a break."),
    soundEnabled: z
      .boolean()
      .optional()
      .describe("Play a chime when a phase ends."),
    notificationsEnabled: z
      .boolean()
      .optional()
      .describe("Show a notification when a phase ends."),
    dailyGoalSessions: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe("Target number of completed focus sessions per day."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "pomodoro",
  mutates: true,
}

const pomodoroListSessions: AssistantToolDeclaration = {
  name: "pomodoro_list_sessions",
  description:
    "List the user's recorded pomodoro sessions (most recent first). Each row has id, status (completed/abandoned), start time, planned vs completed duration, subject, topics, and a notes snippet. Use to answer 'what did I focus on', daily/weekly summaries, or to resolve a session id before updating it.",
  inputSchema: z.object({
    from: z
      .string()
      .optional()
      .describe("ISO 8601 lower bound for the session start time."),
    to: z
      .string()
      .optional()
      .describe("ISO 8601 upper bound for the session start time."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Maximum rows to return. Defaults to 50."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "pomodoro",
}

const pomodoroUpdateSession: AssistantToolDeclaration = {
  name: "pomodoro_update_session",
  description:
    "Annotate a recorded pomodoro session: set its subject, topics, or markdown notes. Only pass the fields to change. Resolve the id with pomodoro_list_sessions first.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The session id."),
    subject: z
      .string()
      .max(200)
      .nullable()
      .optional()
      .describe("Short subject line, or null to clear it."),
    topics: z
      .array(z.string().min(1).max(60))
      .max(20)
      .optional()
      .describe("Topic tags. Replaces the existing list."),
    notes: z
      .string()
      .max(20_000)
      .optional()
      .describe("Markdown notes. Replaces the existing notes."),
  }),
  side: "server",
  risk: "auto",
  moduleId: "pomodoro",
  mutates: true,
}

const pomodoroDeleteSession: AssistantToolDeclaration = {
  name: "pomodoro_delete_session",
  description:
    "Permanently delete a recorded pomodoro session and its notes. Destructive and irreversible.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The session id."),
  }),
  side: "server",
  risk: "approval",
  moduleId: "pomodoro",
  mutates: true,
}

// --- Registry ----------------------------------------------------------------

export const assistantToolDeclarations: readonly AssistantToolDeclaration[] = [
  getCurrentDatetime,
  rememberFact,
  forgetAllFacts,
  navigate,
  notesList,
  notesGet,
  notesCreate,
  notesUpdate,
  notesDelete,
  notesListGroups,
  notesCreateGroup,
  notesUpdateGroup,
  notesDeleteGroup,
  notesListTags,
  notesSummarize,
  notesRewriteOpen,
  pomodoroStatus,
  pomodoroStart,
  pomodoroPause,
  pomodoroResume,
  pomodoroSkipBreak,
  pomodoroGiveUp,
  pomodoroGetSettings,
  pomodoroUpdateSettings,
  pomodoroListSessions,
  pomodoroUpdateSession,
  pomodoroDeleteSession,
]

const byName: ReadonlyMap<string, AssistantToolDeclaration> = new Map(
  assistantToolDeclarations.map((tool) => [tool.name, tool])
)

export const getAssistantToolDeclaration = (
  name: string
): AssistantToolDeclaration | undefined => byName.get(name)

export const isClientTool = (name: string): boolean =>
  byName.get(name)?.side === "client"

// JSON Schema for the tool input, derived from its Zod schema. The `$schema`
// meta key is stripped because the Anthropic tool `input_schema` rejects it.
export const toInputJsonSchema = (
  declaration: AssistantToolDeclaration
): Record<string, unknown> => {
  const schema: Record<string, unknown> = {
    ...z.toJSONSchema(declaration.inputSchema),
  }
  delete schema.$schema
  return schema
}
