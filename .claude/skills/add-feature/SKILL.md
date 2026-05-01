---
name: add-feature
description: Add a new feature, entity type, or field to the Släktforskning codebase. Use this skill whenever implementing any new data model change, CRUD operation, IPC channel, MCP tool, or Vue UI component — even if the user just says "add X" or "implement Y". Covers the full stack: schema, API, IPC, preload, MCP, Vue.
---

# Adding a Feature to Släktforskning

This codebase has a strict layered architecture. Every data feature touches all layers in order. Skipping a layer means the feature is unreachable from either the UI or MCP agents.

## ⚠️ Prime Directive: Data Fidelity

**Before writing any code that mutates the DB, re-read the prime-directive section of `CLAUDE.md`.**

The user's data is sacred. Any value an algorithm produced — a gazetteer-resolved coordinate, a "best guess" date_type from a free-form string, a fuzzy-matched normalized name, an auto-applied quality-check fix, a default-when-the-agent-was-vague — **must NOT be persisted**. Inferred values are computed at render time, every render, against the current rules. Authored values (UI input, modal save, picker click on a structured suggestion, MCP tool call with explicit fields, file import preserving source content) are persisted.

Common traps when adding features:
- A new picker that resolves names to coordinates and "helpfully" persists them. → DON'T. The map computes coords from gazetteers at render.
- A new MCP tool that defaults `date_type` to `'exact'` because the agent passed `date_value`. → DON'T. Pass through what the agent gave; let the schema default to `'unknown'` if omitted.
- A new auto-fix button on a quality-check row that writes the suggested string. → OK only if the user explicitly clicks "apply this fix" and the suggestion is a deterministic transformation, not a guess. A passively-applied fix is forbidden.
- A new import path that fills in fields the source file didn't contain. → DON'T. Import only what's in the source.

If a feature seems to need inferred persistence to work, the design is wrong — find the render-time path. This rule is non-negotiable.

## Execution mode

Any feature backed by a plan file (`docs/plans/*.md`) runs in a **git worktree** with **subagent-driven execution**. Don't work plan-driven features on `main`.

1. After `writing-plans` writes the plan, invoke `superpowers:using-git-worktrees` to spin up an isolated worktree.
2. Then invoke `superpowers:subagent-driven-development` to execute the plan task-by-task with fresh-context subagents + two-stage review.
3. When the plan is fully implemented, merge the worktree back to `main` (`superpowers:finishing-a-development-branch`).

Small fixes without a plan (typo, i18n tweak, single-file bug fix) can still be done directly on `main` — see the `commit` skill's branch-strategy rule.

## The Checklist

Follow this order. Each step builds on the previous.

