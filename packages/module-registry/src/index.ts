import { ApiScopeSchema } from "@workspace/types"
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

export const moduleDefinitions = [
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
    entitlementRequirements: ["assistant"],
    assistantTools: ["assistant.chat"],
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
  {
    id: "notes",
    name: "Notes",
    group: "knowledge",
    nav: { label: "Notes", href: "/notes" },
    requiredScopes: ["notes:read", "notes:write"],
    entitlementRequirements: [],
    assistantTools: ["notes.search", "notes.create"],
    jobs: [],
    settingsSchema: emptySettingsSchema,
  },
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
  {
    id: "imap-inbox",
    name: "IMAP inbox",
    group: "communications",
    nav: { label: "Inbox", href: "/inbox" },
    requiredScopes: ["imap-inbox:read", "imap-inbox:write"],
    entitlementRequirements: ["email"],
    assistantTools: ["email.triage"],
    jobs: ["email.sync"],
    settingsSchema: emptySettingsSchema,
  },
  {
    id: "resources",
    name: "Resource inventory",
    group: "infrastructure",
    nav: { label: "Resources", href: "/resources" },
    requiredScopes: ["resources:read", "resources:write"],
    entitlementRequirements: ["infrastructure"],
    assistantTools: ["resources.health"],
    jobs: ["resources.healthCheck"],
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

export const coreMvpModuleIds = [
  "home",
  "settings",
  "assistant",
  "api-tokens",
  "data-export",
] as const
