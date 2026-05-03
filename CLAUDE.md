# Släktforskning — Project Instructions

## ⚠️ Prime Directive: Data Fidelity

**The user's data is sacred. The DB holds exactly what the user authored — nothing inferred is added, nothing authored is silently removed.**

The genealogist authored what is in the database. Every other value is derived at read time from what they authored. This is non-negotiable, project-defining, never-violated.

**What is "inferred data":**
- Coordinates resolved from a place name via a gazetteer
- A "best guess" date computed from a `date_original` string
- A "looks like" value from a typo-tolerance heuristic
- A normalized version of a value when the original is preserved elsewhere
- ANY value an algorithm produced that the user did not type, click, or import

**The rule:**
- The DB stores **only** what the user actively wrote (UI, modal, picker, MCP tool call) or what was in the file they imported.
- The resolver / formatter / display layer computes inferred values **on demand**, every render, against the current gazetteers/rules. Users never see stale inference.
- Any code path that writes inferred output back to the DB is a bug. Catch yourself at the point of `places.update`, `events.update`, `INSERT INTO`, or any mutation — if the value being written wasn't authored by a human action *in this session*, stop.
- **Authored values are not discarded by side effect.** Hiding a field in the UI is not consent to null it out on save. If a value was written by a human action, it stays in the DB until *another* explicit human action removes it (an empty field, a "Clear" button, a delete). A mutation builder writes what the form says — it never second-guesses which fields the new entity-shape "should" have. Modal patterns like `cause: form.event_type === 'death' ? form.cause : null` discard authored data based on a UI mode change and are a Prime Directive violation.

**Why this matters:**
- Persisted inferences pin the database to a specific version of the inferring code. Improving the resolver/gazetteer/parser later doesn't fix old rows.
- The user can't tell what they authored vs what we made up. Their corrections are silently overwritten by our guesses.
- Genealogy is a long-term archive; future researchers depend on data fidelity, not whatever we thought was "helpful" in 2026.

**Allowed exceptions (these are not inferences — they are deterministic derivations of authored input):**
- `normalized_name` from `name` (lowercase + strip diacritics — pure function of the authored value, used only for SQL collation).
- `created_at` / `updated_at` timestamps.
- UUIDs.

**If a feature seems to need inferred persistence to work, it's the wrong design.** Compute on render. Cache in memory if needed for performance. Never write back to the DB.

This rule applies to: import paths, MCP tools, IPC handlers, Vue components, AI agents, scripts, migrations. Everywhere. No exceptions.

## ⚠️ Prime Directive (cont.): Round-Trip Fidelity

**The user must be able to leave with their data intact. Every authored field in the database must survive a GEDCOM 5.5.1 *or* 7.0 round-trip — or be explicitly, justifiably excluded.**

The data lifecycle includes offboarding. A user who exports their database to GEDCOM and re-imports it (in this app, or any other) must get the same data back. This is co-equal with authored-data preservation: the first protects the user's data while it lives in our DB; this protects it as it leaves.

**Lifecycle direction:** GEDCOM → DB → user edits → DB → GEDCOM. End-to-end. Two enforcement mechanisms sit under one directive: (1) the importer discloses anything it cannot model — existing `unmappedData` / import-report mechanism; (2) the DB → GEDCOM → DB round-trip is mechanically guarded by the registry below. A schema change cannot weaken either: adding a column without a registry entry breaks CI, and changing the importer to drop a field that was previously reported also fails the existing import-disclosure tests.

**The contract is mechanical, not aspirational:**

- Every `(table, column)` pair in the schema has an entry in `src/api/gedcom_fidelity_registry.ts` declaring its round-trip status under both GEDCOM 5.5.1 and 7.0.
- Status values: `lossless` | `lossless-via:<mechanism>` | `lossy:<reason>` | `excluded:<reason>`.
- A schema-introspection unit test asserts that *every* column has an entry. **Adding a column without a registry entry breaks CI.** This is by design.
- Per-field round-trip tests exercise every non-excluded entry: seed a DB column → export to GEDCOM → re-import into a fresh DB → assert column value preserved (or matches the registry-declared lossy expectation).
- Golden-DB-seed round-trip tests seed a comprehensive multi-table DB → export → re-import → assert DB equivalence. Catches multi-field interactions.

