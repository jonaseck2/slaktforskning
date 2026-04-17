---
name: add-feature
description: Add a new feature, entity type, or field to the Släktforskning codebase. Use this skill whenever implementing any new data model change, CRUD operation, IPC channel, MCP tool, or Vue UI component — even if the user just says "add X" or "implement Y". Covers the full stack: schema, API, IPC, preload, MCP, Vue.
---

# Adding a Feature to Släktforskning

This codebase has a strict layered architecture. Every data feature touches all layers in order. Skipping a layer means the feature is unreachable from either the UI or MCP agents.

## The Checklist

Follow this order. Each step builds on the previous.

1. **Types** — define or extend the TypeScript interface in `src/api/types.ts`
2. **Schema** — add/alter tables in `src/api/schema.ts`; new tables use `CREATE TABLE IF NOT EXISTS`; new columns on existing tables **must** use a migration guard block (see below)
3. **API functions** — implement CRUD in `src/api/*.ts` (pure TS, `db: Database` as first arg, no Electron deps)
4. **Unit tests** — write tests in `tests/unit/` using `createTestDb()` before wiring anything else
5. **IPC handler** — register in `src/main/ipc.ts` using `wrapHandler(channel, fn)`
6. **Preload** — expose on `window.api.*` in `src/preload/index.ts`
7. **MCP tool** — add thin wrapper in `src/mcp/createServer.ts` using `registerTool()` (Zod inputSchema, JSON response); add tests in `tests/unit/mcp.test.ts`
8. **Vue UI** — build component or extend view in `src/renderer/`
9. **Verify** — `npm test && npx playwright test`; for UI features, also use the MCP verification loop (see below)
10. **Docs** — update `README.md`, `CLAUDE.md`, `docs/PLAN.md`, `docs/DATA_MODEL.md`, `docs/IPC_REFERENCE.md`, `docs/MCP.md`
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

### Unit test pattern

```typescript
// tests/unit/things.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createThing, deleteThing, listThings } from '../../src/api/things';

let db: any;
beforeEach(() => { db = createTestDb(); });

describe('things', () => {
  it('creates and retrieves a thing', () => {
    const thing = createThing(db, { name: 'Test' });
    expect(thing.name).toBe('Test');
  });

  it('delete returns false for nonexistent id', () => {
    expect(deleteThing(db, 'nonexistent')).toBe(false);
  });
});
```

Run after writing: `npm test -- --coverage` — verify thresholds still pass (80% lines and functions on `src/api/`)

### Critical: test DB state, not just return values

For any feature involving transforms or imports, tests must assert the actual database state — not just the return value of the function. **Return-value-only tests can silently pass while the feature is broken.**

```typescript
// WRONG — only checks the return value
it('imports places', () => {
  const result = transformGenney(db, tables);
  expect(result.places).toBeGreaterThan(0); // passes even if DB insert failed
});

// RIGHT — asserts DB state
it('imports places into the database', () => {
  transformGenney(db, tables);
  expect(listPlaces(db).length).toBeGreaterThan(0); // fails if insert was skipped
});
```

**Why this matters:** The EVENT_PLACE column name bug in Genney import was invisible to tests because the test fixtures mirrored the same wrong column names. Only a DB-state assertion (`listPlaces(db).length > 0`) would have caught it. Any test that mirrors assumptions from the code under test cannot catch mismatches between those assumptions and reality.

## IPC Layer (Steps 5-6)

### Adding a new IPC channel

```typescript
// src/main/ipc.ts — import the api module at the top, then:
wrapHandler('things:create', (data) => things.createThing(getDatabase(), data as Parameters<typeof things.createThing>[1]));
wrapHandler('things:delete', (id: string) => things.deleteThing(getDatabase(), id));

// src/preload/index.ts — add to the contextBridge api object:
things: {
  create: (data: unknown) => ipcRenderer.invoke('things:create', data),
  delete: (id: string) => ipcRenderer.invoke('things:delete', id),
},

// Vue component — use it:
await window.api.things.create({ name: 'test' });
```

After adding new IPC channels, update `src/renderer/api.d.ts` to add the typed method signatures under the correct `window.api.*` namespace. This file is the single global type declaration for `window.api` — components do not declare their own `window` type.

See `docs/IPC_REFERENCE.md` for the complete existing `window.api` surface and IPC channel to API function mapping.

## MCP Layer (Step 7)

MCP tools live in `src/mcp/createServer.ts` (not `server.ts` — that file only handles DB setup and UI tools). Use `registerTool()`, not the deprecated `tool()`:

