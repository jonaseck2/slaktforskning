---
paths:
  - "src/renderer/**/*.{ts,vue}"
  - "src/static/**/*.{ts,vue}"
  - "src/renderer/styles/*.css"
---

# Renderer Rules (Vue / static SPA)

Loads when working in the renderer or static SPA. The `/frontend-design` skill is the canonical reference for component patterns; this file holds project-wide rules and at-a-glance design tokens.

## Routes

Every entity-list view hosts its own resizable side panel. All `:id` routes navigate to the **list view with the panel pre-selected** — there are no separate detail-view components. Editing happens in modals opened from within the panel.

| Path | Component | Description |
|------|-----------|-------------|
| `/` | redirect | Redirects to `/persons` |
| `/persons`, `/persons/:personId` | `PersonsView` | Tree + list tabs + PersonPanel |
| `/relationships`, `/relationships/:id` | `RelationshipsView` | Relationship list + RelationshipPanel |
| `/sources`, `/sources/:id` | `SourcesView` | Source list + SourcePanel |
| `/places`, `/places/:id` | `PlacesView` | Map + list tabs + PlacePanel |
| `/groups`, `/groups/:id` | `GroupsView` | Group list + GroupPanel |
| `/research-tasks`, `/research-tasks/:id` | `ResearchTasksView` | Task list + ResearchTaskPanel |
| `/search` | `SearchView` | Global search across persons, relationships, sources |
| `/settings` | `SettingsView` | Theme, appearance, text size, language, database, import/export |
| `/quality` | `QualityView` | Data quality checks — row click navigates to entity panel with quality section expanded |
| `/reports` | `ReportsView` | Print-ready reports + framable charts |
| `/media` | `MediaView` | Media library browser |
| `/visualisering`, `/visualisering/:personId` | redirect | Redirect to `/persons`, `/persons/:personId` (legacy) |
| `/database`, `/import-export`, `/link-rules`, `/gazetteers` | redirect | Redirect to `/settings` |
| `/map` | redirect | Redirects to `/places` |

