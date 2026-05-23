# Helm

A customer-customizable life dashboard. Helm is a private personal dashboard, desktop app, AI assistant, knowledge base, productivity suite, relationship tracker, schedule manager, inbox triage, and optional public publishing layer — modular by design and desktop-first.

See [`docs/Helm — Design Spec (v0).md`](./docs/Helm%20%E2%80%94%20Design%20Spec%20%28v0%29.md) for the full product spec.

## Monorepo layout

```
apps/
  marketing/   Next.js 16 — public marketing site
  console/     Next.js 16 — signup, billing, workspace + module configuration, desktop activation
  web/         Next.js 16 — web dashboard (mirror of desktop surface)
  desktop/     Tauri 2 + Vite + React 19 — desktop app
  api/         NestJS 11 (Fastify) — backend services, assistant, jobs

packages/
  ui/                  Shared components, hooks, themes (Tailwind v4 + shadcn/ui)
  typescript-config/   Shared tsconfig presets
  types/               Shared Zod schemas + inferred TS types (API contract)
  module-registry/     Module declarations driving navigation, tools, settings, billing
  db/                  Postgres schema via Drizzle ORM
  api-client/          Typed client SDK consumed by frontends
```

## Stack

- **Bun 1.3** — package manager and runtime
- **Turborepo 2** — task runner
- **TypeScript 6** strict mode
- **Next.js 16** + **React 19** + **Tailwind CSS v4** + **shadcn/ui** — web frontends
- **Tauri 2** + **Vite 7** + **React 19** — desktop
- **NestJS 11** with **Fastify** — API
- **Drizzle ORM** + **Postgres 16** — relational data
- **Mongoose** + **MongoDB** — flexible per-module dashboard entities
- **Redis** + **BullMQ** — sessions, rate limits, background jobs
- **better-auth** — authentication
- **Zod 4** — runtime + static type validation
- **Stripe** — billing
- **Biome** — lint + format

## Getting started

```bash
bun install

# Run everything in dev
bun run dev

# Or a specific app
bun --filter marketing dev
bun --filter console dev
bun --filter web dev
bun --filter desktop dev
bun --filter api dev
```

Default dev ports: web `3000`, marketing `3001`, console `3002`, api `3003`, desktop dev server `1420`.

## Adding shadcn components

Run from the repo root, targeting the app you want:

```bash
bunx shadcn@latest add button -c apps/web
```

Components land in `packages/ui/src/components` and are importable from any app:

```tsx
import { Button } from "@workspace/ui/components/button";
```

## Theming

Base tokens live in `packages/ui/src/styles/globals.css`. Preset palettes are in `packages/ui/src/styles/themes/` (rose, coral, blush, amber, butter, mint, cyan, sky, lavender, plum). Themes are selected at runtime by setting `data-theme` on `<html>`; dark mode is orthogonal via `.dark` class (handled by `next-themes` in the Next apps).
