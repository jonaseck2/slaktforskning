---
name: add-feature
description: Add a new feature, entity type, or field to the Släktforskning codebase. Use this skill whenever implementing any new data model change, CRUD operation, IPC binding, MCP tool, or Vue UI component — even if the user just says "add X" or "implement Y". Covers the full stack: schema, API, window.api wiring (Specta-generated for Rust commands + inlined renderer-local bindings), MCP, Vue.
---

# Adding a Feature to Släktforskning

Strict layered architecture. Every data feature touches all layers in order. Skipping a layer means the feature is unreachable from either the UI or MCP agents.

**Pattern enforcement:** if you build/refactor a reusable shell (panel, list, modal), every same-shaped component must adopt it in the same change. See `.claude/rules/renderer.md` "Pattern migrations are all-or-nothing" and `.claude/rules/plans.md` Rule A2.

## ⚠️ Prime Directive: Data Fidelity

**Before writing any code that mutates the DB, re-read the prime-directive section of `CLAUDE.md`.**

Any value an algorithm produced — gazetteer-resolved coordinate, "best guess" date_type from a free-form string, fuzzy-matched normalized name, auto-applied quality-check fix, default-when-the-agent-was-vague — **must NOT be persisted**. Inferred values are computed at render time, every render. Authored values (UI input, modal save, picker click on a structured suggestion, MCP tool call with explicit fields, file import preserving source content) are persisted.

Common traps:
- New picker resolving names to coordinates and "helpfully" persisting them. → DON'T. The map computes coords from gazetteers at render.
- New MCP tool that defaults `date_type` to `'exact'` because the agent passed `date_value`. → DON'T. Pass through; let the schema default to `'unknown'` if omitted.
- New auto-fix button on a quality-check row that writes the suggested string. → OK only if user explicitly clicks "apply this fix" AND the suggestion is a deterministic transformation, not a guess. Passively-applied fix is forbidden.
- New import path filling in fields the source file didn't contain. → DON'T.

If a feature seems to need inferred persistence, the design is wrong.

## Execution mode

Plan-backed features (`docs/plans/*.md`) run in a **git worktree** with **subagent-driven execution**. Don't work plan-driven features on `main`.

1. After `writing-plans` writes the plan, invoke `superpowers:using-git-worktrees`.
2. Then invoke `superpowers:subagent-driven-development` (with `subagent-handoff` templates).
3. When the plan is fully implemented, merge worktree back to `main` (`superpowers:finishing-a-development-branch`).

Small fixes without a plan can go directly to `main` — see the `commit` skill's branch-strategy rule.

## The Checklist

Follow this order. Each step builds on the previous.

1. **Types** — define or extend the TypeScript interface in `src/api/types.ts`
2. **Schema** — add/alter tables in `src/api/schema.ts`; new tables use `CREATE TABLE IF NOT EXISTS`; new columns on existing tables **must** use a migration guard block (see below)
3. **API functions** — implement CRUD in `src/api/*.ts` (pure runtime-neutral TS, `db: Database` as first arg)
4. **Unit tests** — write tests in `tests/unit/` using `createTestDb()` before wiring anything else
5. **IPC binding** — two paths depending on whether the new operation needs Rust services or is pure TS over the renderer-side DB shim:
   - **Pure TS handler** (most CRUD): add an explicit binding to `src/renderer/tauri-window-api.ts` (`api.things.create = mutating((db, data) => things.createThing(db, data))` or `readOnly(...)` for non-mutating). The `mutating()` helper fires `data:changed` after the call.
   - **Rust-backed command** (file dialog, fs, shell, native thumbnailing, multi-window): add a `#[tauri::command] #[specta::specta]` function in `src-tauri/src/lib.rs`, register it in the `tauri_specta::Builder` collect_commands!. `cargo build` regenerates `src/renderer/bindings.ts` with the typed wrapper. Then add a polyfill in `tauri-window-api.ts` that calls `commands.thingName(...)`.
   See `/tauri-bridge` for the polyfill recipe and the Specta annotation walkthrough.
