# Släktforskning — Project Instructions

## ⚠️ Prime Directive: Data Fidelity

**The DB holds exactly what was authored. Nothing inferred is added; nothing authored is silently removed.**

**Inferred data (never persist):**
- Coordinates resolved from a place name via a gazetteer
- A "best guess" date computed from a `date_original` string
- A "looks like" value from a typo-tolerance heuristic
- A normalized version of a value when the original is preserved elsewhere
- ANY value an algorithm produced that no human typed, clicked, or imported

**Rules:**
- DB stores **only** what was actively authored (UI, modal, picker, MCP tool call) or what was in the imported file.
- Resolver / formatter / display layer computes inferred values **on demand**, every render, against current gazetteers/rules.
- Any code path that writes inferred output back to the DB is a bug. Stop at `places.update`, `events.update`, `INSERT INTO`, any mutation — if the value wasn't authored by a human action *in this session*, don't write it.
- **Authored values are not discarded by side effect.** Hiding a field in the UI is not consent to null it out on save. Authored values stay until *another* explicit human action removes them (empty field, "Clear" button, delete). Mutation builders write what the form says — never second-guess which fields the new entity-shape "should" have. Patterns like `cause: form.event_type === 'death' ? form.cause : null` discard authored data on a UI mode change and are a violation.

**Why:** persisted inference pins the DB to one version of the inferring code; users can't tell authored from guessed and their corrections get overwritten; genealogy is a long-term archive.

**Allowed exceptions (deterministic derivations, not inferences):**
- `normalized_name` from `name` (lowercase + strip diacritics — pure function, used only for SQL collation)
- `created_at` / `updated_at` timestamps
- UUIDs

**If a feature seems to need inferred persistence, the design is wrong.** Compute on render. Cache in memory if needed. Never write back.

Applies to: import paths, MCP tools, IPC handlers, Vue components, AI agents, scripts, migrations. No exceptions.

## ⚠️ Prime Directive (cont.): Round-Trip Fidelity

**Every authored field must survive a GEDCOM 5.5.1 *or* 7.0 round-trip — or be explicitly, justifiably excluded.**

Lifecycle: GEDCOM → DB → user edits → DB → GEDCOM. Two enforcement mechanisms under one directive:
1. The importer discloses anything it cannot model (`unmappedData` / import-report mechanism).
2. The DB → GEDCOM → DB round-trip is mechanically guarded by the registry below.

**Mechanical contract:**
- Every `(table, column)` pair has an entry in `src/api/gedcom_fidelity_registry.ts` declaring round-trip status under both 5.5.1 and 7.0.
- Status values: `lossless` | `lossless-via:<mechanism>` | `lossy:<reason>` | `excluded:<reason>`.
- Schema-introspection unit test asserts every column has an entry. Adding a column without a registry entry breaks CI by design.
- Per-field round-trip tests: seed DB column → export → re-import → assert preserved (or matches the declared lossy expectation).
- Golden-DB-seed round-trip tests: seed comprehensive multi-table DB → export → re-import → assert DB equivalence.

**`excluded` legitimately means:**
- App-internal audit: `created_at`, `updated_at`, `id` (UUID re-issued on import).
- Derived/cached at render time: gazetteer rows, resolved coordinates, normalised name forms.
- Genuinely unrepresentable in the targeted GEDCOM version. Must cite the spec section it tried to map to.

**`excluded` does NOT mean:**
- "Hard to round-trip." Hard ≠ excluded. `lossy` is fine if recorded; silent drop is not.
- "We don't use this field much." Authored data is authored data.
- "5.5.1 can't carry it but 7.0 can." That's `lossy:5.5.1-spec-limit` for v551 and `lossless` for v70.

**Applies to:** schema migrations, importer (`src/import/gedcom/`, `src/gedcom/importer.ts`), exporter (`src/gedcom/exporter.ts`), MCP tools that mutate persisted state, any new entity. Render-only and gazetteer-only code is exempt. Archive (`.zip`) export/import is conceptually in-scope; mechanical enforcement ships in a follow-up plan.

## Surface contract

