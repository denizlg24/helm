# Helm — Agent Context

Read this before working on any part of this repo. It gives you the mental model, decisions, and invariants you need to avoid re-deriving things that are already settled.

---

## What this product is

Helm is a **customer-customizable personal life dashboard** — a private personal operating system that combines notes, tasks, calendar, people (CRM), inbox triage, resource monitoring, AI assistant, and optional public publishing. Users buy it, activate it, choose modules, connect their services, and steer their daily life from a single surface.

Full product spec: `docs/design-doc-v1.md` (read this if you need depth on any area).
Original concept doc: `docs/Helm — Design Spec (v0).md`

---

## Repo layout

```
apps/api          NestJS 11 + Fastify — all business logic lives here
apps/web          Next.js 16 — authenticated module dashboard (daily use)
apps/console      Next.js 16 — account, billing, workspace setup, onboarding
apps/marketing    Next.js 16 — public marketing site (no auth dependency)
apps/desktop      Tauri 2 + Vite + React — primary desktop surface
  └─ src-tauri    Rust core (keychain, file dialogs, notifications, embeddings, Pomodoro)

packages/types          Zod schemas + inferred TS types for all entities (source of truth)
packages/db             Drizzle ORM + Postgres schema (product-level entities only)
packages/module-registry Module capability declarations (nav, tools, jobs, settings, entitlements)
packages/api-client     Typed HTTP client used by web, console, desktop
packages/ui             shadcn/ui + Tailwind v4 components + 10 color themes
packages/typescript-config Shared TS configs (base, nextjs, react-library)
```

---

## Toolchain rules

- **Package manager:** `bun` always. Never `npm` or `yarn`.
- **TypeScript:** strict mode, TS 6.x. Never cast to `any` or `unknown` to silence errors — fix the types.
- **Linter/formatter:** Biome 2.x. No ESLint, no Prettier.
- **Commits:** conventional commits enforced by commitlint + husky.
- **Build:** `turbo` orchestrates all tasks across workspaces.

---

## Architecture rules (non-negotiable)

### API
- Business logic lives in **service classes** only. Controllers, assistant tools, and job processors all call services — never duplicate logic.
- Every authenticated request resolves: JWT → userId → workspace membership → token scopes → module enabled → entitlement → business logic → audit (if sensitive).
- All plan/entitlement checks go through the entitlement service. Never inline `if plan === 'pro'` in feature code.
- Zod validation on every input boundary.

### Database
- **Postgres (Drizzle):** product-level entities — tenants, workspaces, users, subscriptions, entitlements, module config, installs, tokens, credentials, audit log, LLM usage.
- **MongoDB (Mongoose):** all dashboard/module entities — notes, kanban, calendar, people, email, resources, publishing, etc.
- Every MongoDB document **must** carry `workspaceId` (required, indexed). Never query MongoDB without a workspace filter.
- No cross-workspace queries. Ever.

### Modules
- A module is a feature flag + capability declaration, not a separate deployment.
- Disabled module = 403 on its endpoints + removed from nav + removed from assistant tools + jobs skipped.
- Module capability declarations live in `packages/module-registry`. Runtime enabled state comes from `ModuleConfig` in Postgres.

### Desktop
- The Tauri frontend is **Vite + React**, not Next.js. Do not add Next.js to the desktop app.
- Rust handles: keychain, file dialogs, desktop notifications, local embeddings, Pomodoro timer state, app updates.
- React frontend uses `packages/api-client` for all server calls.
- No manual API-key pasting during device setup. Activation is browser OAuth or device-code flow.

### Types
- `packages/types` is the single source of truth for all entity shapes.
- Define Zod schema first, infer TypeScript type from it. Both API and client import from here.

### UI
- All shared components go in `packages/ui`.
- Web and desktop reuse the same React components where practical.
- 10 color themes already exist in `packages/ui/src/styles/themes/`. Workspace theme is a user setting.
- Minimalistic / Editorial design pattern SaaS-inspired.

---

## Security invariants — do not violate these

1. Workspace isolation check on every data access.
2. All credentials encrypted at rest (IMAP, OAuth, AI keys, HMAC secrets, webhook secrets).
3. Audit log written for: destructive mutations, high-risk assistant actions, credential access, device activation/revocation.
4. Public publishing routes: no shared session, no assistant access, no private data.
5. **Authenticator vault is blocked** — do not implement any part of it until the security design review is complete.
6. High-risk assistant actions always require user confirmation: delete, send email, reboot resource, restart service, rotate token, publish public content.

---

## Current state (as of 2026-05-23)

Scaffolded Authentication.

**Recommended build order:**
1. `packages/types` — Zod schemas for all entities
2. `packages/db` — Drizzle schema + migrations
3. `apps/api` — auth module first, then module registry, then feature modules
4. `packages/module-registry` — fill as API modules are built
5. `packages/api-client` — as API stabilizes
6. `apps/console` — signup, login, billing, onboarding
7. `apps/web` — dashboard shell, then module screens
8. `apps/desktop` — Tauri shell, Rust commands, reuse web components
9. `apps/marketing` — last

---

## MVP scope

Single-user workspace. Starter + Pro modules. Desktop activation. Configurable home dashboard. Data export. Stripe billing.

**Out of MVP:** shared workspaces, mobile, offline-first sync, plugin marketplace, BYOK AI, Authenticator vault, OAuth email/calendar, automation builder, self-hosted admin console.

---

## Module catalog (quick reference)

| Group | Modules |
|---|---|
| Core | Home dashboard, Settings, AI Assistant, LLM usage, API tokens, Data export |
| Knowledge | Notes, Knowledge graph, Whiteboards, Spreadsheets |
| Work | Kanban, Calendar, Timetable, Journal, Pomodoro |
| Relationships | People, Person groups, Reminders |
| Communications | IMAP inbox, Email triage |
| Infrastructure | Resource inventory, Health checks, Scheduled jobs |
| Publish (add-on) | Blog, Projects, Timeline, Now page, Comments, Contact form |

---

## Key files to read when starting a task

| Task area | Read first |
|---|---|
| Any feature work | `docs/design-doc-v1.md` relevant section |
| API endpoint | `apps/api/src/app.module.ts`, relevant service/controller |
| DB schema | `packages/db/src/schema.ts` |
| Types/validation | `packages/types/src/index.ts` |
| Module capability | `packages/module-registry/src/index.ts` |
| UI component | `packages/ui/src/components/` |
| Desktop feature | `apps/desktop/src/App.tsx`, `apps/desktop/src-tauri/src/lib.rs` |
