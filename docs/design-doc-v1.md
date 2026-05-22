# Helm — Design Spec (v1)

**Date:** 2026-05-22
**Status:** Active — replaces v0
**Codename:** Helm

---

## What this document is

v1 closes the open questions from v0, locks the concrete repo decisions already made, and expands the architecture sections enough for implementation to begin without re-deriving decisions each session. It does not re-explain rationale already in v0 — read both.

---

## Closed decisions (were open questions in v0)

| Question | Decision |
|---|---|
| Desktop-only first release or web too? | Web and desktop ship together for MVP. Web covers signup, billing, workspace setup, onboarding. Desktop is the primary daily-use surface. |
| AI usage model? | Platform-managed keys for MVP (user sets a monthly budget). BYOK comes post-MVP. |
| How much works offline? | Desktop works offline for read and local operations (Pomodoro, local embeddings, cached data). Write mutations queue and sync when connectivity returns. Out of scope for MVP. |
| Which modules are base vs Pro? | See billing table below — confirmed from v0. |
| Publish: add-on or separate product? | Add-on. Same Next.js deployment, tenant-scoped routes, isolated data layer. |
| Export formats per module? | JSON (all), Markdown (notes, journal, posts), CSV (kanban, spreadsheets, people). Zip bundle for full workspace export. |
| Authenticator vault? | Gated post-MVP. Requires seed encryption + recovery + device trust design review before any implementation. |

---

## Monorepo structure

```
helm/                          ← repo root (Turborepo + bun workspaces)
├── apps/
│   ├── api/                   ← NestJS 11 backend (Fastify adapter)
│   ├── web/                   ← Next.js 16 — dashboard (auth'd module screens)
│   ├── console/               ← Next.js 16 — account, billing, workspace setup
│   ├── marketing/             ← Next.js 16 — public marketing site
│   └── desktop/               ← Tauri 2 + Vite + React (NOT Next.js inside Tauri)
│       └── src-tauri/         ← Rust core
├── packages/
│   ├── ui/                    ← shared shadcn/ui + Tailwind v4 components
│   ├── types/                 ← shared TypeScript types and Zod schemas
│   ├── db/                    ← Drizzle ORM + Postgres schema (product-level)
│   ├── module-registry/       ← module definitions, capability declarations
│   └── api-client/            ← typed HTTP client used by web, console, desktop
└── docs/
```

### App responsibilities

**`apps/api`** — all server-side logic. No business logic lives in Next.js API routes.

**`apps/web`** — authenticated dashboard. Renders module screens. Loads module navigation from enabled modules. Shares component library with console. Calls `apps/api` via `packages/api-client`.

**`apps/console`** — account management surface: signup/login, billing, workspace creation, onboarding wizard, module config, integrations, device activation, data export, account deletion.

**`apps/marketing`** — fully public. No auth dependency. Can be deployed separately.

**`apps/desktop`** — Vite + React frontend loaded by Tauri WebView. Same React components as `apps/web` where practical (via `packages/ui`). Desktop-only features (file dialogs, notifications, local embeddings, Pomodoro timer) implemented in Rust and exposed via Tauri commands. No Next.js inside Tauri.

---

## Toolchain (locked)

| Tool | Version | Notes |
|---|---|---|
| Runtime | Bun 1.3.3 | package manager + script runner |
| TypeScript | 6.x strict | no `any`, no `unknown` casts to silence errors |
| Linter/formatter | Biome 2.x | replaces ESLint + Prettier entirely |
| Commits | commitlint + husky + lint-staged | conventional commits enforced |
| Build orchestration | Turbo 2.x | task graph across all apps/packages |
| Node.js | ≥ 20 | for API and Next.js SSR |

---

## Backend architecture

### Stack

| Layer | Choice |
|---|---|
| Framework | NestJS 11 (Fastify adapter) |
| Validation | Zod via NestJS pipes |
| Relational ORM | Drizzle ORM → Postgres 16 |
| Document ORM | Mongoose → MongoDB 7 |
| Cache / sessions / pub-sub | Redis 7 |
| Job queue | BullMQ (one queue per job type) |
| Observability | OpenTelemetry |

### Database split

**Postgres (Drizzle)** — product-level entities with strict relational guarantees:
`Tenant`, `Workspace`, `User`, `WorkspaceMember`, `Subscription`, `Entitlement`, `ModuleConfig`, `DashboardLayout`, `AppInstall`, `ApiToken`, `IntegrationCredential`, `AuditLog`, `LlmUsage`