6. **MCP tool** — add thin wrapper in `src/mcp/createServer.ts` using `registerTool()` (Zod inputSchema, JSON response); add tests in `tests/unit/mcp.test.ts`
7. **Vue UI** — build component or extend view in `src/renderer/`
8. **Verify** — `npm test && npx playwright test`; for UI features, also use the MCP verification loop (see below)
9. **Docs** — update `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `docs/PLAN.md` (roadmap), `docs/DATA_MODEL.md`, `docs/IPC_REFERENCE.md`, `docs/MCP.md`
10. **Skills** — update every skill whose content is affected by this feature. This is not optional. Skills are how future agents know how to work in this codebase. Ask: which skills reference the layer I just changed?
    - New entity type or schema column → `data-modeling` skill
    - New MCP tools → `slaktforskning-mcp-dev` skill
    - New shared Vue component → `add-feature` skill (Shared components list)
    - New IPC channels → `add-feature` skill (IPC section) + `CLAUDE.md`
    - New data quality / check category → `add-feature` skill or dedicated skill
    - GEDCOM mapping changes → `gedcom` skill

## Cross-platform rules

Targets macOS, Windows, Linux from a single codebase. Number-one source of breakage is spawning external processes not guaranteed to exist.

**In app code (`src/`):** never spawn or execFile a tool the user must install separately. Use pure-JS/Node.js libraries.

| Don't (app code) | Do instead |
|------------------|------------|
| `spawnSync('unzip', ...)` | `fflate.unzipSync()` |
| `spawnSync('tar', ...)` | a JS tar library |
| ffmpeg via execFile | a wasm/JS media library |
| ImageMagick via execFile | a wasm/JS image library |

**Exception — explicit user-facing prerequisites:** Docker is required for the Genney Derby import. UI tells the user, checks for it before starting, falls back gracefully. Apply the same bar before any new external-process dependency: deliberate, checked, fallback-handled.

**In tests and dev scripts (`tests/`, `scripts/`, `forge.config.ts`):** spawning processes is fine.

## Enrich Presentation vs. Store Derived Data

When a feature derives information from existing data (auto-linking text, computed labels, resolved references), prefer computing at render time over adding new tables or columns.

**Enrich presentation (prefer):**
- Compute in a pure function, render in the component.
- No schema change, no sync obligations, works retroactively on all existing data.
- Example: `linkify()` scans source text for ArkivDigital AID codes and renders inline `<a>` tags.

**Store derived data (only when needed):**
- Computation is expensive (seconds, not milliseconds).
- Derivation requires external data not available at render time.
- Result needs to be searchable/queryable.

The data model stores facts, not interpretations. One source of truth.

## API Layer (Steps 1-4)

### Database migrations — adding columns to existing tables

`CREATE TABLE IF NOT EXISTS` never adds missing columns to an existing DB. Any new column on an existing table requires a migration guard at the end of `initializeSchema()` in `src/api/schema.ts`:

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
- One `PRAGMA table_info` call per table, check each new column separately.
- Match the column definition exactly (type, DEFAULT, constraints) to the `CREATE TABLE` statement.
- **Never skip** — missing migration = runtime crash for any user with a pre-existing database.

### SQLite quirks

Vitest tests on `node-sqlite3-wasm`; renderer/MCP on rusqlite via the db-shim. Quirks that bleed through:

- Parameter binding uses **arrays**: `stmt.run([a, b])` not `stmt.run(a, b)`.
- `db.get()` returns `undefined`, not `null` — use `?? null`.
- No `.pragma()` method — use `runSql(db, 'PRAGMA foreign_keys = ON')`.
- `.run()` returns `{ changes: number }` — cast if TypeScript complains.

Always go through `queryOne` / `queryAll` / `runSql` / `runBatch` from `src/api/db.ts` rather than raw `db.prepare(...).run(...)`. See `rules/api.md`.

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

See `/test` for the unit-test template, `createTestDb()`, per-CRUD-function negative-case checklist, and the **assert DB state, not just return values** rule.

Run after writing: `npm test -- --coverage` — 80% lines+functions coverage on `src/api/` must still pass.

## IPC Layer (Step 5)

### Adding a new window.api binding

Two paths depending on what the new operation needs.

#### Path A — pure TS over the renderer-side DB shim (most CRUD)

Add an explicit binding to `src/renderer/tauri-window-api.ts`. `mutating()` and `readOnly()` thread the renderer-side `Database` and (for mutations) fire `data:changed` afterwards:

```typescript
api.things = {
  list: readOnly((db) => things.listThings(db)),
  get: readOnly((db, id: string) => things.getThing(db, id)),
  create: mutating((db, data: Parameters<typeof things.createThing>[1]) => things.createThing(db, data)),
  update: mutating((db, id: string, data) => things.updateThing(db, id, data)),
  delete: mutating((db, id: string) => things.deleteThing(db, id)),
};
```

Binding is live on `window.api.things.*`. Mutating ones broadcast `data:changed` so `useEntityData` / `usePagedList` reload.

#### Path B — Rust-backed command (file dialog, fs, shell, multi-window, image processing)

Specta generator is the source of truth. Add the command to Rust, annotate it, `bindings.ts` regenerates:

```rust
// src-tauri/src/lib.rs (or sibling module)
#[tauri::command]
#[specta::specta]
async fn thing_export(id: String, path: String) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || things::export(&id, &path))
        .await
        .map_err(|e| e.to_string())?
}
```

Register in the `tauri_specta::Builder::collect_commands!` macro in `lib.rs`. `cargo build` regenerates `src/renderer/bindings.ts` with `commands.thingExport(id, path)`.

Then add a polyfill in `src/renderer/tauri-window-api.ts`:

```typescript
api.things.exportToFile = async (id: unknown) => {
  if (typeof id !== 'string') return { success: false, error: 'id required' };
  const r = await unwrap(commands.thingExport(id, '/tmp/x.json'));
  fireDataChanged();
  return { success: true, bytesWritten: r };
};
```

Use `unwrap()` for `Result<T, String>` returns (Specta wraps them in `{ status, data | error }` envelopes); plain `await` for `Result<T, void>`. Call `fireDataChanged()` if the command mutates renderer-observable state.

See `/tauri-bridge` for the full Specta annotation walkthrough.

#### Step 5b — type the new surface

Update `src/renderer/api.d.ts` with the method signature under `window.api.<domain>`.

#### Step 5c — Vue component use

```typescript
await window.api.things.create({ name: 'test' });
```

### Required tests after adding a binding

```bash
npx vitest run tests/unit/static-api-coverage.test.ts \
                tests/unit/tauri-window-api.test.ts
