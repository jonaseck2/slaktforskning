---
paths:
  - "src/renderer/**/*.{ts,vue}"
  - "src/static/**/*.{ts,vue}"
  - "src/renderer/styles/*.css"
---

# Renderer Rules (Vue / static SPA)

Loads when working in the renderer or static SPA. The `/frontend-design` skill is the canonical reference for component patterns; this file holds project-wide rules and at-a-glance design tokens.

**Pointers:**
- Plan authoring → [.claude/rules/plans.md](../rules/plans.md).
- Layout / visual debugging → `dom-first-debugging` skill. First action on any "looks wrong" report: read the rendered DOM, not reason about CSS.
- Subagent dispatch → `subagent-handoff` skill.

## Routes

Every entity-list view hosts its own resizable side panel. All `:id` routes navigate to the **list view with the panel pre-selected** — no separate detail-view components. Editing happens in modals opened from the panel.

| Path | Component | Description |
|------|-----------|-------------|
| `/` | redirect | → `/persons` |
| `/persons`, `/persons/:personId` | `PersonsView` | Tree + list tabs + PersonPanel |
| `/sources`, `/sources/:id` | `SourcesView` | Source list + SourcePanel |
| `/places`, `/places/:id` | `PlacesView` | Map + list tabs + PlacePanel |
| `/groups`, `/groups/:id` | `GroupsView` | Group list + GroupPanel |
| `/research-tasks`, `/research-tasks/:id` | `ResearchTasksView` | Task list + ResearchTaskPanel |
| `/search` | `SearchView` | Global search across persons and sources |
| `/relationships`, `/relationships/:id` | redirect | → `/persons` (managed per-person via PersonPanel → Relations) |
| `/settings` | `SettingsView` | Theme, appearance, text size, language, database, import/export |
| `/quality` | `QualityView` | Data quality checks — row click navigates to entity panel with quality section expanded |
| `/reports` | `ReportsView` | Print-ready reports + framable charts |
| `/media` | `MediaView` | Media library browser |
| `/visualisering`, `/visualisering/:personId` | redirect | → `/persons`, `/persons/:personId` (legacy) |
| `/database`, `/import-export`, `/link-rules`, `/gazetteers` | redirect | → `/settings` |
| `/map` | redirect | → `/places` |

Router uses `createWebHashHistory()` — works under Tauri's `tauri://`, dev `http://localhost`, and the static SPA's `file://`. Don't switch to `createWebHistory()`.

## Component patterns

### Script setup

Vue 3 Composition API with `<script setup lang="ts">`. `window.api` is typed globally via `src/renderer/api.d.ts` — no local `declare` needed.

### Modal Dialog Pattern

Used for all create/edit forms. Stays in context (no page navigation).

Always use `<BaseSubPanel>` from `src/renderer/components/modals/` — it handles overlay, Escape, focus trap, entity-colored header. Click-outside does NOT close. Save labels auto-derive per entity; override with `save-label` if needed. Use `tone="danger"` for destructive confirmations, `hide-save` for informational dialogs.

```vue
<BaseSubPanel
  entity-type="person"
  :title="$t('persons.addTitle')"
  mode="standalone"
  @cancel="$emit('close')"
  @save="handleSave"
  @close="$emit('close')"
>
  <div class="ep-fields">
    <div class="ep-field">
      <span class="ep-field-label">{{ $t('persons.name') }}</span>
      <input class="ep-input" v-model="form.name" />
    </div>
  </div>
</BaseSubPanel>
```

For nested modal flows (e.g. picking a source from inside an event), set `mode="subpanel"` on the inner modal and render it inside the parent's `#subpanels` slot — appears side-by-side instead of stacking.

### List View + Side Panel Pattern

Every entity (persons, sources, places, groups, research tasks) follows this. The `:id` route opens the same list view with the panel pre-selected — never a separate page. (Relationships are not browsable as a standalone entity — managed per-person via `PersonPanel → Relations`.)