**MongoDB (Mongoose)** — dashboard entities with flexible per-module schemas:
`Conversation`, `Note`, `NoteGroup`, `NoteEdge`, `NoteEmbedding`, `SemanticRun`, `SemanticSuggestion`, `Whiteboard`, `Spreadsheet`, `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `CalendarEvent`, `CalendarSettings`, `TimetableEntry`, `JournalEntry`, `Person`, `PersonGroup`, `PersonEdge`, `ContactSubmission`, `EmailAccount`, `Email`, `EmailTriage`, `TriageSettings`, `Resource`, `ResourceCapability`, `HealthCheckLog`, `ScheduledJob`, `PublishPost`, `PublishProject`, `PublishTimelineItem`, `PublishComment`

All MongoDB documents carry `workspaceId` (required, indexed) and `tenantId` for isolation. No cross-workspace queries ever.

### Request lifecycle

Every authenticated request resolves in this order before business logic runs:

1. JWT / session validation → `userId`
2. Workspace membership lookup → `workspaceId`, `role`
3. Token scope check (if API token request)
4. Module enabled check for the target module
5. Entitlement check (plan limits, budget)
6. Business logic + permission check
7. Audit event write (if sensitive mutation)

This pipeline lives in a shared NestJS guard chain. No handler bypasses it.

### Service layer rule

HTTP controllers, assistant tools, and background jobs all call the **same service methods**. No business logic in controllers or job processors directly.

---

## Packages

### `packages/types`

Shared Zod schemas and inferred TypeScript types for all entities. Source of truth for request/response shapes. Both API and client import from here. No runtime logic.

### `packages/db`

Drizzle schema + migration files + db client factory. Only Postgres product-level tables live here. Exported as a typed client consumed by `apps/api`.

### `packages/module-registry`

Module definitions. Each module exports a `ModuleDefinition` object with:
- `key: string`
- `name: string`
- `icon: string`
- `navEntries: NavEntry[]`
- `dashboardWidgets: WidgetDefinition[]`
- `permissions: string[]`
- `apiScopes: string[]`
- `assistantTools: ToolDefinition[]`
- `backgroundJobs: JobDefinition[]`
- `settingsSchema: ZodSchema`
- `importHandlers: ImportHandler[]`
- `exportHandlers: ExportHandler[]`
- `storageCategories: string[]`
- `entitlementRequirements: EntitlementRequirement[]`
- `dependencies: string[]`

The registry is consumed by: API (navigation, tools, jobs), web/console (nav rendering, settings screens), billing gates (entitlement checks).

### `packages/api-client`

Typed HTTP client generated from NestJS controller signatures (or hand-written if codegen is not practical for MVP). Used by `apps/web`, `apps/console`, `apps/desktop`. Handles auth headers, token refresh, and typed errors.

### `packages/ui`

shadcn/ui component primitives + Tailwind v4 globals. Multiple color themes already present (rose, coral, amber, butter, mint, sky, cyan, lavender, plum, blush). Workspace theme preference stored in workspace settings and applied at runtime.

---

## Authentication and device activation

### Web (console + web dashboard)
- Auth.js (next-auth) with email/password + OAuth providers.
- Session stored in Redis.

### Desktop
- Device activation via browser-based sign-in (OAuth flow that returns a device token).
- Device code flow as fallback (short-lived code, user approves in console).
- Long-lived API keys are for automation roles only — never used for normal app login.
- Device token stored in OS keychain via Tauri secure storage.

### API tokens
- Scoped to workspace + explicit API scopes.
- Issued to `Automation` and `Resource Agent` roles.
- Displayed once on creation; stored hashed.

---

## Module system

Modules are **not** deployed separately — they are feature flags + capability declarations inside the single API and frontend. A disabled module:
- Removes its nav entries
- Removes its assistant tools from the tool registry
- Returns 403 on its API endpoints
- Hides its settings screen
- Skips its background jobs

Module state lives in `ModuleConfig` (Postgres). The module registry package provides the static capability declarations; runtime module state comes from the API.

---

## Assistant

- Provider-agnostic gateway: Anthropic (Claude) primary, OpenAI fallback, Ollama for self-hosted.
- Tool registry assembled per-request from: enabled modules + role permissions + token scopes.
- Streaming via SSE to web and desktop.
- Read tools: execute immediately, logged.
- Write tools: execute per approval policy (auto-approve / require confirmation, configurable per module and risk level).
- High-risk always requires confirmation: delete, send email, reboot, restart service, rotate token, publish public content.
- Every tool call logged to `AuditLog`.
- Budget checked **before** each model request using workspace `LlmUsage` + `Entitlement`.

---

## Desktop app (Tauri 2)

Frontend: Vite + React. Same `packages/ui` components as the web apps.

Rust core responsibilities:
- OS keychain access (device token storage)
- File dialogs and export destinations
- Desktop notifications
- Local embedding runtime (`fastembed-rs` or ONNX via Rust)
- Pomodoro timer state (persists across app restarts)
- App updates and version compatibility checks
- Background sync indicator

Tauri commands expose these to the React frontend via typed IPC. The React layer calls `packages/api-client` for all server operations.

---

## Background jobs

Queue: BullMQ on Redis. One queue per job type.

| Job | Trigger |
|---|---|
| `email-sync` | Scheduled + manual |
| `email-triage` | After email sync |
| `calendar-sync` | Scheduled |
| `reminder-generation` | Daily |
| `semantic-run` | After note batch changes |
| `resource-health-check` | Scheduled per resource |
| `scheduled-http-job` | User-defined cron |
| `storage-cleanup` | Scheduled |
| `data-export` | User-triggered |
| `account-deletion-cleanup` | After deletion request |
| `usage-rollup` | Nightly |

All jobs: idempotent, retryable, workspace-scoped, carry `tenantId + workspaceId + idempotencyKey`.

---

## Billing and plans

| Plan | Modules included |
|---|---|
| **Starter** | Core, Notes, Kanban, Calendar, Timetable, Whiteboards, Pomodoro |
| **Pro** | Starter + AI Assistant, Semantic Graph, People Graph, Inbox Triage, Resources, Spreadsheets, Journal |
| **Publish add-on** | Public site, Blog, Projects, Timeline, Comments, Contact form |
| **Self-Hosted** | License-based, Pro features, manual ops |

Entitlement dimensions: module access, AI monthly budget (token count), storage (GB), workspaces, members, desktop installs, email accounts, resources, scheduled jobs, export frequency.

All plan checks go through the entitlement service — never inline in business logic.

---

## MVP scope (first paid release)

Single-user workspace. All Starter + Pro modules. Desktop activation. Configurable home dashboard. Data export. Billing via Stripe.

Explicitly **out of MVP:** shared/team workspaces, mobile companion app, offline-first sync, plugin marketplace, BYOK AI, Authenticator vault, OAuth email/calendar, advanced automation builder, self-hosted admin console.

---

## Security invariants

1. Every data access carries workspace isolation check.
2. Credentials (IMAP, OAuth tokens, AI provider keys, resource HMAC secrets, webhook secrets) encrypted at rest.
3. Application secrets separated from database credentials.
4. Audit logs written for: destructive mutations, high-risk assistant tool calls, credential access/rotation, device activation/revocation.
5. Public publishing routes share no session, no assistant access, no private data layer.
6. Rate limits on: auth endpoints, chat/SSE, file uploads, public endpoints.
7. Authenticator vault blocked until security review complete — do not implement any part of it.

---

## What is already scaffolded (as of 2026-05-22)

| Item | State |
|---|---|
| Turborepo + bun workspaces | Done |
| Biome + commitlint + husky + lint-staged | Done |
| `packages/typescript-config` (base, nextjs, react-library) | Done |
| `packages/ui` (shadcn primitives, Tailwind v4, 10 color themes, Button) | Done |
| `packages/types` | Stub (empty export) |
| `packages/db` | Stub (empty schema, drizzle.config present) |
| `packages/module-registry` | Stub (empty export) |
| `packages/api-client` | Stub (empty export) |
| `apps/api` (NestJS, empty AppModule) | Stub |
| `apps/web` (Next.js 16, empty page) | Stub |
| `apps/console` (Next.js 16, empty page) | Stub |
| `apps/marketing` (Next.js 16, empty page) | Stub |
| `apps/desktop` (Tauri 2 + Vite + React, empty App) | Stub |
| Branding assets (logo, favicons, icons) | Done across all apps |

---

## Implementation sequence (recommended)

1. **`packages/types`** — define all entity schemas with Zod first. Everything else derives types from here.
2. **`packages/db`** — Drizzle schema for Postgres product entities. Migrations.
3. **`apps/api`** — auth module first (tenant, user, workspace, session), then module registry wiring, then feature modules one at a time.
4. **`packages/module-registry`** — fill out module definitions as API modules are built.
5. **`packages/api-client`** — typed client generated/written as API routes stabilize.
6. **`apps/console`** — signup, login, workspace creation, billing, device activation.
7. **`apps/web`** — dashboard shell, module nav, then module screens.
8. **`apps/desktop`** — Tauri shell, Rust commands, then re-uses web React components.
9. **`apps/marketing`** — last; no blockers but lowest priority for MVP.
