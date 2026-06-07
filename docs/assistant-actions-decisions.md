# Assistant Actions Decisions

Date: 2026-06-07

These decisions define how the assistant performs in-app actions. They supersede the reference app's pattern of per-task AI buttons (e.g. the disabled "AI actions" buttons in the notes module).

## The shift

The reference app exposed AI features as discrete buttons, each bound to a fixed task. Helm replaces this with a **single context-aware assistant** that:

- Is reachable everywhere as a popup (large panel on desktop, full-page overlay on mobile), in addition to its home surface.
- Holds a **continuous conversation** and is told, every turn, **where the user is and what they are looking at** (current module, route, active entity, selection).
- **Acts with zero friction** for non-destructive operations: it infers the target from context and executes (e.g. "create a note in this group" creates it in the currently-open group; "improve this based on X" rewrites the open note).
- Reuses the existing security model for destructive/outward-facing actions: `approval`-risk tools still suspend the turn for explicit user confirmation.

## Locked decisions

### Packages

- **`@workspace/assistant-tools`** — isomorphic tool *declarations* only (no handlers). Imported by both `apps/api` and `apps/web`/`apps/desktop`.
- **`@workspace/assistant-commands`** — isomorphic command *declarations* for client-only slash commands (`/new`, `/clear`, `/help`). Separate package; commands are not tools and never reach the LLM.
- Handlers are bound per-side, not in the shared packages.

### Tool declaration shape

```ts
{
  name: string            // e.g. "notes_create" — must match /^[a-zA-Z0-9_-]{1,128}$/
  description: string     // LLM-facing
  inputSchema: ZodType    // Zod is the source of truth
  side: "server" | "client"
  risk: "auto" | "approval"
  moduleId: string        // for module-enabled gating
}
```

- The Anthropic `Tool` definition (JSON Schema) is **derived** from `inputSchema`. Hand-written `Anthropic.Tool` objects are not allowed — this aligns with the repo rule that Zod is the source of truth.
- Tool **names must match Anthropic's pattern** `^[a-zA-Z0-9_-]{1,128}$`. Use snake_case with a module prefix (`notes_create`, `app_navigate`); dots/colons are rejected by the API with a 400.
- The three existing tools (`get_current_datetime`, `remember_fact`, `forget_all_facts`) are **migrated** into this registry under a core/assistant owner. No hand-written defs remain.

### Server vs client tools

- **Server tool** (`side: "server"`): runs in the assistant loop, in `apps/api`, against a service. Result is a normal `tool_result`.
- **Client tool** (`side: "client"`): touches live client state the server cannot reach — patching the open editor, navigating routes. The turn **suspends**, emits the call to the client, the client executes it locally and posts the result back to resume.

### DI-aware registry (API) — in scope now

- The current static `Map` in `apps/api/src/assistant/assistant-tools.ts` is replaced with a **DI-populated registry**. Each module registers its server-tool handler with its NestJS service injected (`notes_create` → `NotesService`).
- `AssistantToolContext` gains a service-resolution seam; tools stop hitting Mongo directly for module entities and go through services (per the architecture rule that all business logic lives in services).
- Tool availability is filtered per turn by enabled modules + entitlements, exactly as `module-registry.assistantTools` already declares abstractly.

### Client-tool round-trip

- New stream event `client_tool_call` (mirrors the existing `tool_approval_required` suspension).
- New resume endpoint `POST /api/assistant/.../tool-result` (mirrors `/approve`): accepts `{ conversationId, toolUseId, result, isError? }`, persists the `tool_result` block, and resumes `runConversation`.
- The web client owns a **client-tool dispatcher** keyed by tool name; module surfaces register handlers (e.g. notes registers `notes_rewrite_open`).

### Surface context

- New typed contract in `packages/types`:
  ```ts
  { module: string; route: string; entityType?: string; entityId?: string; selection?: string; payload?: Record<string, unknown> }
  ```
- Added to `StartAssistantChatInput`, attached **per turn**, woven into the system prompt for that run, and **stashed on the conversation doc** so resumes (`/approve`, `/tool-result`) keep the same grounding.
- Each module page publishes its context into a client-side context provider (React store); opening the assistant snapshots it.