```

- `static-api-coverage` — every legacy-shaped renderer-callable channel (dialog, fs, shell) has a stub in the static SPA api for the website-export bundle.
- `tauri-window-api.test.ts` — polyfill dispatch shape for Rust-backed bindings.

Specta builder verifies that every annotated command appears in `bindings.ts` — no separate parity test.

See `docs/IPC_REFERENCE.md` for the complete `window.api` surface map.

## MCP Layer (Step 6)

See `/slaktforskning-mcp-dev` for the full pattern: `registerTool()` template, prod vs dev server split, Zod inputSchema with `.describe()`, thin-wrapper rule (logic stays in `src/api/`), and `tests/unit/mcp.test.ts` `call()` helper. MCP-tool prime directive (pass-through, never synthesize defaults) lives there.

## Vue UI Layer (Step 7)

For modal patterns, three-sheet layout, paneled-view checklist, list view + side panel pattern, shared component catalog (`BaseSubPanel`, pickers, `DateInput`, `EventModal`, `EventList`, `CitationModal`, `CitationBadge`, `AppButton`/`AppBadge`/etc.), design tokens, `@media print` rules — see `/frontend-design`. CLAUDE.md's component table lists every existing component by props/emits.

A11y patterns (combobox, focus trap, contrast tokens, `v-narrate`) live in `/a11y`.

### Adding a new entity color identity

If your new entity warrants its own color: add it to `EntityType` in `entityMeta.ts`, define `--entity-{name}-text/-bg` (light in `tokens.css`, dark + HC overrides in `shared.css`), add a `[data-entity="{name}"]` remap rule. `tests/unit/wcagContrast.test.ts` catches contrast failures across the 9 (theme × mode) combinations automatically.

### Error handling in async operations

Every `await window.api.*` mutating call must have a try/catch that shows a toast:

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

**Every per-person data section is a self-contained, reusable component** used inside `PersonPanel` and shared with any other view needing the same section. When adding, always make it a component — never inline in just one view.

#### Existing person section components

| Component | Self-loading | Exposes | Used in |
|-----------|-------------|---------|---------|
| `PersonNamesTable` | No (parent passes `names`) | — | PersonPanel |
| `PersonNameModal` | No | — | PersonPanel |
| `EventList` | Yes (`personId` / `relationshipId` / `placeId` prop) | `openAddForm()` | PersonPanel, PlacePanel |
| `ResearchTasksTable` | No (parent passes `tasks`) | — | PersonPanel, ResearchTasksView |
| `GroupsTable` | No (parent passes `groups`) | — | PersonPanel, GroupsView |
| `PersonIdentifiersSection` | Yes | `openAddForm()` | PersonPanel |
| `PersonMediaSection` / `EntityMediaSection` | Yes | `attach()` | PersonPanel + every panel hosting media |
| `PersonChecksSection` | Yes | `reload()` | PersonPanel |

#### Self-loading section component template

When the section owns its own data, **always go through `useEntityData`** — race-safe loading on id change AND auto-subscribes to `onDataChanged`. Never roll a manual `watch(() => props.id, load, { immediate: true })`. Never call `window.api.onDataChanged(...)` directly.

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
- **Always `useEntityData(toRef(props, 'personId'), loader)`** — never a manual `watch`. Composable owns race safety AND mutation reactivity.
- **Never register `window.api.onDataChanged(...)` from a component.** Composable subscribes for you.
- Export the row interface so parents can type their own refs.
- Use `defineExpose` when the parent's header button must trigger an action inside. Re-export `reload` for imperative refresh.
- Parent keeps the `<section>` header with `<h4>` and action `<button>`; component renders only the table/content.
- For new list views (left column), use `usePagedList({ ..., fetchPage })`.

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
- **Picker inputs fill their container** — `PersonPicker` / `PlacePicker` have `width: 100%`. Place inside a `<label>` or grid cell. Never wrap in `class="full-width"` override.
- **Clickable rows, no Edit buttons** — all list/table rows clickable (`@click`, `cursor: pointer`). Action buttons (Cite, Delete) use `@click.stop`.
- **2-column field-grid** — detail views use `display: grid; grid-template-columns: 1fr 1fr`. Only use `grid-column: 1 / -1` for fields needing extra width.
- **Always use `formatFullName()`** for plain-text name rendering. Import from `src/renderer/utils/nameUtils.ts`. Never inline `preferred_name ?? given_name?.split(' ')[0]`. For Vue template rendering use `<PersonName>`.

### i18n

Every user-visible string — button labels, table headers, placeholders, section headings, empty-state messages — goes through `$t('key')`. No hardcoded Swedish or English in templates or script. Even single-word labels like "Spara"/"Save".

Add all new keys to **both** `src/renderer/i18n/sv.ts` (primary) and `src/renderer/i18n/en.ts` in the same changeset.

### Component size

If a component grows beyond ~300 lines, extract sections following the Person Section Component pattern before adding more code.

### Minimizing data entry actions

Evaluate every new UI feature against the number of user actions needed.

**Principles:**

1. **Combine related entity creation** — when creating entity A always requires creating entity B, offer B's fields inline in A's form. `PersonModal` with `relatedTo` creates person + relationship + birth event + citation in one modal. Use `<details>` for optional sections.

2. **Pre-fill from context:**
   - Sex: auto-infer from role (father→M, mother→F, spouse→opposite)
   - Surname: pre-fill child's surname from parent
   - Source: remember last-used source across forms (Pinia `sourceSession`)

3. **Reduce navigation clicks** — offer actions where the user already is:
   - "Add Father/Mother/Child/Spouse" buttons on person detail and panel
   - Ghost placeholder boxes in the pedigree chart for missing parents
   - "Cite" button per event row instead of full event edit
   - "Save & Add Another" to batch-enter items

4. **Composables for multi-entity creation** — `useBirthEventCreation` pattern wraps multiple IPC calls into one function.

**Key components for data entry optimization:**
- `PersonModal` with `relatedTo` — combined person + relationship + birth event creation
- `useBirthEventCreation` composable — shared birth event + participant + citation creation
- `sourceSession` Pinia store — last-used source memory for citation pre-fill
- `EventList` cite button — quick citation without full event edit
- `EventModal` "Save & Add Another"
- Ghost placeholder boxes in `PedigreeChart`

## UI Verification (Step 8 — REQUIRED for any UI change)

**Unit tests alone do not verify UI changes** (modal lifecycle, route remount on key change, ref timing, async-gated rendering, event-bubble overlap). Before committing, verify in the running app.

- Headless / CI: `npx playwright test --project=gui-xxx`
- Interactive: ask the user to launch `npm start`, then drive via `slaktforskning-dev` MCP tools (`ui_navigate`, `ui_screenshot`, `ui_click`, `ui_get_dom`).

See `/test`, `/tauri-dev`, and `/commit` (UI changes must NOT be committed without visual verification).

## Before implementing a non-trivial feature

Use `superpowers:writing-plans`. Existing plans in `docs/plans/` (and `docs/plans/archive/`) are good templates.

**Path convention (overrides superpowers defaults):** All plans and design specs under `docs/plans/` — never `docs/superpowers/specs/` or `.claude/plans/`.
- Design spec: `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Implementation plan: `docs/plans/YYYY-MM-DD-<topic>.md` (no suffix)
- Archived (when complete): move both to `docs/plans/archive/`