```typescript
// src/mcp/createServer.ts — inside createMcpServer(db)
server.registerTool('create_thing', {
  description: 'Create a new thing',
  inputSchema: {
    name: z.string().describe('The name of the thing'),
  },
}, async ({ name }) => {
  const result = things.createThing(db, { name });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});
```

Add corresponding tests in `tests/unit/mcp.test.ts` using the `call()` helper (InMemoryTransport pattern).

Rules:
- The tool is a **thin wrapper** — all logic stays in `src/api/`
- Use `registerTool()` not `tool()` — the 4-arg `tool()` overload is deprecated
- Add `.describe()` to every Zod parameter in `inputSchema`
- Handle not-found: return `{ content: [{ type: 'text', text: 'Thing not found' }] }`
- Use `JSON.stringify(result, null, 2)` for readable output

## Vue UI Layer (Step 8)

### script setup pattern

```vue
<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
// No local window declaration needed — window.api is typed globally via src/renderer/api.d.ts
</script>
```

### Modal dialog (for create/edit forms)

Use `<BaseModal>` — it owns the overlay, click-to-close, and Escape key. Never repeat the raw `div.modal-overlay > div.modal` shell.

```vue
<BaseModal v-if="showForm" @close="showForm = false">
  <h3>{{ $t('thing.add') }}</h3>
  <form @submit.prevent="handleSubmit">
    <!-- fields -->
    <div class="modal-actions">
      <button type="button" class="btn-cancel" @click="showForm = false">{{ $t('common.cancel') }}</button>
      <button type="submit">{{ $t('common.save') }}</button>
    </div>
  </form>
</BaseModal>
```

```typescript
import BaseModal from '../components/BaseModal.vue';
```

### List view pattern (PersonsView, RelationshipsView, SourcesView)
- Header + "Add" button opens modal
- Count label: `{{ $t('persons.showingOf', { shown: items.length, total }) }}`
- `<table>` with clickable rows navigating to `router.push('/things/:id')`
- Delete button uses `@click.stop` to prevent row navigation
- **Infinite scroll** via IntersectionObserver on a `<div ref="sentinel" class="scroll-sentinel">` after the table — **never use a "Load More" button**
- Backend must use a `listPage(limit, offset)` query that JOINs all display data in one SQL statement — no per-row IPC calls (N+1 anti-pattern)
- See `frontend-design` skill → "Data loading pattern" for the full IntersectionObserver template

### Detail view pattern (PersonDetailView, SourceDetailView)
- Load entity in `onMounted` via `useRoute().params.id`
- Auto-save on blur/change for editable fields
- Sections for related entities (events, names, citations) with embedded components

### Shared components to reuse
- `BaseModal` — modal shell with Escape key close. Click-outside does NOT close. **Always use this** — never write `div.modal-overlay > div.modal` directly. Import from `'../components/BaseModal.vue'`.
- `PersonPicker` — searchable autocomplete for selecting a person; has `width: 100%` so it fills any container
- `PlacePicker` — searchable autocomplete for selecting/creating a place; has `width: 100%` so it fills any container
- `SourcePicker` — searchable autocomplete for selecting/creating a source; inline create-new; replaces source dropdowns
- `DateInput` — separate YYYY-MM-DD inputs with auto-advance (4-digit year → month, 2-digit month → day)
- `EventForm` / `EventList` — event CRUD, embeds in detail views; event rows are clickable (no Edit button)
- `CitationForm` — attach a source citation to any entity (props: `eventId`, `personId`, `relationshipId`, `placeId`); wire `:place-id` for place views
- `CitationBadge` — green count / yellow "Unsourced" badge (props: `count: number`); use everywhere an entity may be cited; load count via `window.api.citations.forPerson/forRelationship/forPlace/forEvent`

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

**Every data section for a person is a self-contained, reusable component** shared between `PersonDetailView` (full editing view) and `PersonPanel` (side panel in VisualizationView). When adding a new per-person section, always make it a component — never inline it in just one view.

#### Existing person section components

| Component | Self-loading | Exposes | Used in |
|-----------|-------------|---------|---------|
| `PersonNamesTable` | No (parent passes `names`) | — | Detail, Panel |
| `PersonNameFormModal` | No | — | Detail, Panel |
| `EventList` | Yes (`personId` prop) | `openAddForm()` | Detail, Panel |
| `ResearchTasksTable` | No (parent passes `tasks`) | — | Detail, Panel, ResearchTasksView |
| `GroupsTable` | No (parent passes `groups`) | — | Detail, Panel, GroupsView |
| `PersonIdentifiersSection` | Yes | `openAddForm()` | Detail, Panel |
| `PersonMediaSection` | Yes | `attach()` | Detail, Panel |
| `PersonChecksSection` | Yes | `reload()` | Detail, Panel |

