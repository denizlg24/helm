# Helm — Customer-Customizable Life Dashboard

**Date:** 2026-05-21
**Status:** Draft v0 — design spec, pre-implementation
**Codename:** Helm (you steer your own life from one console)

---

## Why this name?

"Helm" frames the product as the place a user steers from — a personal command surface over notes, tasks, people, schedule, inbox, infra, and publishing. It's short, brandable, easy to type into a CLI, evokes control without sounding like another "productivity suite", and pairs well with module/template names (Helm Pro, Helm Publish, Helm Self-Hosted, Helm Desktop).

---

## Purpose

Helm is a greenfield product: a customer-customizable life dashboard that people can buy, activate, and shape around their own daily systems. The product combines a private personal dashboard, desktop app, AI assistant, knowledge base, productivity tools, relationship tracking, schedule management, inbox triage, resource monitoring, and optional public publishing.

The system should feel like a **personal operating system**, not a generic productivity suite. Customers choose modules, connect their own services, set their own defaults, and use the assistant to read, organize, and act on their data.

---

## Product Principles

- **Private by default** — life data is never public unless a publishing module explicitly exposes it.
- **Modular by design** — every major feature can be enabled, disabled, configured, and billed independently.
- **Desktop-first, web-capable** — the desktop app is the primary power-user surface; the web app supports setup, account management, and dashboard access.
- **AI as an operator** — the assistant can search, summarize, create, update, and coordinate across modules with clear approval and audit rules.
- **Local where it matters** — desktop-only capabilities such as local embeddings, notifications, file exports, and timers should work without forcing all behavior through the cloud.
- **Data portability** — users can export and delete their workspace data.

---

## Target Users

- Developers and operators managing projects, servers, notes, and automation.
- Students managing classes, notes, schedules, assignments, and people.
- Founders and freelancers managing tasks, relationships, email, projects, and publishing.
- Writers and researchers managing notes, sources, drafts, links, and idea graphs.
- Home lab users monitoring resources, services, jobs, and uptime.
- Personal CRM users tracking contacts, relationships, birthdays, conversations, and follow-ups.

---

## Product Model

The product is organized around **workspaces**.

- `Tenant` — paying customer or organization.
- `Workspace` — one private life dashboard.
- `User` — can belong to one or more workspaces.
- `WorkspaceMember` — role and permissions inside a workspace.
- `ModuleConfig` — which modules are enabled and how they behave.
- `Entitlement` — plan limits, feature access, AI budget, storage, device count.
- `AppInstall` — an activated desktop app on one device.

**MVP scope:** single-user workspaces only. Shared family/team workspaces come after the solo experience is stable.

---

## Module Catalog

### Core
- Home dashboard with configurable widgets.
- Settings and workspace preferences.
- AI assistant and conversation history.
- LLM usage, budget tracking, and model selection.
- API tokens and device management.
- Data export and account deletion.

### Knowledge
- Notes (markdown, URLs, metadata, tags, groups).
- Knowledge graph with note groups, semantic links, suggestions.
- Local semantic embeddings from the desktop client.
- Whiteboards with drawings and embedded widgets.
- Spreadsheets with import, editing, metadata, export.

### Work
- Kanban boards, columns, cards, labels, priorities, due dates, reorder flows.
- Calendar events with statuses, links, reminders, external sync hooks.
- Weekly timetable for recurring routines.
- Journal entries connected to notes, events, and whiteboards.
- Pomodoro timer with local session tracking and desktop notifications.

### Relationships
- People records (birthdays, notes, photos, contact fields, websites, addresses, socials).
- Person groups and relationship graph.
- Birthday and reminder generation.
- Follow-up prompts and relationship notes.

### Communications
- Contact submissions and reply workflow.
- IMAP inbox accounts.
- Email sync and message body retrieval.
- AI email triage: categories, summaries, task suggestions, calendar suggestions.
- Review / accept / dismiss / archive / delete flows.

### Infrastructure
- Resource inventory for servers, devices, APIs, services.
- Resource agent enrollment.
- Health checks, uptime history, CPU/RAM/disk metrics, service lists.
- Safe resource commands (reboot, service restart).
- Scheduled HTTP jobs through resource capabilities.