When invoking `superpowers:brainstorming` or `superpowers:writing-plans`, explicitly write to `docs/plans/`. Superpowers default is `docs/superpowers/specs/` — always override.

## Speeding up with subagents

Checklist maps to focused subagents in `.claude/agents/`:

| Agent | Steps | Can run in parallel with |
|-------|-------|--------------------------|
| `api-implementer` | 1–3 | test-writer (after signatures are committed) |
| `test-writer` | 4 | — |
| `vue-ui-builder` | 7 | — |
| `ux-reviewer` | (review) | — — read-only consistency check |

Steps 5 (IPC binding) and 6 (MCP tool) have no dedicated agent — done by the implementer alongside the API code. See `tauri-bridge` for the IPC binding recipe and `slaktforskning-mcp-dev` for the MCP tool template.

Use `superpowers:subagent-driven-development` to dispatch with two-stage review (spec compliance, then code quality). Each agent commits its OWN work AND its own docs in the same commit per the `/commit` bundle rule. The last commit of a multi-commit feature handles milestone closeout (plan archival, PLAN.md roadmap update, CHANGELOG block).

## After implementing

Use `/test` to run tests. Then commit with `/commit`.

### Release-commit archival checklist

**Every release commit (`release: vX.Y.Z — …`) MUST do the following in the same commit:**

1. `git mv docs/plans/YYYY-MM-DD-<topic>.md docs/plans/archive/` — the plan file itself.
2. `git mv docs/plans/YYYY-MM-DD-<topic>-design.md docs/plans/archive/` — if a design spec exists.
3. Add a `## vX.Y.Z — description` entry to `CHANGELOG.md` with links to BOTH the archived plan and archived spec.
4. Bump `package.json` version.

**When writing plan files, the final task must explicitly include `git mv` lines for both the plan and the spec.** Common failure mode: archiving only the spec and leaving the plan file in `docs/plans/`. Reviewers check `ls docs/plans/` after every release.

If executed by a subagent via a direct-commit flow (not `/commit`), the final-task `git add` line must list the archived plan path explicitly — subagents follow plans literally and will not archive unless told.