- **Left pane:** list/table/map/tree with `selectedId` highlighted.
- **Drag handle:** `<div class="panel-drag-handle">` bound to `usePanelResize({ storageKey, maxWidthRatio })`.
- **Right pane:** `<EntityPanel :entity-id="selectedId" @close="closePanel" />` when `panelOpen && selectedId`. Every right pane is an `EntityPanel`-wrapped panel — no exceptions. The shell owns surface, radius, shadow, collapse button (▶), role-label band.
- **Reopen button:** small "▶" affordance shown when panel is closed.
- **localStorage keys:** `<entity>-selected-id`, `<entity>-panel-open`, `<entity>-panel-width`, plus per-section `<entity>-section-<name>-open`.
- **Routing:** `/entity` shows the list; `/entity/:id` shows the same view with panel pre-selected. Drive `selectId(id)` from `route.params.id` in both `onMounted` and `onActivated` (for `<keep-alive>` round-trips).
- **Cross-entity navigation:** clicking a related entity inside a panel routes to that entity's list view — never inline-edit across entity types.
- **Editing:** all create/edit happens in modals (`<EntityModal mode="standalone">`) opened from inside the panel.
- **Infinite scroll is the default — never a hardcoded slice.** Every list/table drives rows through `usePagedList` with a server-paged `fetchPage(limit, offset, sortBy, sortDir, query)`, a `<div ref="sentinel" class="scroll-sentinel"></div>` after the table, and `attachSentinel(el)` wired in a `watch`. Scroll container: `flex: 1; min-height: 0; overflow-y: auto`. Views returning the first N rows and stopping (the old `find(100)` shape) are bugs. If the underlying API doesn't yet support paging, add `findPage(limit, offset) → { items, total }` first. Applies even to small/derived lists (duplicates, quality issues, search results). **Modal pickers count:** route filter+rows through `usePagedList` exactly like entity-list views — same `.list-filter` wrapper, same `.list-filter-input`, same sentinel + count-label. Filter field never does its own client-side `.filter()`; it sets `searchQuery` on the composable. For tree-shaped pickers, switch between two modes — empty filter shows the lazy-expand tree, ≥2-char filter switches to a flat `usePagedList` of search results.
- **Summary line is mandatory.** Every list view shows `<p class="count-label">` above the table: `"Showing {shown} of {total} <entities>"` when paged, falling back to total when fully loaded. Drive from `usePagedList`'s `items.length` and `total`.
- **`<FilterChips>` is mandatory on every center list view.** Persons, Places, Media, Sources, Relationships, Groups, Research Tasks, Quality, Duplicates. Place between header and table. Chip set is **derived from loaded entities, never hardcoded from an enum**: bucket rows by the dimension (country for places, type/status/face-tag for media, status for tasks, severity for quality, source type for sources), drop empty buckets, lead with `{ value: 'all', label: t('common.all'), count: total }`, sort the rest by count desc, pin unresolved/unknown to the end. For derived dimensions (gazetteer-resolved country, has-coordinates, missing-on-disk) compute at render — never persist. Show placeholder `{ value: 'all', label: t('common.loading'), count: total }` while resolver warms up.

The `/frontend-design` skill has the full step-by-step layout checklist (PANELED_ROUTES registration, sheet padding, drag handle wiring, paged-list wiring, chip derivation).

### Person Section Component Pattern

**Every per-person data section is a reusable component**, shared between `PersonsView` (list mode) and `PersonPanel` (side panel). **Never inline a section in just one view** — extract as a component from the start.

