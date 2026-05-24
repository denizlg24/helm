# Helm — Design Spec (v2)

**Date:** 2026-05-24
**Status:** Active — replaces v1
**Codename:** Helm

---

## What this document is

v2 updates the current implementation state and locks the billing decision on Polar.sh instead of Stripe. It keeps the product architecture from v1 unless this document explicitly changes it.

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
| Billing provider? | Polar.sh. Use Polar Checkout, Customer Portal, and webhooks for subscriptions, add-ons, and credit grants. Stripe is no longer the target billing provider. |

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
│   ├── auth/                  ← Better Auth server/client config, plugins, permissions, env parsing
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
| Cache / rate limits / pub-sub | Redis 7 |
| Job queue | BullMQ (one queue per job type) |
| Observability | OpenTelemetry |

### Database split

**Postgres (Drizzle)** — product-level entities with strict relational guarantees:
`User`, `Session`, `Account`, `Organization`, `Member`, `Invitation`, `ApiKey`, `DeviceCode`, `Jwks`, `Tenant`, `Workspace`, `Subscription`, `Entitlement`, `ModuleConfig`, `Device`, `AuditLog`, `LlmUsage`, `UsageCredit`

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

Current implemented schemas cover workspace, module config, entitlement, auth context, device activation, API tokens, audit logs, LLM usage, usage credit grants, and usage summaries. Module-specific dashboard entities are still pending.

### `packages/auth`

Shared Better Auth configuration used by API, console, web, and desktop. It owns:
- Drizzle adapter wiring
- Email/password auth
- Optional Google OAuth provider
- Organization/workspace roles (`owner`, `admin`, `member`)
- API key plugin with hashing and rate limits
- Bearer token support
- Device authorization flow for desktop activation
- JWT support
- Shared auth client helpers, constants, env parsing, and permissions

### `packages/db`

Drizzle schema + migration files + db client factory. Only Postgres product-level tables live here. Exported as a typed client consumed by `apps/api`.

Current schema includes Better Auth tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `api_key`, `device_code`, `jwks`) plus Helm product tables (`tenants`, `workspaces`, `module_configs`, `entitlements`, `subscriptions`, `devices`, `audit_log`, `llm_usage`, `usage_credits`).

Subscription external-id columns currently still use legacy `stripe_*` names in code and migrations. Rename them to Polar-oriented names during the Polar billing implementation before production data exists.

### `packages/module-registry`

Module definitions. Each module exports a `ModuleDefinition` object with:
- `id: string`
- `name: string`
- `group: ModuleGroup`
- `nav: { label: string; href: string }`
- `requiredScopes: ApiScope[]`
- `entitlementRequirements: string[]`
- `assistantTools: string[]`
- `jobs: string[]`
- `settingsSchema: ZodSchema`

The registry is consumed by: API (navigation, tools, jobs), web/console (nav rendering, settings screens), billing gates (entitlement checks). Current definitions cover Home, Settings, AI Assistant, API tokens, Data export, Notes, Kanban, Calendar, Pomodoro, People, IMAP inbox, and Resource inventory.

### `packages/api-client`

Typed HTTP client generated from NestJS controller signatures (or hand-written if codegen is not practical for MVP). Used by `apps/web`, `apps/console`, `apps/desktop`. Handles auth headers, token refresh, and typed errors.

Current client modules are hand-written for user, workspace, devices, and API tokens. Usage/billing and module-config clients are still pending.

### `packages/ui`

shadcn/ui component primitives + Tailwind v4 globals. Multiple color themes already present (rose, coral, amber, butter, mint, sky, cyan, lavender, plum, blush). Workspace theme preference stored in workspace settings and applied at runtime.

---

## Authentication and device activation

### Web (console + web dashboard)
- Better Auth with email/password and optional Google OAuth.
- Better Auth is mounted by the Nest/Fastify API under the shared auth base path.
- Better Auth stores auth state in Postgres through the Drizzle adapter.
- Organization plugin models the workspace membership boundary; Helm mirrors product workspace metadata in the `workspaces` table.

### Desktop
- Device activation via browser-based sign-in (OAuth flow that returns a device token).
- Device code flow as fallback (short-lived code, user approves in console).
- Long-lived API keys are for automation roles only — never used for normal app login.
- Device token stored in OS keychain via Tauri secure storage.

### API tokens
- Scoped to workspace + explicit API scopes.
- Issued to `Automation` and `Resource Agent` roles.
- Displayed once on creation; stored hashed.
- Backed by the Better Auth API key plugin with default rate limiting enabled.

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