Router uses `createWebHashHistory()` (required for Electron file:// protocol).

## Component patterns

### Script setup

All components use Vue 3 Composition API with `<script setup lang="ts">`. `window.api` is typed globally via `src/renderer/api.d.ts` — no local `declare` needed.

### Modal Dialog Pattern

Used for all create/edit forms. Stays in context (no page navigation).

Always use `<BaseSubPanel>` from `src/renderer/components/modals/` — it handles overlay, Escape key, focus trap, and the entity-colored header. Click-outside does NOT close modals. Save labels use action verbs and are auto-derived per entity; override with `save-label` if needed. Use `tone="danger"` for destructive confirmations and `hide-save` for purely informational dialogs.

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

For nested modal flows (e.g. picking a source from inside an event), set `mode="subpanel"` on the inner modal and render it inside the parent's `#subpanels` slot — they appear side-by-side instead of stacking.

### List View + Side Panel Pattern

Every entity (persons, relationships, sources, places, groups, research tasks) follows this pattern. The `:id` route opens the same list view with the panel pre-selected — never a separate page.

- **Left pane:** list/table/map/tree of entities with `selectedId` highlighted
- **Drag handle:** `<div class="panel-drag-handle">` bound to `usePanelResize({ storageKey, maxWidthRatio })`
- **Right pane:** `<EntityPanel :entity-id="selectedId" @close="closePanel" />` rendered when `panelOpen && selectedId`
- **Reopen button:** small "▶" affordance shown when the panel is closed
- **localStorage keys:** `<entity>-selected-id`, `<entity>-panel-open`, `<entity>-panel-width`, plus per-section `<entity>-section-<name>-open`
- **Routing:** `/entity` shows the list; `/entity/:id` shows the same view with the panel pre-selected. Drive `selectId(id)` from `route.params.id` in both `onMounted` and `onActivated` (for `<keep-alive>` round-trips).
- **Cross-entity navigation:** clicking a related entity inside a panel routes to that entity's list view (which auto-opens its panel) — never inline-edit across entity types.
- **Editing:** all create/edit happens in modals (`<EntityModal mode="standalone">`) opened from inside the panel. Inline auto-save fields are limited; most edits go through the modal.
- **Infinite scroll is the default — never a hardcoded slice.** Every list/table view drives its rows through `usePagedList` with a server-paged `fetchPage(limit, offset, sortBy, sortDir, query)`, a `<div ref="sentinel" class="scroll-sentinel"></div>` after the table, and `attachSentinel(el)` wired in a `watch`. The scroll container has `flex: 1; min-height: 0; overflow-y: auto`. A view that returns the first N rows and stops (the old `find(100)` shape) is a bug — it hides data without telling the user. If the underlying API doesn't yet support paging, add `findPage(limit, offset) → { items, total }` (single scan, returns both) before building the view. Even small/derived lists (duplicates, quality issues, search results) follow this rule — what's small today grows. **Modal pickers count too:** if a picker (place tree, person picker, source picker) shows a filterable list of rows, route the filter+rows through `usePagedList` exactly like the entity-list views — same `.list-filter` wrapper, same `.list-filter-input`, same sentinel + count-label. The filter field never does its own client-side `.filter()`; it always sets `searchQuery` on the composable. For tree-shaped pickers, switch the picker between two modes — empty filter shows the lazy-expand tree, ≥2-char filter switches to a flat `usePagedList` of search results. Trying to filter a tree by walking and expanding every subtree is a performance trap.
- **Summary line is mandatory.** Every list view shows a `<p class="count-label">` above the table: `"Showing {shown} of {total} <entities>"` when paged, falling back to the singular/plural total when fully loaded. Drive it from `usePagedList`'s `items.length` and `total`.
- **`<FilterChips>` is mandatory on every center list view.** Persons, Places, Media, Sources, Relationships, Groups, Research Tasks, Quality, Duplicates — all of them. Place it between the header and the table. The chip set is **derived from the loaded entities, never hardcoded from an enum**: bucket the rows by the chosen dimension (country for places, type/status/face-tag for media, status for tasks, severity for quality, source type for sources), drop empty buckets, lead with `{ value: 'all', label: t('common.all'), count: total }`, sort the rest by count desc, and pin any unresolved/unknown bucket to the end. For derived dimensions (gazetteer-resolved country, has-coordinates, missing-on-disk) compute at render — never persist. Show a placeholder `{ value: 'all', label: t('common.loading'), count: total }` while the resolver/loader warms up. If a view feels like it has "nothing to filter on", look harder — the `place_type` chips that produced "All / Other" on every database are the cautionary tale.

The `/frontend-design` skill has the full step-by-step layout checklist (PANELED_ROUTES registration, sheet padding, drag handle wiring, paged-list wiring, chip derivation).

### Person Section Component Pattern

**Every per-person data section is a reusable component**, shared between `PersonsView` (list mode) and `PersonPanel` (the side panel hosted in PersonsView). **Never inline a section in just one view** — extract it as a component from the start.

Two flavours:

**Self-loading** (`PersonIdentifiersSection`, `PersonMediaSection`, `PersonChecksSection`, `EventList`):
- Takes `personId: string` prop
- Loads its own data with `useEntityData(toRef(props, 'personId'), loader)` — the canonical pattern. The composable handles race-safe loading on id change AND auto-subscribes to `onDataChanged` so the section refreshes after any mutation (own component, sibling section, modal, MCP call). **Never** roll a manual `watch(() => props.personId, load, { immediate: true })` and **never** call `window.api.onDataChanged(...)` directly.
- Uses `defineExpose({ action })` when the parent's header button must trigger something inside (e.g. open add form, file picker)

**Prop-driven** (`PersonNamesTable`, `ResearchTasksTable`, `GroupsTable`):
- Parent fetches data and passes it as a prop; component emits `updated` / `remove` / `edit` / `delete` back up
- Reusable across list views (e.g. `ResearchTasksTable` is used in both `ResearchTasksView` and `PersonPanel`)

Parent structure is always the same — the component renders only the table/content; the parent owns the section header. See `/add-feature` for the full template and PersonPanel wiring.

### Cross-view reactivity (left list + right panel + center view)

Every list+panel route shows three things at once: a left list of entities, a right side panel, and a center view (chart / map / timeline). When data is mutated anywhere — panel save, modal, MCP tool call, undo, import — **all three must update without the user navigating away and back**.

**The contract:**
- Use `useEntityData` for any self-loading section, panel, chart, or single-entity view.
- Use `usePagedList` for any list view.
- Both composables auto-subscribe to `window.api.onDataChanged` and reload (debounced ~150–200 ms) on every mutation, with `onScopeDispose` cleanup.
- **Components must NOT register `window.api.onDataChanged(...)` themselves.** The composables own the subscription. If a component currently does, it's a refactor target — replace with the composable.
- Opt-out: `useEntityData(idRef, loader, { subscribe: false })` for snapshot/read-only views (report previews, undo viewers). Rare.
- The only justified ad-hoc `onDataChanged` listeners are: `App.vue` (badge debouncing across all entity types) and the panel-emits-`entity-updated` Pattern-1 in views like `MapView` that need a *targeted single-row refresh* on top of the auto-subscription (cheaper than a full reload).

The mechanism: `preload/index.ts` wraps every mutating IPC call in `mutating()` which fans out to `dataChangedListeners`. Composables register and unregister against this single source of truth.

### Shared component catalog

The full list of UI primitives, modals, pickers, panels, composables, Pinia stores, reports, and report primitives lives in `/frontend-design`. Quick orientation:

- `src/renderer/components/ui/` — primitives (`AppAvatar`, `AppBadge`, `AppButton`, `AppEmptyState`, `AppInput`, `AppLoadingState`, `FilterChips`, `SectionHeader`)
- `src/renderer/components/modals/` — every modal extends `BaseSubPanel` (`PersonModal`, `EventModal`, `CitationModal`, etc.)
- `src/renderer/components/{Person,Place,Source,Relationship,Group,ResearchTask,Media}Panel.vue` — side panels, one per entity, hosted by their list view
- `src/renderer/components/reports/` — 7 keepsake reports + 5 chart prints; primitives shared across reports in `reports/primitives/`
- `src/renderer/composables/` — `usePanelResize`, `usePanelSections`, `usePersonProfilePic`, `useLifeMap`, `useMediaChronological`, `usePagedList`, etc.
- `src/renderer/stores/` — Pinia stores (`sourceSession`, `profilePic`, `reportConfig`)

### Project-wide UI rules

- **Every modal uses `BaseSubPanel`** — never `BaseModal` directly (it's the internal overlay).
- **Pickers fill their container** (`width: 100%`); never wrap them in a `class="full-width"` override.
- **Always use `formatFullName()` from `nameUtils.ts`** for plain-text person-name rendering — never inline `preferred_name ?? given_name?.split(' ')[0]`. For Vue templates, use `<PersonName>`.
- **Clickable rows, no Edit buttons** — all list/table rows are clickable (`@click`, `cursor: pointer`). Action buttons (Cite, Delete) use `@click.stop`.
- **2-column field-grid** — detail views use `display: grid; grid-template-columns: 1fr 1fr`. Only use `grid-column: 1 / -1` for fields needing extra width (e.g. long textareas).

### i18n

Every user-visible string goes through `$t('key')`. No hardcoded Swedish or English in templates or script — even single-word labels. Add new keys to **both** `src/renderer/i18n/sv.ts` (Swedish, primary) and `src/renderer/i18n/en.ts` (English) in the same changeset.

### Error handling in async operations

Every `await window.api.*` call that mutates data must have a try/catch that shows a toast. Never silently swallow errors:

```typescript
try {
  await window.api.things.create(form);
  emit('saved');
} catch (err) {
  console.error('[PersonThingsSection] save failed:', err);
  toast.error(t('errors.saveFailed'));
}
```

Use `errors.saveFailed` for mutations, `errors.deleteFailed` for deletes, `errors.loadFailed` for reads. These keys exist in both `en.ts` and `sv.ts`.

### Component size

If a component grows beyond ~300 lines, extract sections following the Person Section Component pattern before adding more code.

## UI Design System

**Design tokens** are defined in `src/renderer/styles/tokens.css` (imported first in `main.ts`). Three color themes (Forest, Nordic, Twilight) set sidebar, surface, text, and accent token values. Semantic tokens (`--error-*`, `--warning-*`, `--success-*`, `--info-*`, `--sex-*`) are theme-invariant *at the base level*, but each appearance mode (dark, high-contrast) can override them. Dark and high-contrast modes override tokens in `shared.css` **per theme** — `html.dark.theme-forest`, `html.high-contrast.theme-nordic`, etc. mirror the base theme's color identity while adjusting luminance and saturation. **Always use token variables — never hardcode hex colors.**

**WCAG 2.1 AAA compliance** is enforced for high-contrast mode by `tests/unit/wcagContrast.test.ts`, which parses `tokens.css` + `shared.css`, builds the effective palette for every (theme × appearance) combination, and asserts ≥7:1 body / ≥4.5:1 large text / ≥3:1 non-text UI. Light and dark modes are regression-tested against AA (≥4.5:1 / ≥3:1). The math lives in `src/renderer/utils/wcag.ts`. After any color-token edit, run `npx vitest run tests/unit/wcag*` — failure messages print the exact ratio and threshold. See `/a11y` for full details.

Shared classes are defined **once** in `src/renderer/styles/shared.css` (imported globally in `main.ts`). **Never redefine these in `<style scoped>` blocks** — scoped styles have higher specificity than global styles and will override the CSS variables that power the text-size accessibility feature.

**Shared classes (do NOT copy to scoped blocks):**
- Layout: `.header`, `.count-label`, `.running-hint`, `.empty`, `.empty-hint`, `.scroll-sentinel`
- Table: `.data-table`, `.data-table th/td`, `.clickable-row`, `.clickable-row:hover`
- Filter chips: `.filter-chips`, `.chip`, `.chip:hover`, `.chip.active`
- Buttons: `.btn-add`, `.btn-add:hover`, `.btn-sm`, `.btn-delete`, `.btn-delete:hover`, `.btn-cancel`, `.btn-cancel:hover`
- Modal: `.modal-overlay`, `.modal`, `.modal h3`, `.modal-actions`, `form > label`, `form input/select/textarea`
- Person links: `.person-link`, `.person-link:hover`
- Sex badges: `.sex-badge`, `.sex-M`, `.sex-F`, `.sex-U`
- Tabs: `.tab-bar`, `.tab-btn`, `.tab-btn.active`, `.tab-btn:hover`
- Side panels: `.side-panel` (right-side entity panels — bakes in surface/radius/shadow + 28px left padding for the collapse tab), `.list-column` (left-side list columns — bakes in surface/radius/shadow + 28px right padding for the collapse tab)

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

**Reference view:** `QualityView.vue` is the canonical implementation.

## Chart Outline Placeholders — Separation of Concerns

All three chart types (Pedigree, Hourglass, Descendants) share the same outline architecture via the **TreePerson** data model. When a user selects a person in any chart, outline placeholders show where new relatives can be added.

**Shared data pipeline** (`hourglass-tree.ts`):
1. **Convert** input data to TreePerson: `buildPedigreeTreePerson(PedigreeTree)`, `buildHourglassTree(HourglassTree)`, `buildDescendantTreePerson(DescendantNode)`
2. **Inject** outlines via `injectOutlines(root, selectedPersonId)` — always adds father + mother + child + spouse. No conditions, no branching.
3. **Layout** — each chart's layout algorithm positions all nodes (real + outline) identically
4. **Extract** placeholders — boxes with `PLACEHOLDER_PREFIX` IDs are moved from `boxes[]` to `placeholders[]`, lines touching them become `placeholderLines[]`
5. **Render** — real → solid boxes, outlines → dashed boxes with "+". Click handlers open `PersonModal` with `relatedTo` set.

| Chart | Orientation | Spouse outline | Child outline | Parent outlines |
|-------|-------------|---------------|---------------|-----------------|
| **Pedigree** | Horizontal (focal left, ancestors right) | Below selected, reserves leaf slot for vertical space | Left of selected (toward focal) | Right of selected (next generation) — via ancestor layout |
| **Hourglass** | Vertical (ancestors up, descendants down) | Beside selected (sex-dependent side) | Below selected | Above selected — via ancestor layout |
| **Descendants** | Vertical (focal top, descendants down) | Beside selected (edge of row) | Below selected — via descendant layout | Above selected |

**Pedigree-specific:** Spouse outlines reserve a leaf slot during `assignLeafSlots()` so the compact vertical layout naturally creates space. The outline is placed at `selBox.y + BOX_H + V_GAP` for tight couple-like spacing.

**Post-layout pass:** All three charts have a post-layout pass that places outline nodes not handled by the main traversal (e.g., spouse outlines for ancestors in pedigree, child outlines for ancestors in hourglass).

**Key rule:** The selected person ≠ the focal person. The focal person controls the tree scope. The selected person controls where outlines appear. These are independent concepts.

See `/tree-layout` for the full layout pipeline (measurement, placement, collision avoidance).

## Constants (`src/renderer/constants/eventTypes.ts`)

```typescript
EVENT_TYPE_VALUES              // 26 event types: birth, death, marriage, divorce, ..., wedding, foster_placement, other
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

- `a11y` i18n namespace — skip link label, ARIA labels for charts and controls, TTS button strings
- TTS enabled/disabled via localStorage key `slaktforskning-tts` (set from Settings > Read aloud toggle)

A standalone screen reader mode (third Read Aloud option alongside Off and Narrate) narrates every focused element, provides single-key hotkey navigation, and supports arrow-key family tree traversal.

**Architecture:**
- `v-narrate` Vue directive stores narration text on elements via WeakMap
- `useScreenReaderMode` composable manages mode state, focus-driven narration, hotkeys, and live-region observation
- `useChartNavigation` composable handles arrow-key tree traversal
- `HotkeyRegistry` class manages global + view-scoped keyboard shortcuts
- Narration builders in `src/renderer/utils/screenReaderNarration.ts`

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

**Settings:** Three-way Appearance (Light/Dark/High Contrast) and three-way Read Aloud (Off/Narrate/Screen Reader), both independent.

**i18n:** `screenReader.*` namespace (~80 keys) in both sv.ts and en.ts.

See `/a11y` for the full ARIA pattern reference (combobox, focus trap, contrast tokens).

## Drag/mouse interactions

- **Window listeners for drag, never element listeners.** Attach mousemove/mouseup to `window` on mousedown. Kill all `pointer-events` on the container during drag via CSS class (`!important` + `*` selector).
- **Never reset reactive state inside listener cleanup.** Keep `clearWindowListeners()` pure — only removes event listeners. Use a separate `resetDragState()` for refs.
- **Screen pixels during drag, fractions only on save.** Use raw `e.clientX/Y` deltas for drag math; cache display dimensions at drag start; convert to fractional coords only on mouseup.

## Maps

- **Never replace the map with a full empty state.** Always render `BaseMap` when not loading. Show a small floating pill overlay (`position: absolute; top: var(--space-xl); left: 50%; transform: translateX(-50%); z-index: 10`) with the "No places" text and an optional `router-link` action. Apply `pointer-events: auto` to the overlay and `white-space: nowrap`.
- **Leaflet icon fix happens at module level.** `BaseMap.vue` handles this centrally — don't duplicate in consuming components.
- **`usePlaceResolver` must default to all bundled gazetteers when `gazetteer_config` is null** (matches GazetteersView's behaviour) — otherwise new databases show no map pins.

## Import/export views

- Wrap option cards in `<div class="io-groups"><div class="io-group">`, never `.section`.
- Tab names are short ("Genney"). Box headings prefix "Import" / "Export". Descriptions are one sentence in third-person present ("Imports …"). No arrows, no ellipsis on buttons.

## Static SPA & website-export gotchas

The static SPA bundle reuses renderer views, so subtle quirks bite when those views run outside Electron.

- **`window.api` may be undefined in static-mode component setup.** Any composable touching `window.api` from a top-level call site (component setup, module body) needs an optional-chain guard, because the static SPA's bundled renderer views (PersonsView etc.) lazy-load and instantiate components like PersonPicker before `window.api` is wired. `useDefaultPerson` and `chartData.resolvePersonPhotoUrl` both bit us here. The renderer's own `App.vue` `onMounted` should also use `?.` for `db.onSwitched`, `undo.onPerformed`, `undo.onChanged`, `onDataChanged`.
- **Don't use Electron `protocol.handle` for content that may contain U+FFFD.** Internal Headers ByteString conversion throws `TypeError: Cannot convert argument to a ByteString — character at index N has a value of 65533`. The dist-static SPA bundle has a literal U+FFFD as a fallback glyph. Use a Blob URL instead.
- **Don't put HTML over ~1 MB into `<iframe srcdoc>`.** Chromium silently rejects oversized attribute values and the iframe falls back to loading its parent renderer's URL — looks like full-app inception inside the iframe with no console error. Use `URL.createObjectURL(new Blob([html], { type: 'text/html' }))` and bind to `iframe.src`. Revoke the previous Blob URL on each refresh and on view unmount.
- **`file://` has no CORS in Chromium — `img.crossOrigin = 'anonymous'` blocks the load.** When loading an image into a canvas for cropping/encoding, only set `img.crossOrigin = 'anonymous'` if `src` doesn't start with `file:`. Without the attribute, the canvas is tainted by file:// images, so wrap `canvas.toDataURL()` in try/catch and fall back to returning the original src.
- **Preview iframe can't reach local media — inline a thumbnail subset.** `website:buildPreviewHtml` resizes the first 24 image media to 400px JPEGs @ 70% via Electron's `nativeImage` (5 MB total budget), bakes them into `snapshot.meta.previewMediaDataUrls`, and trims `snapshot.media`/`mediaLinks`/`mediaRegions` to those IDs. `static-api.media.readAsDataUrl` checks the inlined map first, falls through to relative `./media/full/...` for the actual export.