### Security
- Scoped API tokens.
- Audit log.
- Secret management for integrations.
- Authenticator vault (gated on a full security review of seed encryption, recovery, and device trust).

### Publish
- Optional public website module.
- Blog posts, projects, timeline, now page, comments, contact form, public resource status.
- **Disabled by default and isolated from private dashboard data.**

---

## Module Registry

Every module declares:

- `key`
- name and icon
- navigation entries
- dashboard widgets
- permissions
- API scopes
- assistant tools
- background jobs
- settings schema
- import/export handlers
- storage usage categories
- entitlement requirements
- dependencies

The module registry drives navigation, command palette, assistant tool availability, onboarding templates, billing gates, export coverage, and settings screens.

---

## Customization

### Workspace Templates
Preselect modules, widgets, default views, and assistant behavior:
- Developer
- Student
- Founder
- Freelancer
- Writer / researcher
- Home lab operator
- Personal CRM

### Workspace Settings (sync across devices)
Enabled modules, dashboard layout, module-specific settings, integrations, AI model preferences, AI monthly budget, approval policy for assistant writes, notification channels, publishing settings.

### Local Device Settings (stay local)
Default page, sidebar state, local download dirs, desktop notification prefs, local embedding provider, local cache and model storage.

---

## Onboarding Flow

1. User creates an account or signs in.
2. User purchases or starts a trial.
3. System creates a tenant and first workspace.
4. User chooses a workspace template.
5. User enables / disables modules.
6. User connects optional integrations.
7. User downloads and activates the desktop app.
8. Desktop app receives workspace list, enabled modules, API endpoint, and device token.
9. User lands on their selected default dashboard.

Desktop activation uses browser-based sign-in or a short-lived device code. **Long-lived manual API keys are for automation, not normal app login.**

---

## Core Data Model

### Product-level entities
`Tenant`, `Workspace`, `User`, `WorkspaceMember`, `Subscription`, `Entitlement`, `ModuleConfig`, `DashboardLayout`, `AppInstall`, `ApiToken`, `IntegrationCredential`, `AuditLog`