Billing provider: **Polar.sh**. Use Polar Checkout for plan purchase and add-on purchase, Polar Customer Portal for subscription management, and Polar webhooks to reconcile subscription status, plan changes, cancellations, add-ons, and usage-credit grants into Helm entitlements.

Stripe is not part of the target architecture. Any remaining `stripe_*` identifiers in source code are legacy scaffolding names and should be renamed as part of the Polar integration.

| Plan | Modules included |
|---|---|
| **Starter** | Core, Notes, Kanban, Calendar, Timetable, Whiteboards, Pomodoro |
| **Pro** | Starter + AI Assistant, Semantic Graph, People Graph, Inbox Triage, Resources, Spreadsheets, Journal |
| **Publish add-on** | Public site, Blog, Projects, Timeline, Comments, Contact form |
| **Self-Hosted** | License-based, Pro features, manual ops |

Entitlement dimensions: module access, AI monthly budget (USD cents), prepaid usage credits (USD cents), storage (GB), workspaces, members, desktop installs, email accounts, resources, scheduled jobs, export frequency.

All plan checks go through the entitlement service — never inline in business logic. Polar webhooks update subscription rows, grant usage credits when purchased, and write the entitlement rows consumed by runtime guards.

---

## MVP scope (first paid release)

Single-user workspace. All Starter + Pro modules. Desktop activation. Configurable home dashboard. Data export. Billing via Polar.sh.

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

## Current implementation state (as of 2026-05-24)

| Item | State |
|---|---|
| Turborepo + bun workspaces | Done |
| Biome + commitlint + husky + lint-staged | Done |
| `packages/typescript-config` (base, nextjs, react-library) | Done |
| `packages/ui` (shadcn primitives, Tailwind v4, 10 color themes, Button) | Done |
| `packages/auth` | Implemented shared Better Auth server/client config, roles, API keys, bearer, device authorization, JWT, env parsing |
| `packages/types` | Implemented core product/auth schemas; module entity schemas pending |
| `packages/db` | Implemented Better Auth + Helm product tables, Drizzle migrations, DB client; Polar rename/integration pending |
| `packages/module-registry` | Implemented initial module definitions and core MVP module ids |
| `packages/api-client` | Implemented request client plus user, workspace, devices, API-token modules |
| `apps/api` | Implemented Nest/Fastify bootstrap, Better Auth mount, DB/Redis modules, auth guards, workspace/device/API-token services, entitlements, module config, audit, LLM usage and budget tracking |
| `apps/web` | Implemented Better Auth client wiring, session proxy, sign-in page, root page shell |
| `apps/console` | Implemented Better Auth client wiring, sign-in/sign-up pages, workspace onboarding route, device approval route, settings route shells |
| `apps/marketing` (Next.js 16, empty page) | Stub |
| `apps/desktop` | Implemented Tauri 2 + Vite + React shell, Better Auth client wiring, API client usage, OS keychain commands |
| Branding assets (logo, favicons, icons) | Done across all apps |
| Polar billing | Decision locked; implementation pending |
| MongoDB module entities | Not started |
| BullMQ jobs | Not started |

---

## Implementation sequence (recommended from current state)

1. **Polar billing foundation** — add Polar SDK/client config, rename legacy subscription columns, implement checkout, portal, webhook reconciliation, and entitlement updates.
2. **Console onboarding completion** — connect workspace creation, module configuration, device approval, API-token management, and billing screens to the API client.
3. **API guard hardening** — finish shared guard chain behavior for workspace membership, scopes, module enabled state, entitlements, usage budget, and audit coverage.
4. **`packages/types` module schemas** — add Zod schemas for the first dashboard modules before API implementation.
5. **MongoDB module foundation** — add Mongoose connection, workspace-scoped model patterns, and indexes.
6. **First feature modules** — implement Notes, Kanban, Calendar, Pomodoro, People, IMAP inbox, and Resources one at a time, updating `packages/module-registry` and `packages/api-client` as routes stabilize.
7. **Web dashboard shell** — add enabled-module navigation, home layout, theme application, and module screen mounting.
8. **Desktop daily surface** — build activation flow, API-client session handoff, keychain-backed token storage, and desktop-specific commands beyond keychain.
9. **Background jobs** — introduce BullMQ queues after the first modules need sync, triage, health checks, semantic runs, exports, and usage rollups.
10. **Marketing** — last; no blockers but lowest priority for MVP.