1. **Types** — define or extend the TypeScript interface in `src/api/types.ts`
2. **Schema** — add/alter tables in `src/api/schema.ts`; new tables use `CREATE TABLE IF NOT EXISTS`; new columns on existing tables **must** use a migration guard block (see below)
3. **API functions** — implement CRUD in `src/api/*.ts` (pure TS, `db: Database` as first arg, no Electron deps)
4. **Unit tests** — write tests in `tests/unit/` using `createTestDb()` before wiring anything else
5. **IPC handler** — register via `defineChannel()` in `src/shared/channels/<domain>.ts` (covers main-thread + worker dispatch automatically)
6. **Preload** — expose on `window.api.*` in `src/preload/index.ts`
7. **MCP tool** — add thin wrapper in `src/mcp/createServer.ts` using `registerTool()` (Zod inputSchema, JSON response); add tests in `tests/unit/mcp.test.ts`
8. **Vue UI** — build component or extend view in `src/renderer/`
9. **Verify** — `npm test && npx playwright test`; for UI features, also use the MCP verification loop (see below)
10. **Docs** — update `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `docs/PLAN.md` (roadmap), `docs/DATA_MODEL.md`, `docs/IPC_REFERENCE.md`, `docs/MCP.md`
11. **Skills** — update every skill whose content is affected by this feature. This is not optional. Skills are how future agents know how to work in this codebase. Ask: which skills reference the layer I just changed?
    - New entity type or schema column → `data-modeling` skill
    - New MCP tools → `mcp-dev` skill
    - New shared Vue component → `add-feature` skill (Shared components list)
    - New IPC channels → `add-feature` skill (IPC section) + `CLAUDE.md`
    - New data quality / check category → `add-feature` skill or dedicated skill
    - GEDCOM mapping changes → `gedcom` skill

## Cross-platform rules

Släktforskning targets macOS, Windows, and Linux from a single codebase. The number one source of cross-platform breakage is spawning external processes that are not guaranteed to exist.

**In app code (`src/`):** never `spawn` or `exec` a tool that the user must install separately. Use pure-JS/Node.js libraries instead.

| Don't (app code) | Do instead |
|------------------|------------|
| `spawnSync('unzip', ...)` | `fflate.unzipSync()` |
| `spawnSync('tar', ...)` | a JS tar library |
| `execFile('ffmpeg', ...)` | a wasm/JS media library |
| `execFile('convert', ...)` | a wasm/JS image library |

**Exception — explicit user-facing prerequisites:** Docker is an explicit prerequisite for the Genney Derby import. The UI tells the user Docker is required, checks for it before starting, and falls back gracefully when it is absent. This is acceptable because the dependency is intentional, documented, and user-visible. Apply the same bar before adding any new external-process dependency: it must be deliberate, checked, and fallback-handled.

**In tests and dev scripts (`tests/`, `scripts/`, `forge.config.ts`):** spawning processes is fine — test environments control what tools are available.

## Architectural Decision: Enrich Presentation vs. Store Derived Data

When a feature derives information from existing data (auto-linking text, computed labels, resolved references), prefer computing at render time over adding new tables or columns.

**Enrich presentation (prefer this):**
- Compute in a pure function, render in the component
- No schema change, no sync obligations, works retroactively on all existing data
- Example: `linkify()` scans source text for ArkivDigital AID codes and renders inline `<a>` tags

**Store derived data (only when needed):**
- When computation is expensive (seconds, not milliseconds)
- When the derivation requires external data not available at render time
- When the result needs to be searchable/queryable

The data model should store facts, not interpretations. One source of truth.

## API Layer (Steps 1-4)

### Database migrations — adding columns to existing tables

`CREATE TABLE IF NOT EXISTS` only creates the table if it doesn't exist — it **never** adds missing columns to an existing database. Any new column on an existing table requires a migration guard at the end of `initializeSchema()` in `src/api/schema.ts`:

```typescript
// Append inside initializeSchema(), after the main db.exec block.
// Label with the version that introduced these columns.
// v0.5.0 migrations
const thingsCols = (db.prepare('PRAGMA table_info(things)').all([]) as Array<{ name: string }>).map(c => c.name);
if (!thingsCols.includes('new_column')) {
  db.exec('ALTER TABLE things ADD COLUMN new_column TEXT');
}
if (!thingsCols.includes('another_column')) {
  db.exec('ALTER TABLE things ADD COLUMN another_column INTEGER NOT NULL DEFAULT 0');
}
```

Rules:
- One `PRAGMA table_info` call per table, then check each new column separately
- Match the column definition exactly (type, DEFAULT, constraints) to the `CREATE TABLE` statement above
- **Never skip this** — missing migration = runtime crash for any user with a pre-existing database

### SQLite quirks (node-sqlite3-wasm)

These differ from better-sqlite3 — get them wrong and nothing breaks at compile time:

- Parameter binding uses **arrays**: `stmt.run([a, b])` not `stmt.run(a, b)`
- `db.get()` returns `undefined` not `null` — use `?? null` on every result
- No `.pragma()` — use `db.exec('PRAGMA foreign_keys = ON')`
- `.run()` returns `{ changes: number }` — cast if TypeScript complains

### API function pattern

```typescript
// src/api/things.ts
import { Database } from '../main/database';
import { Thing } from './types';

export function createThing(db: Database, data: { name: string }): Thing {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO things (id, name) VALUES (?, ?)').run([id, data.name]);
  return db.prepare('SELECT * FROM things WHERE id = ?').get([id]) as Thing;
}