Strong rule, not a Prime Directive. Apply when wiring or reviewing any `<SectionHeader … :action-label="…" @action="…" />` in `src/renderer/components/*Panel.vue` (and section components they host), or any modal opened from such a handler. Check #4 broadens to any picker, filter, or multi-step interaction.

1. **Host entity flows in.** The panel is hosted on entity X. Whatever the action opens — modal, picker, inline form — must receive X as a default. Trace the `@action` handler to the modal; search for `:default<X>Id="…"` (or equivalent prop). If the user had to re-pick a value the surface already implied, the host was lost.

2. **Handler delivers the primitive named in the section title.** Two failure modes:
   - **Title mismatch (label lie):** section title says X, handler creates Y. "Persons" with `+ Event` adds an event, not a person. Rewire to a real `+ Person` flow, or remove the CTA if this section is a derived view and the canonical Add lives in a sibling section.
   - **Duplicate-of-canonical on a derived view:** a sibling section is the canonical Add path. `MediaTimeline + Media` was this. Ship the Add only on the canonical section.

   **Not a failure:** sibling sections that are different views of the same primitive each carrying their own `+ X` CTA (PersonPanel's Events ↔ Timeline ↔ Life Map all view the `event` table — three `+ Event` buttons is convenience).

3. **Edit + remove from this surface** for (a) what each section's CTA adds and (b) the panel's host entity itself:
   - **Section-level lifecycle:** for each section that adds a primitive, the user can also see/edit/remove it on the same surface (row click → edit modal, trash icon → confirm dialog), or via a clearly visible path. Read-only summary tables are fine when the data origin is signposted and the path back is reachable; opaque add-only sections aren't.
   - **Host-level lifecycle:** the panel must offer a way to delete its host entity — a Danger-zone button at the bottom, `IconTrash` + entity-typed label + `ConfirmModal` cascade summary, mirroring `PersonPanel.vue`'s `panel-danger-zone`.

4. **No silent degradation across state.** A surface that offers something in one state must keep offering it (or signal the change explicitly) in adjacent states. If a picker shows DB rows + gazetteer suggestions when empty, filtering must still query both — typing narrows what's *displayed*, never what's *queried*. If `+ Media` works when open, it works when collapsed (handler expands the section first if needed). **Test:** walk the task as a sequence of states (`empty → typed`, `open → collapsed`, `first save → reopen`); at each transition, verify state B still offers everything state A did.

**Applies to:** every `*Panel.vue` and its section components; every modal opened from a panel section; every CTA wired in a `<SectionHeader>`. Read-only snapshot views (reports, exports) are exempt.

## Project Overview

Cross-platform desktop genealogy app built with Tauri 2 (Rust host) + Vue 3 + TypeScript. All data local in SQLite. Built-in MCP server lets AI agents read/write genealogy data without the UI; in the bundled app it ships as a child Bun process spawned by the Rust host.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Tauri 2.x (Rust core + system WebView) |
| Frontend | Vue 3 (Composition API, `<script setup>`) + Vue Router + Pinia |
| Build | Tauri CLI + Vite (renderer) + Cargo (Rust core) |
| Database | SQLite via rusqlite (DELETE journaling, foreign keys on) |
| MCP Server | @modelcontextprotocol/sdk (stdio); sidecar = `bun server.bundle.mjs` (esbuild ESM output + shipped Bun binary, spawned via tauri-plugin-shell). [kkrpc](https://github.com/kunkunsh/kkrpc) is the JS-side typesafe RPC layer. |
| Language | TypeScript (renderer + api/) + Rust (core) |

## Architecture

`src/api/` is the single source of truth for business logic. Runtime-neutral TypeScript, runs in the renderer process via the Tauri DB shim. Both the renderer's `tauri-window-api.ts` (binds each `window.api.<domain>.<method>` to a `src/api/*` function, alongside Rust commands from Specta-generated `src/renderer/bindings.ts`) and the MCP server (`src/mcp/server.ts`) call the same api/ functions. All api/ functions take a `Database` as first arg (DI, no singletons).

**No worker thread.** api/ runs in the renderer; SQLite calls via `src/renderer/db-shim.ts` invoke rusqlite in the Rust core (`src-tauri/src/db.rs`) via `tauri::command` with `spawn_blocking`. Rust side is naturally off-thread; renderer stays responsive.

### File Map

```
src/
├── api/                  # Runtime-neutral TS business logic. CRUD per entity, schema.ts, types.ts.
│   ├── link-rules/       # Default link rule sets per locale (sv, en, de, da, no, universal)
│   ├── html_site/        # Website export helpers (snapshot, scope, redact, thumbnails)
│   └── place-gazetteers/ # Render-time place resolution. data/ holds bundled JSONs (~42 MB raw).
├── gazetteer-build/      # Build-script utils (geo, sparql, geonames, wikidata, tree, io)
├── shared/               # Cross-runtime helpers (renderer + MCP sidecar)
│   ├── db-worker-state.ts        # DI-pattern state accessors (legacy name; runtime-neutral)
│   ├── db-worker-broadcast.ts    # DI-pattern broadcast helper (legacy name; runtime-neutral)
│   └── preview-html-inject.ts    # Pure string-swap for website-export preview iframe
├── renderer/             # Vue 3 app — App.vue, router.ts, views/, components/, composables/,
│                         # tauri-window-api.ts (window.api wiring), bindings.ts (Specta-generated,
│                         # regenerated by cargo build), db-shim.ts
├── static/               # Static SPA entry (website export target)
└── mcp/                  # createProdServer.ts, createDevServer.ts (+ 15 dev tools), server.ts, devServer.ts

src-tauri/
├── src/                  # Rust core — db.rs (rusqlite), ui_server.rs (HTTP bridge for dev MCP), lib.rs, fs/dialog/shell
├── Cargo.toml
└── tauri.conf.json

tests/
├── unit/                 # Vitest against in-memory SQLite. createTestDb() in helpers.ts.
├── components/           # Vitest with happy-dom.
└── e2e/                  # Playwright against the packaged Tauri binary. AppDriver in fixture.ts.

docs/                     # PLAN.md, DATA_MODEL.md, MCP.md, IPC_REFERENCE.md, UX_INVENTORY.md, plans/
.claude/                  # napkin.md, skills/
.devcontainer/            # Linux dev container with Node 22 + Rust + Xvfb
```

## Common Commands

```bash
npm start              # Launch the Tauri app in dev mode (Rust + Vite HMR)
npm run lint           # ESLint (0 errors required before commit)
npm test               # Vitest unit + component (~4000 tests, 80% coverage on src/api/)
npm run test:e2e       # Build the Tauri bundle + run Playwright. Use `npx playwright test` if `out/` is already built.
npm run build          # Full Tauri bundle for current platform
npm run build:bin      # Raw Tauri binary, no bundle (faster — used by build:e2e and dev iteration)
npm run build:static   # Static SPA bundle (dist-static/)
npm run dev:static     # Dev server for static SPA at localhost:5174
npm run build:mcp-sidecar  # esbuild bundles src/mcp/server.ts → dist-mcp/server.bundle.mjs. Required before `npm run build`.
npx tsx src/mcp/server.ts  # Run MCP server standalone (Node-host, for non-Tauri agents)
```

Rust core: ~3 s incremental recompile on `src-tauri/` changes. Renderer changes: instant via Vite HMR. Cold `target/` cache: 5–10 min.

**Specta coupling is enforced by `vue-tsc`, not bare `tsc`.** Renaming a Rust command parameter regenerates `src/renderer/bindings.ts` on next `cargo build`. `npx vue-tsc --noEmit --ignoreDeprecations 6.0` flags renderer call sites that no longer match. Bare `npx tsc --noEmit` doesn't reach call sites because `@types/node` lib types fail to parse — CI uses `vue-tsc`.

Reference docs (load on demand): `docs/PLAN.md`, `docs/DATA_MODEL.md`, `docs/MCP.md`, `docs/IPC_REFERENCE.md`, `.claude/napkin.md`.

## Skills

`oss-release` is shared release infrastructure, used in normal interactive work: `close-out` (step 3), the `commit` skill, and the dev-pipeline agents all delegate CHANGELOG block structure, the 10-block rolling window, version-bump-in-lockstep, and the archive flow to it. Agents never touch `CHANGELOG.md` directly. Invoke it whenever a version-bumped commit lands.

`oss-triage`, `oss-stale`, `oss-welcome` are GitHub issue/PR maintenance for the public repo (label, dedup, stale-close, greet first-timers), invoked by the scheduled maintainer agent — not by interactive coding work. Ignore these three in normal coding.

## Project conventions live in the workspace, not in user memory

Project-wide rules belong in `CLAUDE.md`, `.claude/rules/*.md`, or `.claude/skills/**/SKILL.md` — loaded for every contributor and every subagent. User memory is per-user, per-installation; nothing there reaches a fresh session or a subagent. If a "feedback memory" describes how this project works (not the individual user), promote it into the workspace and delete the memory. Inverse: don't ask the user to memorize something that belongs in `CLAUDE.md`.

## Workflow

**Plan format:** every plan in `docs/plans/` follows [`.claude/rules/plans.md`](.claude/rules/plans.md). **Subagent dispatch:** use the `subagent-handoff` skill.

**Plan-driven work → worktree + subagents.** After `writing-plans`, create a git worktree (`superpowers:using-git-worktrees`) and invoke `superpowers:subagent-driven-development` (with `subagent-handoff` templates). Don't present the execution-approach choice.

**Finishing a plan (every time, not optional):** when the last task's spec + quality reviews pass, before invoking `superpowers:finishing-a-development-branch`:

0. **Produce evidence the Verification §1 criteria are met** — paste actual output (test counts, exit codes, MCP-call results, build-tail line) into the close-out commit message. Per [`.claude/rules/plans.md`](.claude/rules/plans.md) "Verification discipline at close-out", assertions are not evidence. Invoke `superpowers:verification-before-completion` explicitly. If any user-observable command in the Verification section hasn't been run with output captured, the plan is not ready to archive. Evidence template:
   - `npm test` → `N passed (Xs)` (summary line).
   - `npm run build` → `built in Xs` (tail line + exit code).
   - `npm run test:e2e` → `N passed (Xs)` across 4 Tier 1 projects (`[boot]`, `[crud]`, `[website-export]`, `[duplicates]`).
   - `npm run test:e2e:full` → `N passed (Xs)` across 7 projects (Tier 1 + `[panels]`, `[reactivity]`, `[imports]`) — **required when user goal touches a panel, modal, list-view, importer, or `data-changed` consumer**. Non-UI plans (Rust-only, schema-only, doc-only) exempt.

1. Mark every checkbox in the plan as `[x]` (Self-review checklist included). Skill/rule updates the plan called for must already have landed.

2. `git mv` the plan file (and `-design.md` sibling) to `docs/plans/archive/`.

3. Final version bump (any feature → minor; fix-only → patch) and a new `CHANGELOG.md` block. Block structure, bullet style, trim rules, archive flow: `oss-release` skill. Version-bump mechanics: `commit` skill.

4. Update `docs/PLAN.md`: remove the milestone's `[planned]` / `[in-progress]` block from the active list; append a one-paragraph entry to `docs/plans/archive/PLAN.md` (matching `### Title` + one-line description + spec/plan link format). `docs/PLAN.md` must contain zero `[done]` entries.

5. Commit `chore: archive completed <plan-name>` + the bump.

6. Merge / push: PR or direct merge to `main` from the worktree — both fine. Rule is the verification, not the path. PR → CI is the verification surface; iterate on red. Direct merge → executor has already run `npm test`, `npm run build`, and the appropriate e2e tier locally, with output in the commit message. Pushing to `origin/main` without local-green (or merging a red PR) is never OK. When merging worktree to `main`, push `main` itself — not the feature branch.

**Small fixes → main is fine.** One-off typos, i18n tweaks, single-file fixes, anything that doesn't warrant a plan file: directly on `main` without a worktree.

**Plan + spec path convention (overrides superpowers defaults):** All plan and design-spec files live under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`. Design spec → `-design.md` suffix; implementation plan → no suffix; both archive to `docs/plans/archive/` when done. `superpowers:brainstorming` and `superpowers:writing-plans` default to `docs/superpowers/specs/`; **always override** with explicit `docs/plans/` path. Before committing, if any file lives under `docs/superpowers/` or `.claude/plans/`, move it first.
