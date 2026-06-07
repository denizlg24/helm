import {
  ApiScopeSchema,
  type SettingsFieldDescriptor,
  type SettingsGroupDescriptor,
} from "@workspace/types"
import { z } from "zod"

export const ModuleGroupSchema = z.enum([
  "core",
  "knowledge",
  "work",
  "relationships",
  "communications",
  "infrastructure",
  "publish",
])

export const ModuleDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: ModuleGroupSchema,
  nav: z.object({
    label: z.string().min(1),
    href: z.string().min(1),
  }),
  requiredScopes: z.array(ApiScopeSchema),
  entitlementRequirements: z.array(z.string()),
  assistantTools: z.array(z.string()),
  jobs: z.array(z.string()),
  settingsSchema: z.custom<z.ZodTypeAny>(),
})

export type ModuleDefinition = z.infer<typeof ModuleDefinitionSchema>

const emptySettingsSchema = z.object({})

// Plans no longer gate modules — access is controlled purely by whether the
// module is enabled in `module_configs` (ModuleGuard). `entitlementRequirements`
// is informational (used for nav hints / docs), not enforced. Paid modules are
// gated by holding an active Polar subscription for that module's product, which
// is what flips `module_configs.enabled`.
export const moduleDefinitions = [
  // --- Core (always on, free) ---------------------------------------------
  {
    id: "home",
    name: "Home dashboard",
    group: "core",
    nav: { label: "Home", href: "/" },
    requiredScopes: ["home:read"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "settings",
    name: "Settings",
    group: "core",
    nav: { label: "Settings", href: "/settings" },
    requiredScopes: ["settings:read"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "assistant",
    name: "AI Assistant",
    group: "core",
    nav: { label: "Assistant", href: "/assistant" },
    requiredScopes: ["assistant:read", "assistant:write"],
    entitlementRequirements: [],
    assistantTools: ["assistant_chat", "app_navigate"],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "llm-usage",
    name: "LLM usage",
    group: "core",
    nav: { label: "LLM usage", href: "/settings/usage" },
    requiredScopes: ["usage:read"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "api-tokens",
    name: "API tokens",
    group: "core",
    nav: { label: "API tokens", href: "/settings/api-tokens" },
    requiredScopes: ["api-key:read", "api-key:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "data-export",
    name: "Data export",
    group: "core",
    nav: { label: "Data export", href: "/settings/export" },
    requiredScopes: ["data-export:read", "data-export:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  // --- Knowledge ----------------------------------------------------------
  {
    id: "notes",
    name: "Notes",
    group: "knowledge",
    nav: { label: "Notes", href: "/notes" },
    requiredScopes: ["notes:read", "notes:write"],
    entitlementRequirements: [],
    assistantTools: [
      "notes_list",
      "notes_get",
      "notes_create",
      "notes_update",
      "notes_delete",
      "notes_list_groups",
      "notes_create_group",
      "notes_update_group",
      "notes_delete_group",
      "notes_list_tags",
      "notes_summarize",
      "notes_rewrite_open",
    ],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "whiteboard",
    name: "Whiteboards",
    group: "knowledge",
    nav: { label: "Whiteboards", href: "/whiteboard" },
    requiredScopes: ["whiteboard:read", "whiteboard:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "spreadsheets",
    name: "Spreadsheets",
    group: "knowledge",
    nav: { label: "Spreadsheets", href: "/spreadsheets" },
    requiredScopes: ["spreadsheets:read", "spreadsheets:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  // --- Work ---------------------------------------------------------------
  {
    id: "kanban",
    name: "Kanban",
    group: "work",
    nav: { label: "Kanban", href: "/kanban" },
    requiredScopes: ["kanban:read", "kanban:write"],
    entitlementRequirements: [],
    assistantTools: ["kanban.createTask"],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "calendar",
    name: "Calendar",
    group: "work",
    nav: { label: "Calendar", href: "/calendar" },
    requiredScopes: ["calendar:read", "calendar:write"],
    entitlementRequirements: [],
    assistantTools: ["calendar.createEvent"],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "timetable",
    name: "Timetable",
    group: "work",
    nav: { label: "Timetable", href: "/timetable" },
    requiredScopes: ["timetable:read", "timetable:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "journal",
    name: "Journal",
    group: "work",
    nav: { label: "Journal", href: "/journal" },
    requiredScopes: ["journal:read", "journal:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "pomodoro",
    name: "Pomodoro",
    group: "work",
    nav: { label: "Pomodoro", href: "/pomodoro" },
    requiredScopes: ["pomodoro:read", "pomodoro:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  // --- Relationships ------------------------------------------------------
  {
    id: "people",
    name: "People",
    group: "relationships",
    nav: { label: "People", href: "/people" },
    requiredScopes: ["people:read", "people:write"],
    entitlementRequirements: [],
    assistantTools: ["people.search", "people.createReminder"],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  // --- Communications -----------------------------------------------------
  {
    id: "imap-inbox",
    name: "IMAP inbox",
    group: "communications",
    nav: { label: "Inbox", href: "/inbox" },
    requiredScopes: ["imap-inbox:read", "imap-inbox:write"],
    entitlementRequirements: [],
    assistantTools: ["email.triage"],
    jobs: ["email.sync"],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "triage",
    name: "Email triage",
    group: "communications",
    nav: { label: "Triage", href: "/triage" },
    requiredScopes: ["triage:read", "triage:write"],
    entitlementRequirements: [],
    assistantTools: ["triage.run"],
    jobs: ["triage.run"],
    settingsSchema: emptySettingsSchema,
  },
  // --- Infrastructure -----------------------------------------------------
  {
    id: "resources",
    name: "Resource inventory",
    group: "infrastructure",
    nav: { label: "Resources", href: "/resources" },
    requiredScopes: ["resources:read", "resources:write"],
    entitlementRequirements: [],
    assistantTools: ["resources.health"],
    jobs: ["resources.healthCheck"],
    settingsSchema: emptySettingsSchema,
  },
  // --- Publish (add-on) ---------------------------------------------------
  {
    id: "blog",
    name: "Blog",
    group: "publish",
    nav: { label: "Blog", href: "/blog" },
    requiredScopes: ["blog:read", "blog:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "projects",
    name: "Projects",
    group: "publish",
    nav: { label: "Projects", href: "/projects" },
    requiredScopes: ["projects:read", "projects:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "timeline",
    name: "Timeline",
    group: "publish",
    nav: { label: "Timeline", href: "/timeline" },
    requiredScopes: ["timeline:read", "timeline:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "now",
    name: "Now page",
    group: "publish",
    nav: { label: "Now", href: "/now" },
    requiredScopes: ["now:read", "now:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "comments",
    name: "Comments",
    group: "publish",
    nav: { label: "Comments", href: "/blog/comments" },
    requiredScopes: ["comments:read", "comments:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "contact-form",
    name: "Contact form",
    group: "publish",
    nav: { label: "Contact form", href: "/settings/contact-form" },
    requiredScopes: ["contact-form:read", "contact-form:write"],
    entitlementRequirements: [],
    assistantTools: [],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
] as const satisfies readonly ModuleDefinition[]

export const moduleDefinitionById = (() => {
  const definitions = new Map<string, (typeof moduleDefinitions)[number]>()
  for (const moduleDefinition of moduleDefinitions) {
    if (definitions.has(moduleDefinition.id)) {
      throw new Error(
        `Duplicate module id: ${moduleDefinition.id} (${moduleDefinition.name})`
      )
    }
    definitions.set(moduleDefinition.id, moduleDefinition)
  }
  return definitions
})()

// Always-on core modules — free, cannot be disabled, provisioned for every
// workspace.
export const coreModuleIds = [
  "home",
  "settings",
  "assistant",
  "llm-usage",
  "api-tokens",
  "data-export",
] as const

// Modules enabled by default at signup (no extra charge). Everything else is a
// paid monthly add-on enabled via a Polar module subscription. Per the pricing
// decision: core + kanban + calendar + pomodoro are free.
export const defaultEnabledModuleIds = [
  ...coreModuleIds,
  "kanban",
  "calendar",
  "pomodoro",
] as const

// Back-compat alias
export const coreMvpModuleIds = defaultEnabledModuleIds

// UI metadata for command palette and module navigation
export const GROUP_LABELS: Record<string, string> = {
  communications: "Communications",
  core: "Core",
  infrastructure: "Infrastructure",
  knowledge: "Knowledge",
  publish: "Publish",
  relationships: "Relationships",
  work: "Work",
}

export const MODULE_ICONS: Record<string, string> = {
  "api-tokens": "KeyRound",
  assistant: "Bot",
  blog: "NotebookPen",
  calendar: "Calendar",
  comments: "MessageCircle",
  "contact-form": "UserSquare",
  "data-export": "Download",
  home: "HomeIcon",
  "imap-inbox": "Inbox",
  journal: "NotebookPen",
  kanban: "Kanban",
  "llm-usage": "Brain",
  notes: "FileText",
  now: "HomeIcon",
  people: "UsersRound",
  pomodoro: "AlarmClock",
  projects: "FolderGit2",
  resources: "Radio",
  settings: "Settings",
  spreadsheets: "Table",
  timetable: "Calendar",
  timeline: "FolderGit2",
  triage: "Brain",
  whiteboard: "PenTool",
}

export const ROUTE_OVERRIDES: Record<string, string> = {
  assistant: "/",
  home: "/",
}

export const EXTRA_KEYWORDS: Record<string, string[]> = {
  "api-tokens": ["token", "keys", "developer"],
  assistant: ["ai", "chat", "dashboard"],
  "data-export": ["download", "backup"],
  "imap-inbox": ["mail", "email"],
  "llm-usage": ["usage", "billing", "credits"],
  people: ["contacts", "crm", "relationships"],
  pomodoro: ["timer", "focus"],
  resources: ["infrastructure", "servers", "health"],
  triage: ["email", "review"],
  whiteboard: ["canvas", "drawing"],
}

// --- Settings registry -------------------------------------------------------
// Declarative descriptors the shared settings UI renders. The "general" group
// ships now; modules add their own groups/fields here as they implement
// settings (e.g. a future desktop-only notes save directory with scope
// "desktop"). The UI filters by the host platform via the `scope`/`platform`.

export const settingsGroups = [
  {
    id: "general",
    label: "General",
    description: "Appearance and keyboard shortcuts.",
    icon: "SlidersHorizontal",
    platform: "both",
  },
] as const satisfies readonly SettingsGroupDescriptor[]

export const settingsFields = [
  {
    key: "appearance.mode",
    label: "Theme",
    description: "Match your system, or force light or dark.",
    group: "general",
    scope: "both",
    control: "theme-mode",
  },
  {
    key: "shortcuts.commandPalette",
    label: "Command palette",
    description: "Open the command palette.",
    group: "general",
    scope: "both",
    control: "shortcut",
  },
  {
    key: "assistant.dockPosition",
    label: "Assistant dock",
    description: "Which corner the floating assistant button anchors to.",
    group: "general",
    scope: "both",
    control: "assistant-dock-position",
  },
] as const satisfies readonly SettingsFieldDescriptor[]