**What "excluded" legitimately means:**
- App-internal audit: `created_at`, `updated_at`, `id` (UUID — re-issued on import).
- Derived/cached at render time: gazetteer rows, resolved coordinates, normalised name forms.
- Genuinely unrepresentable in the targeted GEDCOM version. Must cite the spec section it tried to map to.

**What "excluded" does NOT mean:**
- "It would be hard to round-trip." Hard ≠ excluded. `lossy` is fine if recorded; silent drop is not.
- "We don't use this field much." Authored data is authored data.
- "GEDCOM 5.5.1 can't carry it but 7.0 can." That's `lossy:5.5.1-spec-limit` for v551 and `lossless` for v70 — not excluded.

**Where this rule applies:** schema migrations, importer (`src/import/gedcom/`, `src/gedcom/importer.ts`), exporter (`src/gedcom/exporter.ts`), MCP tools that mutate persisted state, any new entity. Render-only and gazetteer-only code is exempt by definition (does not write authored data). Archive (`.zip`) export/import is in-scope conceptually but mechanical enforcement ships in a follow-up plan.

**Why this matters:** the user's choice to use this app must remain reversible. If our schema evolves in a way that strands their data inside our format, we have failed them — even if everything works perfectly while they stay.

## Surface contract

This is a strong rule, not a Prime Directive — broken UX is recoverable, broken data isn't. But the failure mode this section guards against (panel CTAs that ignore their host entity, or that lie about what they do) has shipped twice while passing lint, unit tests, and a UX_INVENTORY review. The genealogist found both by clicking. That's the bar this section is here to lift.

The genealogist thinks surface-first: they're "on a place," "on a person," "in a source." When they're on a surface, every action they take should bring the surface's host entity with it. They should never have to re-state what they already chose by being where they are, and they should never reach a CTA whose label lies about what its handler does.

**Four checks at the decision point.** Apply when wiring or reviewing any `<SectionHeader … :action-label="…" @action="…" />` in `src/renderer/components/*Panel.vue` (and the section components they host), or any modal opened from such a handler. Check #4 broadens to any picker, filter, or multi-step interaction inside the panel.

1. **Did the host entity flow in?** The panel is hosted on entity X (place, person, source, media). Whatever the action opens — modal, picker, inline form — must receive X as a default. Concrete check: trace the `@action` handler to the modal it opens; search the modal call site for `:default<X>Id="…"` (or equivalent prop). If the genealogist had to re-pick a value the surface already implied, the host was lost.
2. **Does the handler deliver the primitive named in the section title?** The section title sets a user expectation; the CTA must not break it. Two failure modes:
   - **Title mismatch (label lie).** Section title is about primitive X, handler creates primitive Y. Section "Persons" with `+ Event` adds an event, not a person — the title says people, the handler creates events. Rewire to a real `+ Person` flow, or remove the CTA if this section is a derived view and the canonical Add path lives in a sibling section.
   - **Duplicate-of-canonical on a derived view.** A sibling section is the canonical Add path for the primitive, and this section is just a different rendering of the same data. `MediaTimeline + Media` was this — the Media section already adds; the timeline view doesn't need its own Add. Ship the Add only on the canonical section.

   What's *not* a failure: sibling sections that are different views of the same primitive each carrying their own `+ X` CTA (PersonPanel's Events ↔ Timeline ↔ Life Map all view the `event` table — three `+ Event` buttons is convenience, not clutter, because each header truthfully describes what gets added and each is a place users come to interact with events). The genealogist on any of those headers correctly expects `+ Event` to add an event.