### Dashboard entities
`Conversation`, `LlmUsage`, `Note`, `NoteGroup`, `NoteEdge`, `NoteEmbedding`, `SemanticRun`, `SemanticSuggestion`, `Whiteboard`, `Spreadsheet`, `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `CalendarEvent`, `CalendarSettings`, `TimetableEntry`, `JournalEntry`, `Person`, `PersonGroup`, `PersonEdge`, `ContactSubmission`, `EmailAccount`, `Email`, `EmailTriage`, `TriageSettings`, `Resource`, `ResourceCapability`, `HealthCheckLog`, `ScheduledJob`, `AuthenticatorAccount`, `PublishPost`, `PublishProject`, `PublishTimelineItem`, `PublishComment`

Every dashboard entity belongs to a workspace. Workspace-scoped singleton settings (calendar settings, triage settings) use stable IDs within the workspace, not global singleton documents.

---

## Permissions

Role-based with scoped overrides.

| Role | Power |
|---|---|
| **Owner** | billing, deletion, export, all settings, all module access |
| **Admin** | module management + all workspace data; no billing ownership transfer |
| **Editor** | create / update most workspace data |
| **Viewer** | read-only |
| **Automation** | API-token-only role with explicit scopes |
| **Resource Agent** | narrow machine role for health and command endpoints |

Permission checks must include: workspace membership, module enabled state, role permission, token scope, entitlement, write-approval policy for assistant actions.

---

## Assistant

Workspace-aware operator over enabled modules.

**Capabilities**
- Answer general questions.
- Search notes, people, tasks, calendar, emails, resources, publishing data.
- Create and update notes, tasks, calendar events, people, resources, posts, whiteboards.
- Summarize inbox and triage action items.
- Generate project drafts from connected repositories.
- Explain resource health and suggest operational actions.
- Run local semantic classification through the desktop client.

**Rules**
- Tool availability is generated from enabled modules and permissions.
- Read tools execute immediately.
- Write tools use approval policy based on module, action risk, role, and user setting.
- High-risk actions **always** require confirmation: delete, send email, reboot resource, restart service, rotate token, publish public content.
- Every tool call is logged.
- Token usage is tracked by workspace, user, model, conversation, source.
- Budget checks happen **before** each model request.

---

## APIs and Services

All product APIs must:

- Require authenticated request context.
- Resolve tenant, workspace, user, role, scopes, enabled modules, entitlement before business logic runs.
- Validate input with typed schemas.
- Return structured errors.
- Paginate list endpoints.
- Write audit events for sensitive mutations.
- Use the same service methods for HTTP routes, assistant tools, and background jobs.

**Service areas:** workspace, module, entitlement, dashboard, assistant, notes, semantic, people, calendar, kanban, email, triage, resource, storage, publishing, audit.

---

## Desktop App

Primary daily-use surface.

**Required capabilities**
- Account sign-in and device activation.
- Workspace switching.
- Module-driven navigation.
- Command palette.
- Assistant chat with streaming responses and tool approval UI.
- Local semantic embedding runtime.
- Local Pomodoro timer and session storage.
- Desktop notifications.
- File dialogs and export destinations.
- Background task indicator.
- App updates and version compatibility checks.

**No manual API-key pasting during normal setup.**

---

## Web App

Supports: signup / login, billing and subscription management, workspace creation, desktop activation, module configuration, integration setup, basic dashboard usage, public publishing management, data export and deletion.

The web app shares most module screens with the desktop app where practical; desktop-only features degrade cleanly.

---

## Background Jobs

Jobs must be **idempotent, retryable, observable, workspace-scoped**.

**Job types:** email sync, email triage, calendar sync, reminder generation, semantic runs, resource health checks, scheduled HTTP jobs, storage cleanup, data export, account deletion cleanup, usage rollups.

**Payload fields:** `tenantId`, `workspaceId`, `jobType`, source entity ID, idempotency key, attempt count, scheduled time, timeout, result status.

---

## Integrations

**Connector categories:** Email (IMAP), Calendar/holiday providers, Slack/webhook channels, Object storage, GitHub / repository providers, AI providers, Resource agents, Scheduled job providers.

**Each connector exposes:** setup flow, connection test, encrypted credentials, status, last sync/result, rotation/reconnect flow, audit events, module dependency metadata.

---

## Privacy and Security

- Workspace isolation on every data access.
- Encrypted credentials for IMAP, OAuth, AI provider keys, resource HMAC secrets, TOTP seeds, webhook secrets.
- Application secrets separated from database credentials.
- Secret rotation support.
- Audit logs for destructive actions and high-risk assistant tools.
- Exportable workspace data.
- Workspace deletion with async cleanup.
- Backup and restore testing.
- Public publishing isolation.
- Rate limits on auth, chat, uploads, public endpoints.

The authenticator module stays gated until seed encryption, recovery, and device trust rules are complete.

---

## Billing and Entitlements

| Plan | Includes |
|---|---|
| **Starter** | core dashboard, notes, kanban, calendar, timetable, whiteboards, Pomodoro |
| **Pro** | AI assistant, semantic graph, people graph, inbox triage, resources, spreadsheets |
| **Publish Add-on** | public website, blog, projects, timeline, comments, contact form |
| **Self-Hosted** | license-based deployment with Pro features and manual ops |

**Entitlement dimensions:** module access, AI monthly budget, storage, workspaces, members, desktop installs, email accounts, resources, scheduled jobs, export frequency.

Plan checks centralize in the entitlement service and module registry.

---

## MVP

First paid version targets a single-user managed workspace with:

- Desktop app activation.
- Configurable home dashboard.
- AI assistant with write approvals.
- Notes and semantic graph.
- Kanban.
- Calendar, timetable, journal.
- People graph.
- Inbox and triage.
- Whiteboards.
- Resources.
- Spreadsheets.
- Pomodoro.
- Settings.
- Billing.
- Data export.

The Publish module is optional and disabled by default.

---

## Later Releases

Shared workspaces · team roles and comments · mobile companion app · full offline-first sync · plugin marketplace · more AI providers · OAuth-based email/calendar providers · advanced automation builder · self-hosted admin console · public template marketplace.

---

## Proposed Tech Stack (May 2026)

Picked based on current stable releases as of this doc's date. Versions should be pinned in `package.json` / `Cargo.toml` and reviewed quarterly.

### Web app (marketing, billing, web dashboard)
- **Next.js 16.2.6 LTS** (App Router, React Server Components, Turbopack stable for dev, stable Adapter API). Current LTS as of May 7, 2026 — Next.js 15 LTS support ends Oct 21, 2026, so new projects should start on 16.
- **React 19** (paired with Next.js 16).
- **TypeScript 5.x** strict mode.
- **Tailwind CSS v4** + **shadcn/ui** for component primitives.
- **TanStack Query** for client-side data.
- **next-auth / Auth.js** for OAuth sign-in (web) and device-code activation handshake.

### Desktop app
- **Tauri 2.x** (latest stable line, currently 2.11.x). Tauri 2 stable shipped Oct 2, 2024, adds mobile (iOS/Android), the new ACL-based capability/permissions system, and a faster custom-protocol IPC. Same React/Next.js UI is re-used inside Tauri's webview.
- **Rust** for the desktop core (file dialogs, notifications, local embeddings, Pomodoro timer state, secure storage via OS keychain).
- **Local embedding runtime:** `fastembed-rs` or ONNX Runtime via Rust; model files cached under per-device app data.

### Backend API
- **NestJS 11.1.x** on Node.js 22 LTS. Production-ready, opinionated DI/module structure that fits the Helm module-registry pattern. Currently on the v11 line (11.1.21 latest); v12 (full ESM + Vitest + Rspack) is on the roadmap for Q3 2026 — pin v11 for MVP and plan an upgrade lane.
- **Fastify** adapter under Nest for throughput on chat/streaming endpoints.
- **Zod** (or NestJS pipes + `class-validator`) for typed schema validation.
- **Drizzle ORM** (Postgres) or **Prisma** for product-level relational data (tenants, subscriptions, entitlements, audit logs).
- **MongoDB / Mongoose** for dashboard entities that benefit from flexible per-module schemas (notes, kanban, whiteboards, journal).
- **Redis** for sessions, rate limits, idempotency keys, pub-sub.
- **BullMQ** (Redis) for background jobs — idempotent, retryable, observable; one queue per job type per worker pool.
- **OpenTelemetry** for traces/metrics across HTTP, jobs, and assistant tool calls.

### Assistant
- Provider-agnostic LLM gateway (Anthropic, OpenAI, local via Ollama for self-hosted).
- Tool registry generated at request time from enabled modules + permissions + token scopes.
- Streaming over Server-Sent Events to web and desktop.
- Approval UI lives in the desktop app and web dashboard; approvals are signed and audited.

### Infra & ops
- **Postgres 16** (managed), **MongoDB 7**, **Redis 7**.
- **S3-compatible object storage** for whiteboard assets, spreadsheet imports, exports.
- **Docker + GitHub Actions** for CI/CD. Self-hosted bundle ships as a `docker compose` reference plus a license-aware build.
- **Stripe** for billing, with webhook → entitlement reconciliation.
- **Slack / SMTP / webhook** notification channels.

### Publish (when enabled)
- Optional public site served from the same Next.js app but isolated tenant-scoped routes and a separate public read-only data layer (no shared session). Strict CSP; no assistant access.

---

## Open Questions

- Is the first release desktop-only, or should the web app expose all modules?
- AI usage: platform-managed, bring-your-own-key, or both?
- How much of the product should work offline?
- Which modules belong in the base plan vs Pro?
- Should Publish be an add-on or a separate product?
- What export formats should each module support?
- What is the minimum acceptable security model for the authenticator module?

---

## Acceptance Criteria

- A customer can buy → create a workspace → activate the desktop app → start using the dashboard **without manual developer setup**.
- A customer can choose a template and enable / disable modules.
- Navigation, assistant tools, settings, jobs, and billing gates reflect enabled modules.
- Workspace data is isolated, exportable, and deletable.
- High-risk assistant actions require approval and create audit logs.
- Desktop-local features work without exposing local-only data unnecessarily.
- Public publishing features cannot accidentally expose private dashboard data.