**Self-loading** (`PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `EventList`):
- Takes `personId: string` prop.
- Loads its own data with `useEntityData(toRef(props, 'personId'), loader)` — the canonical pattern. Composable handles race-safe loading on id change AND auto-subscribes to `onDataChanged` so the section refreshes after any mutation. **Never** roll a manual `watch(() => props.personId, load, { immediate: true })`. **Never** call `window.api.onDataChanged(...)` directly.
- Uses `defineExpose({ action })` when the parent's header button must trigger something inside.

**Prop-driven** (`PersonNamesTable`, `ResearchTasksTable`, `GroupsTable`):
- Parent fetches data, passes as prop; component emits `updated` / `remove` / `edit` / `delete` back up.
- Reusable across list views.

Parent structure is always the same — component renders only the table/content; parent owns the section header. See `/add-feature` for the full template.

### Cross-view reactivity (left list + right panel + center view)

Every list+panel route shows three things at once: left list, right side panel, center view (chart / map / timeline). When data is mutated anywhere — panel save, modal, MCP call, undo, import — **all three must update without navigating away**.

**Contract:**
- Use `useEntityData` for any self-loading section, panel, chart, or single-entity view.
- Use `usePagedList` for any list view.
- Both composables auto-subscribe to `window.api.onDataChanged` and reload (debounced ~150–200 ms), with `onScopeDispose` cleanup.
- **Components must NOT register `window.api.onDataChanged(...)` themselves.** The composables own the subscription. Refactor any component that does.
- Opt-out: `useEntityData(idRef, loader, { subscribe: false })` for snapshot/read-only views (report previews, undo viewers).
- The only justified ad-hoc `onDataChanged` listeners are: `App.vue` (badge debouncing across all entity types) and panel-emits-`entity-updated` Pattern-1 in views like `MapView` that need a *targeted single-row refresh* on top of the auto-subscription.

Mechanism: `preload/index.ts` wraps every mutating IPC call in `mutating()` which fans out to `dataChangedListeners`. Composables register/unregister against this source of truth.

### Per-row IPC fan-out — mandatory batching

A list rendering N rows that fires one IPC per row pins the worker for seconds on a paginated list with media in the DB.

**Contract:**
- A per-row component (`AppAvatar`, thumbnail strip, per-row `count` badge) must NOT call `window.api.*` directly. It calls a Pinia store method that **microtask-coalesces** all calls in the same tick into one batched IPC.
- Store method exposes a per-id Promise; under the hood, same-tick callers share one round-trip via the bulk endpoint (`media:profilePicRefs`, etc.).
- Bulk endpoint must be SQL-level bulk per `.claude/rules/api.md` "Bulk / Batch naming" — otherwise renderer batching is just hiding an N+1 inside one IPC.

**Reference:** `src/renderer/stores/profilePic.ts` `ensureLoaded` (microtask-batched dispatcher) + `getPersonProfilePicRefs` (single SQL query with `ROW_NUMBER() OVER PARTITION BY`).

### Existence checks — never use un-paged `list()`

`window.api.persons.list()` returns every row + joined names. Calling it to check `length === 0` hits the worker with a 22k-row query. Use a cheap probe:

```typescript
// ❌ Pulls 22k rows + joined names just to compare to zero
const persons = await window.api.persons.list();
noPersonsExist.value = persons.length === 0;

// ✅ One row + a SELECT COUNT(*) via the existing pagination path
const probe = await window.api.persons.listPage(1, 0, 'surname', 'asc') as { persons: unknown[]; total: number };
noPersonsExist.value = probe.total === 0;
```

Applies to any `*.list()` endpoint that has a paged sibling.

### Shared component catalog

Full list in `/frontend-design`. Quick orientation:

- `src/renderer/components/ui/` — primitives (`AppAvatar`, `AppBadge`, `AppButton`, `AppEmptyState`, `AppInput`, `AppLoadingState`, `FilterChips`, `SectionHeader`).
- `src/renderer/components/modals/` — every modal extends `BaseSubPanel` (`PersonModal`, `EventModal`, `CitationModal`, etc.).
- `src/renderer/components/EntityPanel.vue` — **shared shell for ALL right-side panels (no exceptions)**: `panel-collapse-btn` (▶), `panel-role-label`, `#empty` / `#header` / default body slots, optional `editable` Edit button. Every `*Panel.vue` in `src/renderer/components/` MUST use it. Only documented exception: `ExportOptionsPanel.vue` (embedded options form inside a card, not a list-view-hosted side panel). Layout consistency regression-tested by `tests/components/panel-layout-consistency.test.ts` (asserts root `.side-panel` class; rejects `.entity-panel` collision class).
- `src/renderer/components/{Person,Place,Source,Relationship,Group,ResearchTask,Media,Report,Website}Panel.vue` — side panels.
- `src/renderer/components/reports/` — 7 keepsake reports + 5 chart prints; primitives in `reports/primitives/`.
- `src/renderer/composables/` — **canonical reactive loaders:** `useEntityData(idRef, loader)` and `usePagedList({ defaultSortBy, fetchPage })`. Also: `useEditableFields(idRef, dataRef, persist)`, `usePanelResize`, `usePanelSections`, `useResizableColumns({ tableId, columns })`, `usePersonProfilePic`, `useLifeMap`, `useMediaChronological`.
- `src/renderer/utils/storage-keys.ts` — typed `STORAGE_KEYS` registry. Every `localStorage.{get,set,remove}Item('...')` call site uses an entry from here. Helpers: `getJSON(key, fallback)`, `setJSON(key, value)`, `removeKey(key)`.
- `src/renderer/stores/` — Pinia stores (`sourceSession`, `profilePic`, `reportConfig`, `dataVersion` — incremented by `App.vue` for badge debouncing only).

### Class-name collision check (mandatory)

Before introducing a new CSS class name on any element in `src/renderer/`, grep `shared.css` and every existing `<style scoped>` block. **Class names in `shared.css` are the project's reserved namespace** — picking an already-used name silently inherits whatever rules `shared.css` set.

```bash
grep -RIn '\.<new-class-name>\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/ | grep -v ':// '
```

If any hit returns from `shared.css`, **rename your class**. Hits in scoped blocks of unrelated components are usually fine (Vue scoping isolates them) but inspect first.

### Pattern migrations are all-or-nothing

Component-level companion to `.claude/rules/plans.md` Rule A2. When a refactor touches a reusable pattern (side panel, list view, modal, chart), every instance migrates in the same change or it doesn't ship.

Before merging:
1. Enumerate every same-shaped component. Panels: `src/renderer/components/*Panel.vue`. List views: every entity-list in `src/renderer/views/`. Modals: every consumer of `BaseSubPanel`.
2. Migrate every one. Plan's "Scope" section lists them per `.claude/rules/plans.md` Rule A2.
3. If a target genuinely can't adopt the new pattern, document why in the plan AND in a code comment in the unmigrated file (`/* Not migrated to <pattern>: <specific reason> */`). "Awkward" is not a reason.

### CTA fulfillment check (every panel-section action button)

Apply on every section-header action in `*Panel.vue` and section components. Label-shape review (owned by `panel-cta-conventions.test.ts`) is necessary but not sufficient. Two failure modes it misses: (a) button wired to a no-op or the same handler as a sibling section; (b) modal that opens with no awareness of the panel it was opened from.

For each CTA, ask all five questions:

1. **Promise** — what does the label literally claim? (`+ Event` promises an event is created.)
2. **Wiring** — does the handler actually perform that primitive? Anti-patterns: identical to a sibling section's handler, scroll-only, opens a modal that creates an unrelated entity.
3. **Context lift** — this section is hosted on a specific entity. Does that entity ID flow into the action as a default prop on whatever modal/picker opens? Test: if the modal would behave identically opened from any other entity's panel, context wasn't lifted.
4. **Lifecycle parity** — can the user also edit, view, and delete the same primitive from this surface?
5. **Reactivity** — after the mutation completes, does the section's list update without a route change or panel re-open? Usually free via `useEntityData` / `usePagedList`; verify on first wiring of any new section.

UX_INVENTORY's "✅ resolved" status reflects intent, not delivery. Read the code, run the check, then update the doc.

### Project-wide UI rules

- **Every modal uses `BaseSubPanel`** — never `BaseModal` directly (internal overlay).
- **Pickers fill their container** (`width: 100%`); never wrap in `class="full-width"` override.
- **Always use `formatFullName()` from `nameUtils.ts`** for plain-text person-name rendering — never inline `preferred_name ?? given_name?.split(' ')[0]`. For Vue templates, use `<PersonName>`.
- **Clickable rows, no Edit buttons** — all list/table rows are clickable (`@click`, `cursor: pointer`). Action buttons (Cite, Delete) use `@click.stop`.
- **2-column field-grid** — detail views use `display: grid; grid-template-columns: 1fr 1fr`. Use `grid-column: 1 / -1` only for fields needing extra width.
- **Tables with mixed cell-content widths use `useResizableColumns`** — when a table has a small badge column next to a long-text message column (Quality, Person events, Source citations), default flexible-layout produces sparse columns. Add `class="data-table table-resizable"`, bind `:style="{ width: widths.<key> + 'px' }"` on each `<th>`, put `<span class="col-resize-handle" @mousedown.prevent="startResize($event, '<key>')" />` inside each header cell. Widths persist to `localStorage["slaktforskning-table-cols-<tableId>"]` per-table; pick a stable unique `tableId`. **The wrapping element must have `overflow-x: auto`** so columns wider than the viewport scroll horizontally instead of clipping.
- **Never combine `table-layout: fixed` with `width: 100%`** — they fight. The browser scales every column width down proportionally to fit `width: 100%`, so inline column widths from drag-handlers get squashed. `.table-resizable` overrides to `width: auto; min-width: 100%`. If reaching for `table-layout: fixed`, the resizable-columns pattern is what you want.

### i18n

Every user-visible string goes through `$t('key')`. No hardcoded Swedish or English in templates or script — even single-word labels. Add new keys to **both** `src/renderer/i18n/sv.ts` (primary) and `src/renderer/i18n/en.ts` in the same changeset.

### Error handling in async operations

Every `await window.api.*` call that mutates data must have a try/catch that shows a toast:

```typescript
try {
  await window.api.things.create(form);
  emit('saved');
} catch (err) {
  console.error('[PersonThingsSection] save failed:', err);
  toast.error(t('errors.saveFailed'));
}
```

Use `errors.saveFailed` for mutations, `errors.deleteFailed` for deletes, `errors.loadFailed` for reads. Keys exist in both `en.ts` and `sv.ts`.

### Component size

If a component grows beyond ~300 lines, extract sections following the Person Section Component pattern before adding more code.

## UI Design System

**Design tokens** in `src/renderer/styles/tokens.css` (imported first in `main.ts`). Three color themes (Forest, Nordic, Twilight) set sidebar, surface, text, accent token values. Semantic tokens (`--error-*`, `--warning-*`, `--success-*`, `--info-*`, `--sex-*`) are theme-invariant at the base level; each appearance mode (dark, high-contrast) can override. Dark and high-contrast modes override tokens in `shared.css` **per theme** — `html.dark.theme-forest`, `html.high-contrast.theme-nordic`, etc. mirror the base theme's color identity while adjusting luminance/saturation. **Always use token variables — never hardcode hex colors.**

**WCAG 2.1 AAA compliance** is enforced for high-contrast mode by `tests/unit/wcagContrast.test.ts`, which parses `tokens.css` + `shared.css`, builds the effective palette for every (theme × appearance) combination, asserts ≥7:1 body / ≥4.5:1 large text / ≥3:1 non-text UI. Light and dark modes regression-tested against AA (≥4.5:1 / ≥3:1). Math in `src/renderer/utils/wcag.ts`. After any color-token edit, run `npx vitest run tests/unit/wcag*`. See `/a11y`.

Shared classes are defined **once** in `src/renderer/styles/shared.css` (imported globally in `main.ts`). **Never redefine these in `<style scoped>` blocks** — scoped styles have higher specificity than global and will override CSS variables that power text-size accessibility.

**Shared classes (do NOT copy to scoped blocks):**
- Layout: `.header`, `.count-label`, `.running-hint`, `.empty`, `.empty-hint`, `.scroll-sentinel`
- Table: `.data-table`, `.data-table th/td`, `.clickable-row`, `.clickable-row:hover`
- Filter chips: `.filter-chips`, `.chip`, `.chip:hover`, `.chip.active`
- Buttons: `.btn-add`, `.btn-add:hover`, `.btn-sm`, `.btn-delete`, `.btn-delete:hover`, `.btn-cancel`, `.btn-cancel:hover`
- Modal: `.modal-overlay`, `.modal`, `.modal h3`, `.modal-actions`, `form > label`, `form input/select/textarea`
- Person links: `.person-link`, `.person-link:hover`
- Sex badges: `.sex-badge`, `.sex-M`, `.sex-F`, `.sex-U`
- Tabs: `.tab-bar`, `.tab-btn`, `.tab-btn.active`, `.tab-btn:hover`
- Side panels: `.side-panel` (right-side entity panels — bakes in surface/radius/shadow + 28px left padding for collapse tab), `.list-column` (left-side list columns — bakes in surface/radius/shadow + 28px right padding for collapse tab)

**Design token categories** (from `tokens.css`):
```css
/* Sidebar */     --sidebar-bg, --sidebar-text, --sidebar-text-muted, --sidebar-active-bg, --sidebar-active-text, --sidebar-border
/* Surface */     --surface-bg, --surface, --surface-hover, --surface-border, --surface-border-subtle
/* Text */        --text-primary, --text-secondary, --text-muted
/* Accent */      --accent, --accent-hover, --accent-text
/* Semantic */    --error-bg/text, --warning-bg/text, --success-bg/text, --info-bg/text
/* Sex badges */  --sex-m-bg/text, --sex-f-bg/text, --sex-u-bg/text
/* Fan branches */--fan-branch-1, --fan-branch-2, --fan-branch-3, --fan-branch-4 (per-theme, read by readThemeColors())
/* Spacing */     --space-xs(4) --space-sm(8) --space-md(12) --space-lg(16) --space-xl(24) --space-2xl(32)
/* Typography */  --font-xs(11) --font-sm(13) --font-base(14) --font-md(15) --font-lg(16)
/* Shape */       --radius-sm(4) --radius-md(6) --radius-lg(10) --radius-full(9999)
/* Shadows */     --shadow-sm, --shadow-md, --shadow-lg
/* Reports */     --report-serif-stack, --report-prose-leading, --report-page-max-width, --report-cover-accent-height
```

**Person name links:** `<router-link :to="'/persons/' + personId" class="person-link" @click.stop>` in table cells.

**Reference view:** `QualityView.vue`.

## Chart Outline Placeholders — Separation of Concerns

All three chart types (Pedigree, Hourglass, Descendants) share the same outline architecture via the **TreePerson** data model. When the user selects a person in any chart, outline placeholders show where new relatives can be added.

**Shared data pipeline** (`hourglass-tree.ts`):
1. **Convert** input to TreePerson: `buildPedigreeTreePerson(PedigreeTree)`, `buildHourglassTree(HourglassTree)`, `buildDescendantTreePerson(DescendantNode)`.
2. **Inject** outlines via `injectOutlines(root, selectedPersonId)` — always adds father + mother + child + spouse. No conditions, no branching.
3. **Layout** — each chart's algorithm positions all nodes (real + outline) identically.
4. **Extract** placeholders — boxes with `PLACEHOLDER_PREFIX` IDs moved from `boxes[]` to `placeholders[]`; lines touching them become `placeholderLines[]`.
5. **Render** — real → solid boxes, outlines → dashed boxes with "+". Click handlers open `PersonModal` with `relatedTo` set.

| Chart | Orientation | Spouse outline | Child outline | Parent outlines |
|-------|-------------|---------------|---------------|-----------------|
| **Pedigree** | Horizontal (focal left, ancestors right) | Below selected, reserves leaf slot for vertical space | Left of selected (toward focal) | Right of selected (next generation) — via ancestor layout |
| **Hourglass** | Vertical (ancestors up, descendants down) | Beside selected (sex-dependent side) | Below selected | Above selected — via ancestor layout |
| **Descendants** | Vertical (focal top, descendants down) | Beside selected (edge of row) | Below selected — via descendant layout | Above selected |

**Pedigree-specific:** Spouse outlines reserve a leaf slot during `assignLeafSlots()` so the compact vertical layout creates space. Outline placed at `selBox.y + BOX_H + V_GAP` for tight couple-like spacing.

**Post-layout pass:** all three charts have a post-layout pass that places outline nodes not handled by the main traversal (e.g., spouse outlines for ancestors in pedigree, child outlines for ancestors in hourglass).

**Key rule:** selected person ≠ focal person. Focal controls tree scope. Selected controls where outlines appear. Independent concepts.

See `/tree-layout` for the full layout pipeline.

## Constants (`src/renderer/constants/eventTypes.ts`)

```typescript
EVENT_TYPE_VALUES              // 30 event types: birth, death, marriage, ..., foster_placement, travel, title, religion, description, fact, other
PERSON_EVENT_TYPE_VALUES       // EVENT_TYPES minus marriage/divorce/wedding
RELATIONSHIP_EVENT_TYPE_VALUES // marriage, divorce, wedding, census, other
DATE_TYPE_VALUES               // exact, about, before, after, between, calculated, unknown
CONFIDENCE_LEVEL_VALUES        // 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary
SOURCE_TYPE_VALUES             // vital_record, census, church_record, newspaper, ...
RELATIONSHIP_TYPE_VALUES       // couple, parent_child, sibling, godparent, other
COUPLE_SUBTYPE_VALUES          // marriage, civil_union, cohabitation, living_apart, relationship, unknown, other
PARENT_CHILD_SUBTYPE_VALUES    // biological, adopted, foster, step, unknown
EVENT_PARTICIPANT_ROLE_VALUES  // primary, spouse, parent, child, witness, godparent, officiant, other
NAME_TYPE_VALUES               // birth, married, alias, aka
```

## Accessibility / i18n / Screen Reader Mode

- `a11y` i18n namespace — skip link label, ARIA labels for charts and controls, TTS button strings.
- TTS enabled/disabled via localStorage key `slaktforskning-tts`.

Standalone screen reader mode (third Read Aloud option) narrates every focused element, provides single-key hotkey navigation, supports arrow-key family tree traversal.

**Architecture:**
- `v-narrate` Vue directive stores narration text on elements via WeakMap.
- `useScreenReaderMode` composable manages mode state, focus-driven narration, hotkeys, live-region observation.
- `useChartNavigation` composable handles arrow-key tree traversal.
- `HotkeyRegistry` class manages global + view-scoped keyboard shortcuts.
- Narration builders in `src/renderer/utils/screenReaderNarration.ts`.

**Global hotkeys (screen reader mode only):**

| Key | Action |
|-----|--------|
| `?` | List available commands |
| `P/R/S/L/T/V/Q/D` | Navigate to Persons/Relationships/Sources/Places/Tasks/Visualization/Quality/Database |
| `F` or `/` | Focus search |
| `H` | Go home |
| `N` | Add new item |
| `E` | Edit focused item |
| `Delete` | Delete focused item |
| `1-6` | Jump to section (detail views) |
| `Arrow keys` | Navigate family tree (charts) |
| `Ctrl+.` | Stop speech |

**Settings:** three-way Appearance (Light/Dark/High Contrast) and three-way Read Aloud (Off/Narrate/Screen Reader), both independent.

**i18n:** `screenReader.*` namespace (~80 keys) in both `sv.ts` and `en.ts`.

See `/a11y` for the full ARIA pattern reference.

## Drag/mouse interactions

- **Window listeners for drag, never element listeners.** Attach mousemove/mouseup to `window` on mousedown. Kill all `pointer-events` on the container during drag via CSS class (`!important` + `*` selector).
- **Never reset reactive state inside listener cleanup.** Keep `clearWindowListeners()` pure — only removes event listeners. Use a separate `resetDragState()` for refs.
- **Screen pixels during drag, fractions only on save.** Use raw `e.clientX/Y` deltas; cache display dimensions at drag start; convert to fractional coords only on mouseup.

## Maps

- **Never replace the map with a full empty state.** Always render `BaseMap` when not loading. Show a small floating pill overlay (`position: absolute; top: var(--space-xl); left: 50%; transform: translateX(-50%); z-index: 10`) with the "No places" text and an optional `router-link` action. Apply `pointer-events: auto` to the overlay and `white-space: nowrap`.
- **Leaflet icon fix happens at module level.** `BaseMap.vue` handles centrally — don't duplicate in consuming components.
- **`usePlaceResolver` must default to all bundled gazetteers when `gazetteer_config` is null** — otherwise new databases show no map pins.

## Import/export views

- Wrap option cards in `<div class="io-groups"><div class="io-group">`, never `.section`.
- Tab names are short ("Genney"). Box headings prefix "Import" / "Export". Descriptions are one sentence in third-person present ("Imports …"). No arrows, no ellipsis on buttons.

## Static SPA & website-export gotchas

The static SPA bundle reuses renderer views, so quirks bite when those views run outside the Tauri host.

- **`window.api` may be undefined in static-mode component setup.** Any composable touching `window.api` from a top-level call site needs an optional-chain guard, because the static SPA's bundled renderer views lazy-load and instantiate components like PersonPicker before `window.api` is wired. The renderer's own `App.vue` `onMounted` should use `?.` for `db.onSwitched`, `undo.onPerformed`, `undo.onChanged`, `onDataChanged`.
- **Don't put HTML over ~1 MB into `<iframe srcdoc>`.** Chromium silently rejects oversized attribute values and the iframe falls back to loading its parent renderer's URL. Use `URL.createObjectURL(new Blob([html], { type: 'text/html' }))` and bind to `iframe.src`. Revoke the previous Blob URL on each refresh and on view unmount.
- **`file://` has no CORS in Chromium — `img.crossOrigin = 'anonymous'` blocks the load.** When loading an image into a canvas for cropping/encoding, only set `img.crossOrigin = 'anonymous'` if `src` doesn't start with `file:`. Without the attribute, canvas is tainted by `file://` images, so wrap `canvas.toDataURL()` in try/catch and fall back to returning the original src.
- **Preview iframe can't reach local media — inline a thumbnail subset.** `website:buildPreviewHtml` resizes the first 24 image media to 400 px JPEGs @ 70% (5 MB total budget) via the Rust-side `media_*` commands, bakes them into `snapshot.meta.previewMediaDataUrls`, trims `snapshot.media`/`mediaLinks`/`mediaRegions` to those IDs. `static-api.media.readAsDataUrl` checks the inlined map first, falls through to relative `./media/full/...` for the actual export.
- **The preview iframe sets `window.__SNAPSHOT__` via the `<!--PREVIEW_SNAPSHOT_INJECTION_POINT-->` marker in `src/static/index.html`.** `src/main/preview-html-inject.ts` `injectSnapshotIntoHtml(html, snapshot)` is the pure swap; it **throws** if the marker is missing rather than returning the unmodified bundle. Never silently no-op a string-replace against a build artifact whose source you don't fully control. Stable purpose-named comment marker + thrown error on miss; regression-tested in `tests/unit/preview-html-inject.test.ts`.