3. **Can the genealogist edit and remove (a) what each section's CTA adds, and (b) the panel's host entity itself, from this surface?** Two levels:
   - **Section-level lifecycle.** For each section that adds a primitive, the user can also see/edit/remove that primitive on the same surface (row click → edit modal, trash icon → confirm dialog), or via a clearly visible path. Read-only summary tables are fine when their data origin is signposted (PlacePanel's Persons section is derived from events) and the path back to the source of truth is reachable; opaque add-only sections aren't.
   - **Host-level lifecycle.** The panel must offer a way to delete the entity it's hosted on — a Danger-zone button at the bottom of the panel, with `IconTrash` + an entity-typed label and a `ConfirmModal` cascade summary, mirroring `PersonPanel.vue`'s `panel-danger-zone`. A panel that lets the user create or edit an entity but offers no path to delete it from this surface (forcing them to a list view's row trash icon, or worse — no UI path at all, as was the case for places before 2026-05-03) strands the user. The historical pattern: PlacePanel had no UI delete path at all; SourcePanel/MediaPanel/GroupPanel/ResearchTaskPanel had a list-view delete but no panel-level delete; only PersonPanel was complete. Resolved by aligning all six panels to the Danger-zone shape.

4. **No silent degradation across state.** A surface that offers something in one state must keep offering it (or signal the change explicitly) in adjacent states. If a picker shows DB rows + gazetteer suggestions when empty, filtering must still query both — typing narrows what's *displayed*, never what's *queried*. If `+ Media` works when the section is open, it works when collapsed — even if that means the handler expands the section first. The pattern's failure mode: the user takes a step they expect to *refine* (filter, type, click), and the system silently *removes* a data source, an affordance, or a piece of state. **Test:** walk the user's task as a sequence of states (`empty → typed`, `open → collapsed`, `first save → reopen`); at each transition, ask whether state B still offers everything state A did. If features drop quietly between A and B, that's the bug.

**Past failures this rule was written against:** `PlacePanel + Add person` (created a person with no link to the place — orphan); `MediaTimeline + Media` (duplicate of the Media section's attach handler — clutter); five panels with no host-level delete affordance (or worse, no UI delete path at all, like `places.delete`); place picker filter that excluded gazetteer suggestions when the user typed (silent scope loss between empty and typed states); `+ Media` on a collapsed Media section silently no-op'ing because the handler depended on a child component that was behind `v-if`. All of these surfaces were either marked ✅ resolved in `docs/UX_INVENTORY.md` while the bugs still shipped, or passed lint/unit tests/`panel-cta-conventions.test.ts` while breaking the user's task in the running app.

**Where this rule applies:** every `*Panel.vue` and the section components they host; every modal opened from a panel section; every CTA wired in a `<SectionHeader>`. Read-only snapshot views (reports, exports) are exempt.

## Project Overview

Släktforskning is a cross-platform desktop genealogy app built with Electron + Vue 3 + TypeScript. All data stays local in SQLite. A built-in MCP server lets AI agents read/write genealogy data without the UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 41 (Chromium + Node.js) |
| Frontend | Vue 3 (Composition API, `<script setup>`) + Vue Router + Pinia |
| Build | Electron Forge + Vite |
| Database | SQLite via node-sqlite3-wasm (WAL mode, foreign keys on) |
| MCP Server | @modelcontextprotocol/sdk (stdio transport) |
| Language | TypeScript throughout |

## Architecture

### Key Principle

`src/api/` is the single source of truth for all business logic. It has **zero Electron dependencies**. Both the Electron IPC handlers (`src/main/ipc/*.ts`) and the MCP server (`src/mcp/server.ts`) call the same api/ functions. All api/ functions take a `Database` instance as their first argument (dependency injection, no singletons).

**Worker Thread:** All 130+ DB-touching IPC channels run in a dedicated Node.js Worker Thread (`src/main/db-worker.ts`). The Electron main thread handles only Electron-specific operations (dialog, shell, BrowserWindow, printToPDF, fs for import/export). This keeps the main thread unblocked and eliminates click stutter. Worker startup is fire-and-forget; calls are queued until the worker signals `ready`.

### File Map

Top-level layout — run `ls src/<dir>/` for the leaves.

```
src/
├── api/                  # Pure TS business logic — NO Electron imports. CRUD per entity, schema.ts, types.ts.
│   ├── link-rules/       # Default link rule sets per locale (sv, en, de, da, no, universal)
│   ├── html_site/        # Website export helpers (snapshot, scope, redact, thumbnails)
│   └── place-gazetteers/ # Render-time place resolution. data/ holds 27 bundled JSON files (~42 MB).
├── gazetteer-build/      # Shared utils for gazetteer build scripts (geo, sparql, geonames, wikidata, tree, io)
├── shared/channels/      # Typed IPC channel registry — one defineChannel() per channel, per-domain files
├── main/                 # Electron main process: index.ts, database.ts, settings.ts, db-worker.ts, ipc/*
├── preload/index.ts      # contextBridge — hand-maintained window.api map (preload-coverage.test.ts enforces parity)
├── renderer/             # Vue 3 app — App.vue, router.ts, views/, components/, components/ui/, components/modals/,
│                         # composables/, directives/, utils/chart-layout/, constants/, styles/{tokens,shared}.css
├── static/               # Static SPA entry (website export target) — App.vue, router.ts, static-api.ts, views/
└── mcp/                  # createProdServer.ts (34 workflow tools), createDevServer.ts (+ 15 dev tools), server.ts, devServer.ts

tests/
├── unit/                 # Vitest against in-memory SQLite. createTestDb() in helpers.ts.
└── e2e/                  # Playwright against packaged binary. AppDriver in fixture.ts.

docs/                     # PLAN.md (roadmap), DATA_MODEL.md, MCP.md, IPC_REFERENCE.md, UX_INVENTORY.md (per-surface Purpose + CTA grid), plans/ (active + archive/)
.claude/                  # napkin.md (auto-curated runbook), skills/ (auto-discovered project skills)
.devcontainer/            # Linux dev container with Node 22 + Electron deps + Xvfb
```

## Common Commands

```bash
npm start              # Dev mode (Vite HMR)
npm run lint           # ESLint (must pass with 0 errors before committing)
npm test               # Vitest unit + component tests (~2120 tests, 80% coverage threshold on src/api/)
npm run test:e2e       # Package + Playwright (~30s end-to-end). Use `npx playwright test` if `out/` is already built.
npm run package        # Package for current platform
npm run make           # Build distributable installers
npm run build:static   # Build static SPA bundle (dist-static/)
npm run dev:static     # Dev server for static SPA at localhost:5174
npx tsx src/mcp/server.ts  # Run MCP server standalone
```

Each `BrowserWindow` runs an independent Vue app sharing the same main process and SQLite DB. New windows: `Cmd+N` / `Ctrl+N`.

Reference docs (load on demand): `docs/PLAN.md` (roadmap), `docs/DATA_MODEL.md`, `docs/MCP.md`, `docs/IPC_REFERENCE.md`, `.claude/napkin.md`.

## Skills

`oss-release`, `oss-triage`, `oss-stale`, `oss-welcome` are invoked by a scheduled maintainer agent on the public GitHub repo, not interactively by developers. Ignore them in normal coding work.

## Workflow

**Plan format:** every plan in `docs/plans/` follows [`.claude/rules/plans.md`](.claude/rules/plans.md) — User goal first, full pattern scope (deviations explicit), verification by user-observable outcome, RCA footer for follow-up plans. **Subagent dispatch:** use the `subagent-handoff` skill (project-local prompt templates centering user goals over spec compliance).

**Plan-driven work → worktree + subagents.** After `writing-plans` finishes, create a git worktree (`superpowers:using-git-worktrees`) and then invoke `superpowers:subagent-driven-development` (with `subagent-handoff` templates). Do not present the execution-approach choice to the user. Plans are by definition multi-task work that benefits from isolation and fresh-context subagents.

**Finishing a plan (do every time, not optional):** when the last task's spec + quality reviews pass, run this checklist before invoking `superpowers:finishing-a-development-branch`:
1. Mark every checkbox in the plan file as `[x]` (Self-review checklist included). Skill / rule updates the plan called for must already have landed in commits.
2. Move the plan file (and its `-design.md` sibling if any) to `docs/plans/archive/` via `git mv`.
3. Final version bump in `package.json` matching the largest change shipped (any feature → minor; fix-only refactor → patch) and add a `## Unreleased` line in `CHANGELOG.md` summarising the plan.
4. Update `docs/PLAN.md`: remove the milestone's `[planned]` / `[in-progress]` block from the active list, and append a one-paragraph entry to `docs/plans/archive/PLAN.md` (matching the existing `### Title` + one-line description + spec/plan link format). `docs/PLAN.md` must contain zero `[done]` entries when you commit — done milestones live only in the archive.
5. Commit `chore: archive completed <plan-name>` + the bump.
6. Merge worktree → `main` (`finishing-a-development-branch` Option 1), delete the branch, remove the worktree.

**Small fixes → main is fine.** One-off typo fixes, i18n tweaks, single-file bug fixes, or any change that doesn't warrant a plan file can be done directly on `main` without a worktree.

**Plan + spec path convention (overrides superpowers defaults):** All plan and design-spec files live under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`. Design spec → `-design.md` suffix; implementation plan → no suffix; both archive to `docs/plans/archive/` when done. `superpowers:brainstorming` and `superpowers:writing-plans` default to `docs/superpowers/specs/`; **always override** with an explicit `docs/plans/` path. Before committing, if any file lives under `docs/superpowers/` or `.claude/plans/`, move it to `docs/plans/` first.