export function deleteThing(db: Database, id: string): boolean {
  return (db.prepare('DELETE FROM things WHERE id = ?').run([id]) as { changes: number }).changes > 0;
}
```

### Unit tests

See `/test` for the unit-test template, the `createTestDb()` helper, the per-CRUD-function negative-case checklist (null returns, false returns), and the **assert DB state, not just return values** rule (the EVENT_PLACE column-name bug shows why fixture-mirrored assertions silently pass on broken transforms).

Run after writing: `npm test -- --coverage` — coverage thresholds (80% lines and functions on `src/api/`) must still pass.

## IPC Layer (Steps 5-6)

### Adding a new IPC channel

All DB-touching channels run in the Worker Thread. The codebase uses a registry pattern: one `defineChannel` call covers worker dispatch + main-thread `wrapHandler` registration. The renderer-side preload is **NOT** registry-driven — it must be edited manually.

**1. Channel definition** (`src/shared/channels/<domain>.ts`) — single entry registers handler on both threads:
```typescript
defineChannel({
  name: 'things:create',
  thread: 'worker',
  mutating: true,                  // set true when this writes — fires onDataChanged
  handler: (db, data: Parameters<typeof things.createThing>[1]) => things.createThing(db, data),
});
defineChannel({
  name: 'things:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => things.deleteThing(db, id),
});
```

The barrel (`src/shared/channels/index.ts`) must import the domain file once if it's new — one line.

**2. ⚠️ Preload** (`src/preload/index.ts`) — **HAND-MAINTAINED, must be edited manually.** Adding a `defineChannel` does NOT auto-expose it on `window.api`; the renderer will hit `is not a function` at runtime. Add a matching line under the domain block:
```typescript
things: {
  create: mutating((data: unknown) => ipcRenderer.invoke('things:create', data)),
  delete: mutating((id: string) => ipcRenderer.invoke('things:delete', id)),
},
```
Wrap mutating channels with the local `mutating()` helper so `onDataChanged` listeners fire.

**3. Static API stub** (`src/static/static-api.ts`) — every registry channel needs a stub on the static-mode api, even if it's a no-op for the read-only website export. The `tests/unit/static-api-coverage.test.ts` parity check fails CI if you skip this.

**4. Vue component** — use it:
```typescript
await window.api.things.create({ name: 'test' });
```

After adding new IPC channels, update `src/renderer/api.d.ts` to add the typed method signatures under the correct `window.api.*` namespace. This file is the single global type declaration for `window.api`.

**Electron-only channels** (dialog, shell, printToPDF, fs ops) stay on the main thread — use `defineChannel({ thread: 'main', ... })` or, when `electron`-specific APIs aren't available in shared code, register manually via `wrapHandler` in the appropriate `src/main/ipc/*.ts` file and add the channel name to `MAIN_THREAD_ONLY_CHANNELS` in `tests/unit/ipc-worker-coverage.test.ts`.

### Required tests after adding a channel

Run these together — they catch the three places where a channel can be silently dropped:

```bash
npx vitest run tests/unit/ipc-worker-coverage.test.ts \
                tests/unit/preload-coverage.test.ts \
                tests/unit/static-api-coverage.test.ts
```

- `ipc-worker-coverage` — every `wrapHandler` resolves to a worker handler, registry entry, or `MAIN_THREAD_ONLY_CHANNELS`
- `preload-coverage` — every registry channel is exposed on the preload's `window.api` (parses preload as text)
- `static-api-coverage` — every registry channel has a stub in the static SPA api

See `docs/IPC_REFERENCE.md` for the complete existing `window.api` surface and IPC channel to API function mapping.

## MCP Layer (Step 7)

See `/mcp-dev` for the full pattern: `registerTool()` template, prod vs dev server split (`src/mcp/createProdServer.ts` for genealogy workflow tools, `src/mcp/createDevServer.ts` for UI/chart/seed tools), Zod inputSchema with `.describe()`, the thin-wrapper rule (all logic stays in `src/api/`), and the `tests/unit/mcp.test.ts` `call()` helper. The MCP-tool prime directive (pass-through, never synthesize defaults) lives there too.

## Vue UI Layer (Step 8)

For modal patterns, the three-sheet layout, paneled-view checklist, list view + side panel pattern, the shared component catalog (`BaseSubPanel`, pickers, `DateInput`, `EventModal`, `EventList`, `CitationModal`, `CitationBadge`, `AppButton`/`AppBadge`/etc.), the design tokens, and the `@media print` rules — see `/frontend-design`. It is the canonical reference; do not duplicate that knowledge here. CLAUDE.md's component table also lists every existing component by props/emits so you can find what to reuse.

A11y patterns (combobox, focus trap, contrast tokens, screen-reader narration via `v-narrate`) live in `/a11y`.

### Adding a new entity color identity

If your new entity warrants its own color: add it to `EntityType` in `entityMeta.ts`, define `--entity-{name}-text/-bg` (light in `tokens.css`, dark + HC overrides in `shared.css`), and add a `[data-entity="{name}"]` remap rule. `tests/unit/wcagContrast.test.ts` will catch any contrast failures across the 9 (theme × mode) combinations automatically.

### Error handling in async operations

Every `await window.api.*` call that mutates data must have a try/catch that shows a toast. Never silently swallow errors:

```typescript
import { useToast } from '../composables/useToast';
import { useI18n } from 'vue-i18n';

const toast = useToast();
const { t } = useI18n();

async function save() {
  try {
    await window.api.things.create(form);
    emit('saved');
  } catch (err) {
    console.error('[PersonThingsSection] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
```

Use `errors.saveFailed` for mutations, `errors.deleteFailed` for deletes, `errors.loadFailed` for reads. These keys exist in both `en.ts` and `sv.ts`.

### Person Section Component pattern

**Every data section for a person is a self-contained, reusable component** used inside `PersonPanel` (the side panel hosted by `PersonsView`), and shared with any other view that needs the same section (e.g. `ResearchTasksTable` is used in both `PersonPanel` and `ResearchTasksView`). When adding a new per-person section, always make it a component — never inline it in just one view.

#### Existing person section components

| Component | Self-loading | Exposes | Used in |
|-----------|-------------|---------|---------|
| `PersonNamesTable` | No (parent passes `names`) | — | PersonPanel |
| `PersonNameModal` | No | — | PersonPanel |
| `EventList` | Yes (`personId` / `relationshipId` / `placeId` prop) | `openAddForm()` | PersonPanel, RelationshipPanel, PlacePanel |
| `ResearchTasksTable` | No (parent passes `tasks`) | — | PersonPanel, ResearchTasksView |
| `GroupsTable` | No (parent passes `groups`) | — | PersonPanel, GroupsView |
| `PersonIdentifiersSection` | Yes | `openAddForm()` | PersonPanel |
| `PersonMediaSection` / `EntityMediaSection` | Yes | `attach()` | PersonPanel + every panel hosting media |
| `PersonChecksSection` | Yes | `reload()` | PersonPanel |

#### Self-loading section component template

Use this when the section owns its own data (no benefit to the parent holding the array). **Always go through `useEntityData`** — it handles race-safe loading on id change AND auto-subscribes to `onDataChanged` so the section refreshes after any mutation (own component, sibling section, modal, MCP call). Never roll a manual `watch(() => props.id, load, { immediate: true })`, and never call `window.api.onDataChanged(...)` directly.

```vue
<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useEntityData } from '../composables/useEntityData';
import { useToast } from '../composables/useToast';
import { useI18n } from 'vue-i18n';
// No local window declaration needed — window.api is typed globally via src/renderer/api.d.ts

export interface ThingRow { id: string; /* ... */ }