#### Self-loading section component template

Use this when the section owns its own data (no benefit to the parent holding the array):

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useToast } from '../composables/useToast';
import { useI18n } from 'vue-i18n';
// No local window declaration needed — window.api is typed globally via src/renderer/api.d.ts

export interface ThingRow { id: string; /* ... */ }

const props = defineProps<{ personId: string }>();
const { t } = useI18n();
const toast = useToast();
const items = ref<ThingRow[]>([]);

async function load() {
  try {
    items.value = await window.api.things.forPerson(props.personId);
  } catch (err) {
    console.error('[PersonThingsSection] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

// Expose any action the parent header button needs to trigger
defineExpose({ openAddForm: () => { showForm.value = true; } });

watch(() => props.personId, load, { immediate: true });
</script>
```

Key rules:
- Always `watch(() => props.personId, load, { immediate: true })` — never `onMounted` — so the component reloads when the panel switches person without being destroyed
- Export the row interface so parents can type their own refs (e.g. `ref<import('./PersonXxx.vue').ThingRow[]>([])`)
- Use `defineExpose` when the parent's header button must trigger an action inside the component (add form, file picker, etc.)
- The parent keeps the `<section>` header with the `<h4>` and action `<button>`; the component renders only the table/content below

#### Parent wiring (PersonDetailView style)

```vue
<section class="detail-section">
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

Every new UI feature should be evaluated against the number of user actions (clicks, selections, text entries) needed to accomplish a task. A usability analysis of this app (see `docs/plans/2026-04-10-usability-test-plan.md`) found that creating a fully-sourced 10-person family tree required ~792 actions. Six optimizations reduced this by ~50%.

**Principles — apply to any new feature:**

1. **Combine related entity creation** — When creating entity A always requires creating entity B, offer B's fields inline in A's form. Example: `AddRelatedPersonModal` creates person + relationship + birth event + citation in one modal instead of 4 separate workflows. Use `<details>` for optional sections to keep the form clean.

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
- `AddRelatedPersonModal` — combined person + relationship + birth event creation with inference
- `useBirthEventCreation` composable — shared birth event + participant + citation creation
- `sourceSession` Pinia store — last-used source memory for citation pre-fill
- `EventList` cite button — quick citation without full event edit
- `EventForm` "Save & Add Another" — batch event entry
- Ghost placeholder boxes in `PedigreeChart` — click-to-add missing parents

## MCP Verification Loop (Step 9 — for UI features)

After `npm test` passes, if the feature includes a new or modified Vue view, verify it in the running app using the MCP server's UI tools:

```
1. Confirm app is running (npm start or check with ui_screenshot)
2. Seed realistic test data via MCP data tools (create_person, add_event, etc.)
3. ui_navigate("/your-new-route")
4. ui_screenshot()   → visual confirmation the view renders
5. ui_get_dom()      → assert specific elements exist (table rows, labels, etc.)
6. ui_click()        → exercise primary interactions (add, delete, status change)
```

The MCP server shares the same SQLite database as the running app — data seeded via MCP is immediately visible in the app. This loop is faster than writing a Playwright test for every feature, and it tests the full IPC → Vue rendering stack that unit tests don't cover.

See `docs/plans/2026-04-04-mcp-agent-workflow.md` for the full MCP workflow design.

## Before implementing a non-trivial feature

Use `superpowers:writing-plans` to write a plan first. Existing plans in `docs/plans/` (and `docs/plans/archive/`) are good templates — they show the expected task structure, file map format, and TDD step granularity for this codebase.

## Speeding up with subagents

The checklist maps to four focused subagent templates in `.claude/agents/`:

| Agent | Steps | Can run in parallel with |
|-------|-------|--------------------------|
| `api-implementer` | 1–3 | test-writer (after signatures are committed) |
| `test-writer` | 4 | — |
| `ipc-mcp-wirer` | 5–7 | vue-ui-builder |
| `vue-ui-builder` | 8 | ipc-mcp-wirer |
| `doc-syncer` | 10 | — |

Use `superpowers:subagent-driven-development` to dispatch these with two-stage review (spec compliance, then code quality) after each agent.

## After implementing

Use the `/test` skill to run and write tests. Then commit with `/commit`.

**Archive completed artifacts:**
- Move finished plans from `docs/plans/` to `docs/plans/archive/`
- Move finished design specs from `docs/superpowers/specs/` to `docs/superpowers/specs/archive/`
- Update `docs/PLAN.md` pointers to archived paths and mark roadmap entries as `[done]`