### Conversation model

- **Single persistent thread** by default — continuity across surfaces.
- Slash commands are parsed **client-side** and never sent to the model. `/new` starts a fresh thread; `/help` lists commands. (`/clear` deferred — its semantics under a single persistent thread weren't settled.)

### Undo — deferred

- Out of scope for this pass. Zero-friction execution ships without an undo layer; destructive actions remain gated by `approval` risk.
- When added: client edits should ride the editor's native undo stack; server-destructive actions need soft-delete + restore or a declared inverse-action. Not built now.

## Status

Implemented (2026-06-07): all build-order steps below are in place and typecheck across the graph. Known follow-ups: per-workspace module gating of the tool manifest (client tools are currently offered globally and guided by surface context); the undo layer (deferred — destructive stays behind `approval`).

## Build order

1. `packages/assistant-tools` — declarations + Zod→JSON-Schema derivation; migrate the 3 existing tools.
2. `packages/assistant-commands` — command declarations.
3. `packages/types` — surface-context contract; extend `StartAssistantChatInput`; `client_tool_call` event; tool-result input schema.
4. `apps/api` — DI-aware registry, per-module server-tool registration, client-tool suspension + `/tool-result` endpoint, context in system prompt.
5. `packages/api-client` — `tool-result` resume; context passthrough.
6. `apps/web` — context provider, assistant popup/overlay, client-tool dispatcher, slash-command parsing; remove the disabled notes AI buttons.
7. First real module tools: `notes_create` (server) + `notes_rewrite_open` (client) as the reference implementation.

### Client-tool risk gate

- **No gate (with mandatory exceptions).** Client tools execute with true zero friction, including content-overwriting tools like `notes_rewrite_open`. There is no client-side confirm/diff step this pass. The user's only safety net for rewrites is re-prompting or closing without saving until the undo layer lands. **However, high-risk actions always require explicit user confirmation regardless of whether they are client-side or server-side.** High-risk actions include: delete operations, sending email, rebooting or restarting resources or services, rotating tokens, and publishing public content.
- Only the server `approval` risk remains, for genuinely destructive/outward-facing server tools.

## Notes tool suite (2026-06-07)

The notes module now exposes a full server-tool suite (handlers in `apps/api/src/notes/notes-assistant-tools.ts`, declarations in `packages/assistant-tools`), all backed by `NotesService` — no tool hits Mongo directly:

| Tool | Side | Risk | Service |
|---|---|---|---|
| `notes_list` | server | auto | `list` (compact rows, capped 1–50) |
| `notes_get` | server | auto | `get` (full body, truncated at 20k chars) |
| `notes_create` | server | auto | `create` |
| `notes_update` | server | auto | `update` (reversible) |
| `notes_delete` | server | approval | `delete` (soft-delete) |
| `notes_list_groups` | server | auto | `folders` |
| `notes_create_group` | server | auto | `createGroup` |
| `notes_update_group` | server | auto | `updateGroup` |
| `notes_delete_group` | server | approval | `deleteGroup` |
| `notes_list_tags` | server | auto | `tags` |
| `notes_summarize` | server | auto | `get` + `LlmService.complete` |
| `notes_rewrite_open` | client | auto | open editor |

- **Risk:** only the two destructive server tools (`notes_delete`, `notes_delete_group`) carry `approval`. Updates are reversible (revisioned) and stay `auto`.
- **Context budget:** list returns compact rows (200-char snippet) with a `total`; reach for `notes_get` for a single full body. This keeps large workspaces from flooding the model context.

### LLM-in-tool seam

`AssistantToolHandlerContext` carries `llm: LlmService` (passed from `AssistantStreamService.execTool`). A tool can make its own model call with budget pre-check + usage recording handled — `notes_summarize` uses `ctx.llm.complete(...)` tagged `feature: "assistant"`. Use this seam for any tool whose result needs a model (summarize, classify, extract), rather than inlining an Anthropic client.

## Open / future

- Generalizing the context contract enough that calendar/kanban/people surfaces reuse it without per-module special-casing.