const props = defineProps<{ personId: string }>();
const { t } = useI18n();
const toast = useToast();

const { data, loading, error, reload } = useEntityData<ThingRow[]>(
  toRef(props, 'personId'),
  async (id) => {
    try {
      return await window.api.things.forPerson(id);
    } catch (err) {
      console.error('[PersonThingsSection] load failed:', err);
      toast.error(t('errors.loadFailed'));
      throw err;
    }
  },
);
const items = computed(() => data.value ?? []);

// Expose any action the parent header button needs to trigger
defineExpose({ openAddForm: () => { showForm.value = true; }, reload });
</script>
```

Key rules:
- **Always `useEntityData(toRef(props, 'personId'), loader)`** — never a manual `watch(() => props.X, load, { immediate: true })`. The composable owns race safety AND mutation reactivity.
- **Never register `window.api.onDataChanged(...)` from a component.** The composable subscribes for you. If you find yourself wanting to, you're either (a) not using the composable yet, (b) wanting a Pattern-1 targeted refresh (see `frontend-design` skill), or (c) doing app-wide cross-entity work that belongs in `App.vue`.
- Export the row interface so parents can type their own refs (e.g. `ref<import('./PersonXxx.vue').ThingRow[]>([])`)
- Use `defineExpose` when the parent's header button must trigger an action inside the component (add form, file picker, etc.). Re-export `reload` so the parent can imperatively refresh when needed.
- The parent keeps the `<section>` header with the `<h4>` and action `<button>`; the component renders only the table/content below.
- For new list views (left column), use `usePagedList({ ..., fetchPage })` — same auto-subscription, race guard, debounce.

#### Parent wiring (panel-section style)

```vue
<section class="panel-section">
  <div class="section-header">
    <h4>{{ $t('things.title') }}</h4>
    <button class="btn-add" @click="thingsSectionRef?.openAddForm()">+ {{ $t('things.add') }}</button>
  </div>
  <PersonThingsSection ref="thingsSectionRef" :person-id="person.id" />
