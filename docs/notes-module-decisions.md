# Notes Module Decisions

Date: 2026-06-04

These decisions supersede older references to a separate semantic graph module or local embedding runtime for notes.

## Locked Decisions

- The notes module includes both **Graph view** and **Folder view**. There is no separate knowledge graph or semantic graph module for the notes UX.
- Folder view replaces the reference app's list view. Each note group is presented as a folder; nested groups become nested folders.
- Graph view is part of the normal notes module entitlement and must be available whenever notes are enabled.
- Current "semantic" behavior is not semantic search or embeddings. It is LLM-assisted note summarization, metadata extraction, grouping suggestions, tag suggestions, and relationship suggestions.
- Do not implement `NoteEmbedding`, local embedding model downloads, vector search, or embedding-backed semantic sync for MVP.
- Do not name the MVP job/service/UI "semantic" in new code. Prefer `note-intelligence`, `note-classification`, or `note-organizer` language.
- LLM-suggested groups, tags, summaries, and edges should be reviewable. The system may suggest organization, but should not silently reorganize notes unless a later explicit auto-apply setting is designed.
- If high-quality embeddings become practical later, introduce them as a new capability with clear naming and storage design. Only call it semantic once embeddings or another real semantic retrieval/ranking mechanism exists.

## MVP Notes UX

- Capture markdown notes and URL notes.
- Store URL metadata: title, description, site name, favicon, image, published date when available.
- Support tags, archived/open status, class/type metadata, and hierarchical groups.
- Provide two primary browse modes:
  - **Folder view:** group tree/folders, folder contents, ungrouped notes, archived filter.
  - **Graph view:** note nodes, group/folder clusters, and explicit or LLM-suggested note edges.
- Keep search/filter available across both views.
- Keep markdown editing with preview and export.
- Allow paste-to-import URL when the user is not editing text.

## Alternatives To Embeddings

These are acceptable MVP alternatives to embedding-backed semantics:

- **LLM organizer pass:** prompt an LLM with existing group names, note title/content/metadata, and ask for summary, tags, candidate groups, and related-note candidates. Keep results as suggestions.
- **Rules plus LLM fallback:** deterministic URL/domain/tag/title rules first, then LLM only for unclear notes to reduce cost and noisy grouping.
- **Folder-first manual organization:** make moving notes between folders fast enough that AI suggestions are optional rather than core infrastructure.
- **Saved searches / smart folders:** query-backed folders such as "links", "articles", "recently edited", "ungrouped", or tag/status filters. These are deterministic and cheap.
- **Lightweight text similarity:** optional non-embedding matching using normalized titles, tags, domains, classes, and keyword overlap. Use it for candidate generation before sending a small set to the LLM.
- **LLM relationship suggestions:** ask the LLM to explain why two candidate notes are related, then create reviewable `NoteEdge` suggestions.

## Implementation Naming

Use these names unless a later design changes them:

- Service: `NotesService`
- Organizer/intelligence service: `NoteOrganizerService`
- Job: `note-organizer-run`
- Suggestions: `NoteSuggestion`
- Graph relation: `NoteEdge`

Avoid new `Semantic*` names for notes in MVP code.