</section>
```

```typescript
import PersonThingsSection from '../components/PersonThingsSection.vue';
const thingsSectionRef = ref<InstanceType<typeof PersonThingsSection> | null>(null);
```

#### Parent wiring (PersonPanel style — collapsible with localStorage)

```vue
<div class="panel-section">
  <button class="panel-section-header" @click="toggleSection('things')">
    <span class="panel-chevron">{{ sections.things ? '▾' : '▸' }}</span>
    {{ $t('things.title') }}
    <span class="panel-section-header-action" @click.stop="thingsSectionRef?.openAddForm()">+ {{ $t('things.add') }}</span>
  </button>
  <div v-if="sections.things" class="panel-section-body">
    <PersonThingsSection ref="thingsSectionRef" :person-id="personId!" />
  </div>
</div>
```

Add `things: loadSection('things', false)` to the `sections` reactive object.

### UI consistency rules
- **Picker inputs fill their container** — `PersonPicker` and `PlacePicker` both have `width: 100%` on their root. Place them inside a `<label>` or grid cell and they will fill it. Never wrap them in a `class="full-width"` override.
- **Clickable rows, no Edit buttons** — all list/table rows are clickable (`@click`, `cursor: pointer`). Action buttons (Cite, Delete) use `@click.stop`. This applies to events, persons, relationships, sources, and places.
- **2-column field-grid** — detail views use `display: grid; grid-template-columns: 1fr 1fr`. Only use `grid-column: 1 / -1` for a field that genuinely needs extra width (e.g. a long textarea). Never use it for picker inputs.
- **Always use `formatFullName()` for plain-text name rendering** — Any code that renders a person name as a string (report headings, ahnentafel lists, relationship lists, dropdown labels, log strings) MUST import and call `formatFullName()` from `src/renderer/utils/nameUtils.ts`. Never use inline logic like `preferred_name ?? given_name?.split(' ')[0]` or a local `primaryName()` function. This ensures all given names, the nickname in quotes, and any prefix/suffix are always shown. For Vue template rendering (PersonName component contexts), use `<PersonName>` instead.

### i18n

Every user-visible string — including button labels, table headers, placeholders, section headings, and empty-state messages — goes through `$t('key')`. No hardcoded Swedish or English in templates or script. This applies even to single-word labels like "Spara" or "Save".

Add all new keys to **both** `src/renderer/i18n/sv.ts` (Swedish, primary) and `src/renderer/i18n/en.ts` (English) in the same changeset.

### Component size

If a component grows beyond ~300 lines, extract sections following the Person Section Component pattern before adding more code. Large components are a sign that multiple independently reusable sections have been inlined. Extract each section into its own self-loading component — see the pattern above.

### Minimizing data entry actions

Every new UI feature should be evaluated against the number of user actions (clicks, selections, text entries) needed to accomplish a task. A usability analysis of this app (see `docs/plans/archive/2026-04-10-usability-test-plan.md`) found that creating a fully-sourced 10-person family tree required ~792 actions. Six optimizations reduced this by ~50%.

**Principles — apply to any new feature:**

1. **Combine related entity creation** — When creating entity A always requires creating entity B, offer B's fields inline in A's form. Example: `PersonModal` with `relatedTo` creates person + relationship + birth event + citation in one modal instead of 4 separate workflows. Use `<details>` for optional sections to keep the form clean.

2. **Pre-fill from context** — When a user's intent is clear from context, pre-fill fields:
   - Sex: auto-infer from role (father→M, mother→F, spouse→opposite)
   - Surname: pre-fill child's surname from parent
   - Source: remember last-used source across forms (Pinia store `sourceSession`)

3. **Reduce navigation clicks** — Offer actions where the user already is:
   - "Add Father/Mother/Child/Spouse" buttons on person detail and panel
   - Ghost placeholder boxes in the pedigree chart for missing parents
   - "Cite" button per event row instead of requiring full event edit
   - "Save & Add Another" to batch-enter multiple items without closing the modal

4. **Composables for multi-entity creation** — Use `useBirthEventCreation` pattern: a composable that wraps multiple IPC calls (create event + add participant + create citation) into a single function. This keeps the logic DRY across modals.

**Key components for data entry optimization:**
- `PersonModal` with `relatedTo` — combined person + relationship + birth event creation with inference
- `useBirthEventCreation` composable — shared birth event + participant + citation creation
- `sourceSession` Pinia store — last-used source memory for citation pre-fill
- `EventList` cite button — quick citation without full event edit
- `EventModal` "Save & Add Another" — batch event entry
- Ghost placeholder boxes in `PedigreeChart` — click-to-add missing parents

## UI Verification (Step 9 — REQUIRED for any UI change)

**Unit tests alone do not verify UI changes** (they miss modal lifecycle, route remount on key change, ref timing, async-gated rendering, event-bubble overlap). Before committing, verify in the running app.

- Headless / CI: `npx playwright test --project=gui-xxx`
- Interactive: ask the user to launch `npm start` (or `./.devcontainer/dev-debug.sh` for CDP), then drive the app with the `slaktforskning-dev` MCP tools (`ui_navigate`, `ui_screenshot`, `ui_click`, `ui_get_dom`).

See `/test` for the full E2E architecture, the `AppDriver` API, and the common pitfalls list. See `/electron-dev` for the launch + native-MCP-vs-CDP decision tree. See `/commit` for the rule that UI changes must NOT be committed without visual verification.

## Before implementing a non-trivial feature

Use `superpowers:writing-plans` to write a plan first. Existing plans in `docs/plans/` (and `docs/plans/archive/`) are good templates — they show the expected task structure, file map format, and TDD step granularity for this codebase.

**Path convention (overrides superpowers defaults):** This project puts all plans and design specs under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`.
- Design spec: `docs/plans/YYYY-MM-DD-<topic>-design.md` (with `-design` suffix)
- Implementation plan: `docs/plans/YYYY-MM-DD-<topic>.md` (no suffix)
- Archived (when complete): move both to `docs/plans/archive/`

When invoking `superpowers:brainstorming` or `superpowers:writing-plans`, explicitly tell the subagent to write to `docs/plans/` with the suffix convention above. The superpowers skills default to `docs/superpowers/specs/` — always override.

## Speeding up with subagents

The checklist maps to focused subagents in `.claude/agents/` (auto-discovered by Claude Code as Task agent types — invoke them by name via the Task tool):

| Agent | Steps | Can run in parallel with |
|-------|-------|--------------------------|
| `api-implementer` | 1–3 | test-writer (after signatures are committed) |
| `test-writer` | 4 | — |
| `ipc-mcp-wirer` | 5–7 | vue-ui-builder |
| `vue-ui-builder` | 8 | ipc-mcp-wirer |
| `ux-reviewer` | (review) | — — read-only consistency check |

Use `superpowers:subagent-driven-development` to dispatch these with two-stage review (spec compliance, then code quality) after each agent. Each agent commits its OWN work AND its own docs in the same commit per the `/commit` bundle rule. The last commit of a multi-commit feature handles milestone closeout (plan archival, PLAN.md roadmap update, `## vX.Y.Z` CHANGELOG header) — also handled by `/commit`, no separate doc-sync phase.

## After implementing

Use the `/test` skill to run and write tests. Then commit with `/commit`.

### Release-commit archival checklist

**Every release commit (`release: vX.Y.Z — …`) MUST do the following in the same commit, not a follow-up:**

1. `git mv docs/plans/YYYY-MM-DD-<topic>.md docs/plans/archive/` — the plan file itself, not just the spec
2. `git mv docs/plans/YYYY-MM-DD-<topic>-design.md docs/plans/archive/` — if a design spec exists
3. Add a `## vX.Y.Z — description` entry to `CHANGELOG.md` with links to BOTH the archived plan and archived spec.
4. Bump `package.json` version

**When writing plan files, the final task must explicitly include `git mv` lines for both the plan and the spec.** The common failure mode is archiving only the spec and leaving the plan file in `docs/plans/`. Reviewers should check `ls docs/plans/` after every release and flag any lingering feature plans.

If the plan is executed by a subagent via a direct-commit flow (not `/commit`), the final-task `git add` line must list the archived plan path explicitly — subagents follow plans literally and will not archive unless told to.
