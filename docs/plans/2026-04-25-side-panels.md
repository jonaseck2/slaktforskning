# Universal Side Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all detail-view navigation with inline side panels so every entity type lives in a single list/tree view with a resizable panel — no separate detail-view components, no back buttons.

**Architecture:** Each list/map/tree view hosts a drag-resizable panel (following the existing PlacesView + VisualizationView pattern). Clicking a row sets `selectedId` and opens the panel. Route `/:entity/:id` navigates to the list view with the panel pre-selected. Four new panel components (SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel) are built by composing existing section components.

**Tech Stack:** Vue 3 Composition API + `<script setup>`, Vue Router hash history, `usePanelResize` composable, localStorage for panel/section state, existing section components (EventList, EntityMediaSection, PersonPicker).

**Design spec:** `docs/plans/2026-04-25-side-panels-design.md`

---

## File Map

**Renamed:**
- `src/renderer/views/PersonsView.vue` → `src/renderer/views/PersonsListTab.vue` (embedded list tab inside main persons view)
- `src/renderer/views/VisualizationView.vue` → `src/renderer/views/PersonsView.vue` (main persons view: tree + list + panel)

**Created:**
- `src/renderer/components/SourcePanel.vue`
- `src/renderer/components/RelationshipPanel.vue`
- `src/renderer/components/GroupPanel.vue`
- `src/renderer/components/ResearchTaskPanel.vue`

**Modified:**
- `src/renderer/router.ts` — route targets, remove detail-view imports, add /persons route
- `src/renderer/App.vue` — PANELED_ROUTES, CACHED_VIEWS, focus link, remove back button
- `src/renderer/views/PersonsView.vue` (was VisualizationView) — import rename, /visualisering → /persons refs
- `src/renderer/views/PersonsListTab.vue` (was PersonsView) — /visualisering → /persons refs
- `src/renderer/views/SourcesView.vue` — add panel hosting, goToDetail → selectSource
- `src/renderer/views/RelationshipsView.vue` — add panel hosting
- `src/renderer/views/GroupsView.vue` — add panel hosting
- `src/renderer/views/ResearchTasksView.vue` — add panel hosting
- `src/renderer/views/QualityView.vue` — navigateTo uses /persons/, /sources/
- `src/renderer/components/RelationshipsList.vue` — row click emits 'select' instead of navigating
- `src/renderer/components/RelationshipsTable.vue` — pass through select emit
- `src/renderer/components/GroupsTable.vue` — row click emits 'select' instead of navigating
- `src/renderer/components/ResearchTasksTable.vue` — remove inline-expand, row click emits 'select'
- Multiple components — /visualisering/ refs → /persons/
- `src/renderer/components/QualityIssuesTable.vue` — /visualisering/ → /persons/

**Deleted:**
- `src/renderer/views/PersonDetailView.vue`
- `src/renderer/views/PlaceDetailView.vue`
- `src/renderer/views/RelationshipDetailView.vue`
- `src/renderer/views/SourceDetailView.vue`
- `src/renderer/views/GroupDetailView.vue`

---

## Task 1: Rename components + update /persons route

**Files:**
- Rename: `src/renderer/views/PersonsView.vue` → `src/renderer/views/PersonsListTab.vue`
- Rename: `src/renderer/views/VisualizationView.vue` → `src/renderer/views/PersonsView.vue`
- Modify: `src/renderer/router.ts`
- Modify: `src/renderer/App.vue`
- Delete: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Rename the embedded list tab component**

```bash
mv src/renderer/views/PersonsView.vue src/renderer/views/PersonsListTab.vue
```

> **Note:** the working tree may already have this rename staged (status shows `D PersonsView.vue` + `?? PersonsListTab.vue`). If so, `mv` will fail — skip the command and verify `src/renderer/views/PersonsListTab.vue` exists with the original PersonsView content.

- [ ] **Step 2: Update the import in VisualizationView.vue**

In `src/renderer/views/VisualizationView.vue` find:
```typescript
import PersonsView from './PersonsView.vue';
```
Replace with:
```typescript
import PersonsListTab from './PersonsListTab.vue';
```
In the template, replace `<PersonsView` with `<PersonsListTab` and `</PersonsView>` with `</PersonsListTab>`.

- [ ] **Step 3: Update /visualisering refs inside PersonsListTab.vue**

In `src/renderer/views/PersonsListTab.vue` (was PersonsView.vue), replace all `/visualisering/` with `/persons/`:
- The router-link around line 96: `:to="'/visualisering/' + person.id"` → `'/persons/' + person.id`
- The router.push around line 341: `router.push(\`/visualisering/${person.id}\`)` → `router.push(\`/persons/${person.id}\`)`

- [ ] **Step 4: Rename VisualizationView to PersonsView**

```bash
mv src/renderer/views/VisualizationView.vue src/renderer/views/PersonsView.vue
```

- [ ] **Step 5: Update /visualisering refs inside PersonsView.vue (was VisualizationView)**

In `src/renderer/views/PersonsView.vue` replace every `/visualisering/` with `/persons/` and `/visualisering` with `/persons`. Also:
- Remove the back button in the tree tab bar (line ~25): delete the entire `<AppButton variant="ghost" size="sm" @click="router.back()">←</AppButton>` element.
- Lines ~170, 256, 267, 269, 279, 369, 375: change `router.push('/visualisering/' + id)` → `router.push('/persons/' + id)`, and `router.replace('/visualisering/' + id)` → `router.replace('/persons/' + id)`.

- [ ] **Step 6: Update router.ts**

Replace `src/renderer/router.ts` with:

```typescript
import { createRouter, createWebHashHistory } from 'vue-router';
import RelationshipsView from './views/RelationshipsView.vue';
import SourcesView from './views/SourcesView.vue';
import SearchView from './views/SearchView.vue';

const LAST_ROUTE_KEY = 'slaktforskning-last-route';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/persons' },
    { path: '/visualisering', redirect: '/persons' },
    { path: '/visualisering/:personId', redirect: to => `/persons/${to.params.personId}` },
    { path: '/persons', component: () => import('./views/PersonsView.vue') },
    { path: '/persons/:personId', component: () => import('./views/PersonsView.vue') },
    { path: '/relationships', component: RelationshipsView },
    { path: '/relationships/:id', component: RelationshipsView },
    { path: '/sources', component: SourcesView },
    { path: '/sources/:id', component: SourcesView },
    { path: '/search', component: SearchView },
    { path: '/places', component: () => import('./views/PlacesView.vue') },
    { path: '/places/:id', component: () => import('./views/PlacesView.vue') },
    { path: '/settings', name: 'Settings', component: () => import('./views/SettingsView.vue') },
    { path: '/import-export', component: () => import('./views/ImportExportView.vue') },
    { path: '/database', redirect: '/settings' },
    { path: '/quality', component: () => import('./views/QualityView.vue') },
    { path: '/reports', component: () => import('./views/ReportsView.vue') },
    { path: '/research-tasks', component: () => import('./views/ResearchTasksView.vue') },
    { path: '/groups', component: () => import('./views/GroupsView.vue') },
    { path: '/groups/:id', component: () => import('./views/GroupsView.vue') },
    { path: '/media', component: () => import('./views/MediaView.vue') },
    { path: '/map', redirect: '/places' },
    { path: '/link-rules', redirect: '/settings' },
    { path: '/gazetteers', redirect: '/settings' },
  ],
});

router.afterEach((to) => {
  localStorage.setItem(LAST_ROUTE_KEY, to.fullPath);
});
```

- [ ] **Step 7: Update App.vue**

a) Remove the back button in the sidebar header. Delete this element from the template:
```html
<button v-if="canGoBack" class="btn-sidebar-back" :aria-label="$t('a11y.goBack')" @click="router.back()">←</button>
```
And remove from the script:
```typescript
const navCount = ref(0);
router.afterEach(() => { navCount.value++; });
const canGoBack = computed(() => navCount.value > 0);
```
Also remove `.btn-sidebar-back` and `.btn-sidebar-back:hover` CSS blocks.

b) Update the focus indicator link (line ~20):
```html
<router-link :to="'/persons/' + focusStore.personId" class="focus-name">
```

c) Update `PANELED_ROUTES` (line ~221):
```typescript
const PANELED_ROUTES = ['/persons', '/media', '/places', '/reports', '/sources', '/relationships', '/groups', '/research-tasks'];
```

d) Update `CACHED_VIEWS` (line ~219):
```typescript
const CACHED_VIEWS = ['PersonsView', 'RelationshipsView', 'SourcesView', 'PlacesView', 'GroupsView', 'ResearchTasksView'];
```

e) Update `loadDefaultPerson` (line ~291):
```typescript
router.push('/persons/' + defaultId);
```

f) Update the screen reader `routeMap` — replace the `/visualisering` entry with `/persons`:
```typescript
'/persons': 'persons',
```
Remove the `/visualisering` and any `/visualisering/` prefixed entries from that map.

g) Update the screen-reader hotkey route in `src/renderer/composables/useScreenReaderMode.ts` (line ~156):
```typescript
{ key: 'v', action: () => _router?.push('/persons'), description: t('screenReader.hotkeyPersons') },
```
And rename the i18n key in both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`:
- `hotkeyVisualization: 'V visualisering'` → `hotkeyPersons: 'V personer'` (sv)
- `hotkeyVisualization: 'V visualization'` → `hotkeyPersons: 'V persons'` (en — verify the English wording matches existing convention)

h) **keep-alive name verification:** `CACHED_VIEWS` matches by component `name`. The project uses `@vitejs/plugin-vue` only (no `unplugin-vue-components` or `vite-plugin-vue-setup-extend`), so `<script setup>` components have no auto-derived name. After renaming the file, add to the renamed `PersonsView.vue` `<script setup>` block (and verify the other CACHED_VIEWS entries — `RelationshipsView`, `SourcesView`, `PlacesView`, `GroupsView`, `ResearchTasksView` — all have it too):
```typescript
defineOptions({ name: 'PersonsView' });
```
If the existing views are missing `defineOptions`, keep-alive caching may already be silently broken. Add it where missing as part of this step.

- [ ] **Step 8: Delete PersonDetailView.vue**

```bash
rm src/renderer/views/PersonDetailView.vue
```

- [ ] **Step 9: Verify the app launches and /persons route works**

Run `npm start`. Confirm:
- Navigating to `/` goes to `/persons`
- PersonsView (tree + list + panel) loads correctly
- Clicking a person in the list opens the panel
- `/persons/:id` in the URL opens the panel for that person
- No ← back button visible in the sidebar

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: rename /visualisering → /persons, PersonsView/PersonsListTab"
```

---

## Task 2: SourcePanel + SourcesView wiring

**Files:**
- Create: `src/renderer/components/SourcePanel.vue`
- Modify: `src/renderer/views/SourcesView.vue`
- Delete: `src/renderer/views/SourceDetailView.vue`

Context: `SourceDetailView.vue` has editable fields (title, author, source_type, publication_info, repository, url, call_number, abstract), a citations table with edit/delete, and a `CitationModal` + `CitationEditModal` for adding/editing citations. Check the exact component names in SourceDetailView.vue imports before copying them into SourcePanel.

- [ ] **Step 1: Identify citation modal component names**

```bash
grep "^import.*Citation" src/renderer/views/SourceDetailView.vue
```

Note the exact component names — they will be needed in SourcePanel.vue.

- [ ] **Step 2: Create SourcePanel.vue**

Create `src/renderer/components/SourcePanel.vue`. Model the structure on `PlacePanel.vue` — same panel-header, panel-body, panel-section pattern. Sections (matching design spec):

1. **Source** (default open) — editable fields: title, author, source_type (select), publication_info, repository, url, call_number, abstract. Each field uses `@blur="saveField('fieldname')"` to auto-save.
2. **Citations** (default open) — citations table loaded via `window.api.sources.getCitations(sourceId)`. Each row shows entity label + confidence badge + delete button. Clicking a row opens `CitationEditModal`. "+" action opens the add citation modal.
3. **Repositories** (default closed) — repositories linked to the source loaded via `window.api.repositories.getForSource(sourceId)`. Each row shows repository name + remove button. Section header "+" action shows an inline picker (or a dropdown of all repositories via `window.api.repositories.list()`) + Add button to call `window.api.sources.linkRepository(sourceId, repositoryId)`. Verify the exact IPC channel name in `docs/IPC_REFERENCE.md` before wiring.
4. **Media** (default closed) — `<EntityMediaSection entity-type="source" :entity-id="sourceId" />`.
5. **Quality** (default closed) — source-scoped quality checks. If `window.api.checks` exposes a per-source filter, use it; otherwise reuse `PersonChecksSection`'s pattern adapted to source IDs. If the check engine has no source-level checks today, leave the section header rendered with an "no checks" placeholder so the layout is consistent — do not silently drop the section.

Section state stored in localStorage with prefix `source-panel-section-`. Pattern:
```typescript
const STORAGE_PREFIX = 'source-panel-section-';
function loadBool(key: string, def: boolean) {
  const v = localStorage.getItem(STORAGE_PREFIX + key);
  return v === null ? def : v === 'true';
}
const sections = reactive({
  source: loadBool('source', true),
  citations: loadBool('citations', true),
  repositories: loadBool('repositories', false),
  media: loadBool('media', false),
  quality: loadBool('quality', false),
});
function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
  localStorage.setItem(STORAGE_PREFIX + key, String(sections[key]));
}
```

> **Note:** `useSectionState` already exists at `src/renderer/composables/useSectionState.ts` but is hardcoded for PersonPanel (typed `PersonPanelSections`, prefix `viz-panel-section-`) and cannot be reused as-is. The inline pattern above is the correct approach. If symmetry with `usePlacePanelSections` is desired, extract a `useSourcePanelSections` composable into `src/renderer/composables/` — same internal logic, just typed for SourcePanel's keys.

Data loading uses `watch(() => props.sourceId, load, { immediate: true })`.

Props: `sourceId: string | null`. Emits: `close: []`.

`saveField(field)` calls `window.api.sources.update(sourceId, { [field]: editFields[field] })`.

- [ ] **Step 3: Wire SourcesView to host the panel**

Restructure `src/renderer/views/SourcesView.vue`:

a) Change outer `<div>` to `<div class="sources-view" ref="sourcesBodyRef">`.

b) Wrap all existing content in `<div class="sources-list-sheet">`. At the bottom of that div (before `</div>`), add:
```html
<button v-if="!panelOpen && selectedSourceId" class="panel-open-btn" @click="openPanel">▶</button>
```

c) After the list sheet div, add:
```html
<template v-if="panelOpen && selectedSourceId">
  <div class="panel-drag-handle" @mousedown="(e) => startResize(e, sourcesBodyRef!)"></div>
  <div class="sources-panel" :style="{ width: panelWidth + 'px' }">
    <SourcePanel :source-id="selectedSourceId" @close="closePanel" />
  </div>
</template>
```

d) Replace `goToDetail(source.id)` calls with `selectSource(source.id)`. Add `:class="{ 'selected-row': selectedSourceId === source.id }"` to each row.

e) Add to script:
```typescript
import { useRoute } from 'vue-router';
import SourcePanel from '../components/SourcePanel.vue';
import { usePanelResize } from '../composables/usePanelResize';

const route = useRoute();
const sourcesBodyRef = ref<HTMLElement | null>(null);
const selectedSourceId = ref<string | null>(localStorage.getItem('sources-selected-id'));
const panelOpen = ref(localStorage.getItem('sources-panel-open') !== 'false');
const { panelWidth, startResize } = usePanelResize({ storageKey: 'sources-panel-width', maxWidthRatio: 0.5 });

function selectSource(id: string) {
  selectedSourceId.value = id;
  localStorage.setItem('sources-selected-id', id);
  if (!panelOpen.value) openPanel();
}
function openPanel() { panelOpen.value = true; localStorage.setItem('sources-panel-open', 'true'); }
function closePanel() { panelOpen.value = false; localStorage.setItem('sources-panel-open', 'false'); }
```

f) In `onMounted`, after `load()`, add: `if (selectedSourceId.value) openPanel();`

g) Add to `onActivated`:
```typescript
const id = route.params.id as string | undefined;
if (id) selectSource(id);
```

h) Add scoped styles:
```css
.sources-view { display: flex; height: 100%; overflow: hidden; }
.sources-list-sheet { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; position: relative; background: var(--surface); border-radius: var(--radius-lg); }
.sources-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--surface); border-radius: var(--radius-lg); }
.panel-drag-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; border-radius: 3px; }
.panel-drag-handle:hover { background: var(--surface-border); }
.panel-open-btn { position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: var(--surface); border: 1px solid var(--surface-border); border-radius: var(--radius-sm) 0 0 var(--radius-sm); padding: 8px 4px; cursor: pointer; color: var(--text-muted); font-size: var(--font-xs); }
.selected-row { background: var(--surface-hover); }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
```

- [ ] **Step 4: Delete SourceDetailView.vue**

```bash
rm src/renderer/views/SourceDetailView.vue
```

- [ ] **Step 5: Verify SourcesView with panel works**

Run `npm start`. Confirm:
- SourcesView renders as a split layout
- Clicking a source opens SourcePanel on the right
- Fields are editable (blur to save)
- Citations section loads and shows existing citations
- `/sources/:id` opens SourcesView with that source selected in the panel

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: SourcePanel + SourcesView panel hosting"
```

---

## Task 3: RelationshipPanel + RelationshipsView wiring

**Files:**
- Create: `src/renderer/components/RelationshipPanel.vue`
- Modify: `src/renderer/components/RelationshipsList.vue`
- Modify: `src/renderer/components/RelationshipsTable.vue`
- Modify: `src/renderer/views/RelationshipsView.vue`
- Delete: `src/renderer/views/RelationshipDetailView.vue`

- [ ] **Step 1: Add 'select' emit to RelationshipsList.vue**

In `src/renderer/components/RelationshipsList.vue`, the row click currently does `router.push('/relationships/' + row.id)`.

Change the three row handlers:
```html
@click="$emit('select', row.id)"
@keydown.enter="$emit('select', row.id)"
@keydown.space.prevent="$emit('select', row.id)"
```

Update defineEmits to include select:
```typescript
const emit = defineEmits<{ delete: [id: string]; select: [id: string] }>();
```

Remove `useRouter` import if it is no longer used anywhere in the file.

- [ ] **Step 2: Pass 'select' through RelationshipsTable.vue**

`RelationshipsTable.vue` wraps `RelationshipsList`. Its template currently is:
```html
<RelationshipsList :rows="rows" @delete="$emit('delete', $event)" />
```
Change to:
```html
<RelationshipsList :rows="rows" @delete="$emit('delete', $event)" @select="$emit('select', $event)" />
```
Update defineEmits:
```typescript
defineEmits<{ delete: [id: string]; select: [id: string] }>();
```

- [ ] **Step 3: Create RelationshipPanel.vue**

Create `src/renderer/components/RelationshipPanel.vue`. Model on PlacePanel. Sections (matching design spec):

1. **Relationship** (default open) — type select (RELATIONSHIP_TYPE_VALUES), subtype select (COUPLE_SUBTYPE_VALUES or PARENT_CHILD_SUBTYPE_VALUES based on type), two PersonPicker components for person1_id and person2_id, notes textarea. All fields save immediately on change (`@change` for selects, `@update:modelValue` for PersonPicker, `@blur` for textarea) via `window.api.relationships.update(id, { field: value })`.

2. **Events** (default open) — `<EventList ref="eventListRef" :relationship-id="relationship.id" hide-header />`. Section header "+" action calls `eventListRef?.openAddForm()`.

3. **Citations** (default closed) — relationship-level citations loaded via `window.api.sources.getCitationsForRelationship(relationshipId)`. Each row shows source title + page + confidence + delete button. "+" action opens `CitationForm` with `relationshipId` pre-filled.

4. **Media** (default closed) — `<EntityMediaSection entity-type="relationship" :entity-id="relationship.id" />`.

Props: `relationshipId: string | null`. Emits: `close: []`.

Section state prefix: `rel-panel-section-`. Use the same inline pattern as SourcePanel (Task 2 Step 2).

Data loading: `watch(() => props.relationshipId, load, { immediate: true })`. Store the loaded relationship in a `relationship = ref<Relationship | null>(null)` and wrap the panel body in `<template v-if="relationship">` so child components receive a non-null `relationship.id` without the `!` assertion. Load calls `window.api.relationships.get(relationshipId)`.

- [ ] **Step 4: Wire RelationshipsView to host the panel**

In `src/renderer/views/RelationshipsView.vue`:

a) Change outer `<div>` to `<div class="relationships-view" ref="relsBodyRef">`.

b) Wrap existing content in `<div class="rels-list-sheet">` with panel-open-btn at the bottom.

c) Add panel template after the list sheet (same pattern as SourcesView Task 2).

d) Update `RelationshipsTable` usage to handle `@select`:
```html
<RelationshipsTable
  v-else
  :relationships="filteredRelationships"
  @delete="removeRelationship"
  @select="selectRelationship"
/>
```

e) Add selectedRelationshipId, panelOpen, panelWidth, selectRelationship, openPanel, closePanel to script — same pattern as SourcesView but with storage keys `rels-selected-id`, `rels-panel-open`, `rels-panel-width`.

f) Import `RelationshipPanel` and `usePanelResize`. Import `useRoute`.

g) In `onMounted`, add: `if (selectedRelationshipId.value) openPanel();`

h) In `onActivated`, add: `const id = route.params.id as string | undefined; if (id) selectRelationship(id);`

i) Add CSS: same layout classes as SourcesView (`.relationships-view`, `.rels-list-sheet`, `.rels-panel`, `.panel-drag-handle`, `.panel-open-btn`, `.selected-row`).

- [ ] **Step 5: Delete RelationshipDetailView.vue**

```bash
rm src/renderer/views/RelationshipDetailView.vue
```

- [ ] **Step 6: Verify**

Run `npm start`. Confirm:
- Clicking a relationship row opens RelationshipPanel
- Type/subtype dropdowns update on change
- PersonPickers update person1/person2
- EventList loads for the relationship
- `/relationships/:id` in URL opens RelationshipsView with panel

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: RelationshipPanel + RelationshipsView panel hosting"
```

---

## Task 4: GroupPanel + GroupsView wiring

**Files:**
- Create: `src/renderer/components/GroupPanel.vue`
- Modify: `src/renderer/components/GroupsTable.vue`
- Modify: `src/renderer/views/GroupsView.vue`
- Delete: `src/renderer/views/GroupDetailView.vue`

- [ ] **Step 1: Add 'select' emit to GroupsTable.vue**

In `src/renderer/components/GroupsTable.vue`, the row click currently does `router.push('/groups/' + g.id)`.

Change to:
```html
@click="$emit('select', g.id)"
@keydown.enter="$emit('select', g.id)"
@keydown.space.prevent="$emit('select', g.id)"
```

Update defineEmits:
```typescript
const emit = defineEmits<{ remove: [id: string]; select: [id: string] }>();
```

Remove `useRouter` import if no longer used.

- [ ] **Step 2: Create GroupPanel.vue**

Create `src/renderer/components/GroupPanel.vue`. Sections:

1. **Group info** (default open) — name input (save on blur), notes textarea (save on blur). Calls `window.api.groups.update(groupId, { name, notes })`.

2. **Members** (default open) — table of members loaded via `window.api.groups.getMembers(groupId)`. Each row shows `PersonName` component + remove button. Section header "+" action shows inline PersonPicker + Add button to call `window.api.groups.addMember(groupId, personId)`. Member name is a `router-link` to `/persons/` + member.person_id.

Props: `groupId: string | null`. Emits: `close: []`.

Data loading: `watch(() => props.groupId, load, { immediate: true })`.

Note: `window.api.groups.getMembers` returns `{ person_id, given_name, surname, ... }` array — check `docs/IPC_REFERENCE.md` for the exact shape.

Section state prefix: `group-panel-section-`.

- [ ] **Step 3: Wire GroupsView to host the panel**

Replace `src/renderer/views/GroupsView.vue`. Same pattern as SourcesView:
- Outer div: `<div class="groups-view" ref="groupsBodyRef">`
- List sheet div + panel template
- `GroupsTable` gets `@select="selectGroup"` in addition to `@remove="deleteGroup"`
- Add GroupPanel import, usePanelResize, selectedGroupId, openPanel, closePanel, selectGroup
- Storage keys: `groups-selected-id`, `groups-panel-open`, `groups-panel-width`
- In `addGroup`, after creating: `selectGroup(newGroup.id)` to immediately show the panel
- CSS: same layout pattern

- [ ] **Step 4: Delete GroupDetailView.vue**

```bash
rm src/renderer/views/GroupDetailView.vue
```

- [ ] **Step 5: Verify**

Run `npm start`. Confirm:
- Clicking a group row opens GroupPanel
- Name/notes editable
- Members list + add/remove works
- `/groups/:id` opens GroupsView with panel

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: GroupPanel + GroupsView panel hosting"
```

---

## Task 5: ResearchTaskPanel + ResearchTasksView wiring

**Files:**
- Create: `src/renderer/components/ResearchTaskPanel.vue`
- Modify: `src/renderer/components/ResearchTasksTable.vue`
- Modify: `src/renderer/views/ResearchTasksView.vue`

- [ ] **Step 1: Refactor ResearchTasksTable.vue**

In `src/renderer/components/ResearchTasksTable.vue`:

a) Remove all inline-expand state and markup:
- Delete `expandedId` ref
- Delete `editForm` reactive
- Delete `toggleExpand` function and `saveEdit` function
- Delete the entire `<tr v-if="expandedId === task.id" class="expanded-row">` block and its `<td>` contents
- Delete the `expanded-row` CSS class block

b) Change the main row click:
```html
@click="$emit('select', task.id)"
@keydown.enter="$emit('select', task.id)"
@keydown.space.prevent="$emit('select', task.id)"
```
Also update aria-label: replace `$t('a11y.expandRow', ...)` with `$t('a11y.editItem', { item: task.task })`.

c) Keep the status cycle button as a quick row action (it does not require the expand panel). Keep `cycleStatus` function.

> **Decision:** the status chip stays in the table only — it is the convenient one-click "this is done now" affordance from the list view. The panel exposes status as a regular `<select>` for full editing alongside the other fields. This contradicts the design-spec phrasing "status (chip cycling)" in the Task section: treat the spec as describing the editable field, not requiring a chip-cycle UI inside the panel.

d) Add `selectedId?: string | null` to props so the table can highlight the selected row:
```typescript
const props = defineProps<{
  tasks: ResearchTask[];
  showPerson?: boolean;
  selectedId?: string | null;
}>();
```
Add `:class="{ 'selected-row': props.selectedId === task.id }"` to the `<tr>`.

e) Update defineEmits:
```typescript
const emit = defineEmits<{ updated: []; select: [id: string] }>();
```

f) Update the router-link in the person column from `/visualisering/` to `/persons/`.

- [ ] **Step 2: Check if window.api.researchTasks.get exists**

```bash
grep -n "researchTasks.*get\b\|get.*researchTask" src/preload/index.ts src/main/ipc/utility.ts 2>/dev/null | head -10
```

If `researchTasks.get(id)` does not exist in the preload, use `window.api.researchTasks.list()` and filter by id in ResearchTaskPanel: `tasks.find(t => t.id === taskId)`.

- [ ] **Step 3: Create ResearchTaskPanel.vue**

Create `src/renderer/components/ResearchTaskPanel.vue`. One section:

**Task** (default open) — editable fields: task text (input), status (select), priority (select 0-3), person_id (PersonPicker), notes (textarea), result (textarea). All save on blur/change via `window.api.researchTasks.update(taskId, { ...fields })`. Emit `updated` after each save so the parent list refreshes.

Props: `taskId: string | null`. Emits: `close: []`, `updated: []`.

Data loading: `watch(() => props.taskId, load, { immediate: true })`.

Section state prefix: `task-panel-section-`.

- [ ] **Step 4: Wire ResearchTasksView to host the panel**

In `src/renderer/views/ResearchTasksView.vue`:

a) Change outer `<div class="research-tasks">` to `<div class="research-tasks-view" ref="tasksBodyRef">`.

b) Wrap existing header + filter + table in `<div class="tasks-list-sheet">`.

c) Add panel template after the list sheet.

d) Update `ResearchTasksTable`:
```html
<ResearchTasksTable
  v-else
  :tasks="filteredTasks"
  :show-person="true"
  :selected-id="selectedTaskId"
  @updated="load"
  @select="selectTask"
/>
```

e) Add to script (same pattern as other views): ResearchTaskPanel import, usePanelResize, selectedTaskId, openPanel, closePanel, selectTask. Storage keys: `tasks-selected-id`, `tasks-panel-open`, `tasks-panel-width`.

f) In `onMounted`, add: `if (selectedTaskId.value) openPanel();`

g) `PANELED_ROUTES` and `CACHED_VIEWS` in App.vue already include `/research-tasks` and `ResearchTasksView` (updated in Task 1).

h) CSS:
```css
.research-tasks-view { display: flex; height: 100%; overflow: hidden; }
.tasks-list-sheet { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; position: relative; background: var(--surface); border-radius: var(--radius-lg); }
.tasks-panel { display: flex; flex-direction: column; overflow: hidden; background: var(--surface); border-radius: var(--radius-lg); }
.panel-drag-handle { width: 6px; cursor: col-resize; background: transparent; flex-shrink: 0; border-radius: 3px; }
.panel-drag-handle:hover { background: var(--surface-border); }
```

- [ ] **Step 5: Verify**

Run `npm start`. Confirm:
- Clicking a task row opens ResearchTaskPanel
- All fields editable
- Status cycle button still works in-row
- Saving a field emits `updated` and refreshes the list

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: ResearchTaskPanel + ResearchTasksView panel hosting"
```

---

## Task 6: Quality view navigation

**Files:**
- Modify: `src/renderer/views/QualityView.vue`
- Modify: `src/renderer/components/QualityIssuesTable.vue`

- [ ] **Step 1: Update navigateTo in QualityView.vue**

Find the `navigateTo` function (around line 211). Update it:

```typescript
function navigateTo(r: QualityResult) {
  if (r.placeIds && r.placeIds.length > 0) {
    router.push('/places/' + r.placeIds[0]);
    return;
  }
  if (r.mediaIds && r.mediaIds.length > 0) {
    router.push({ path: '/media', query: { open: r.mediaIds[0] } });
    return;
  }
  if (r.sourceIds && r.sourceIds.length > 0) {
    router.push('/sources/' + r.sourceIds[0]);
    return;
  }
  if (r.personIds.length === 0) return;
  router.push('/persons/' + r.personIds[0]);
}
```

Note: places now use `/places/:id` (route param) instead of query param, consistent with the other entities.

- [ ] **Step 1b: Make PlacesView read `route.params.id`**

Open `src/renderer/views/PlacesView.vue`. In `onActivated` (around line 238 — verify the actual location), ensure this block exists:

```typescript
const id = route.params.id as string | undefined;
if (id) selectPlace(id);
```

Also verify `onMounted` does the same on first load. Without this, navigating to `/places/:id` from QualityView (or directly from the address bar) will not pre-select the place in PlacePanel — the panel will stay closed and the navigation appears broken.

- [ ] **Step 2: Update QualityIssuesTable.vue entity link builder**

In `src/renderer/components/QualityIssuesTable.vue`, find the path builder (around line 159-160):

```typescript
if (t === 'source') return { path: '/sources/' + id };
return { path: '/persons/' + id };
```

Replace `/visualisering/` with `/persons/` (the source path is already correct).

- [ ] **Step 3: Verify**

Run `npm start`. Open Quality view. Confirm:
- Clicking a person issue navigates to `/persons/:id` → PersonsView with panel open
- Clicking a place issue navigates to `/places/:id` → PlacesView with panel open
- Clicking a source issue navigates to `/sources/:id` → SourcesView with panel open

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: quality view navigation uses /persons/, /sources/, /places/ panel routes"
```

---

## Task 7: Sweep — /visualisering refs + PlaceDetailView

**Files:**
- `src/renderer/components/MediaPanel.vue`
- `src/renderer/components/PlacePersonsSection.vue`
- `src/renderer/components/charts/PedigreeListNode.vue`
- `src/renderer/components/import/GedcomImportSection.vue`
- `src/renderer/components/import/HolgerImportSection.vue`
- `src/renderer/components/import/ArchiveSection.vue`
- `src/renderer/composables/useScreenReaderMode.ts` (handled in Task 1 Step 7g — re-grep to confirm)
- `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` (handled in Task 1 Step 7g — re-grep to confirm)
- Delete: `src/renderer/views/PlaceDetailView.vue`

- [ ] **Step 1: Find all remaining /visualisering refs**

```bash
grep -rn "visualisering" src/renderer/ --include="*.vue" --include="*.ts"
```

For each result (excluding the redirect entries in router.ts and the sv.ts label "V visualisering" if not already renamed), replace `/visualisering/` with `/persons/`.

Expected files: MediaPanel.vue, PlacePersonsSection.vue, PedigreeListNode.vue, GedcomImportSection.vue, HolgerImportSection.vue, ArchiveSection.vue. (The screen-reader composable + i18n hotkey keys should already be handled in Task 1 Step 7g — if grep still finds them, complete that work here.)

Also grep for `Visualization` (PascalCase) to catch the i18n key `screenReader.hotkeyVisualization` if it was missed:
```bash
grep -rn "hotkeyVisualization\|Visualization" src/renderer/ --include="*.vue" --include="*.ts"
```

- [ ] **Step 2: Delete PlaceDetailView.vue**

```bash
rm src/renderer/views/PlaceDetailView.vue
```

- [ ] **Step 3: Run linter and unit tests**

```bash
npm run lint
npm test
```

Expected: 0 lint errors, all unit tests pass (unit tests cover `src/api/` only, not Vue components).

If lint fails on missing imports after deletions, resolve each error — typically a removed import left a stale reference.

- [ ] **Step 4: Smoke test all views**

Run `npm start` and manually verify:
1. `/persons` — tree and list both update panel; no ← back button in sidebar
2. `/persons/:id` — correct person shown in panel
3. `/places` — list and map both show PlacePanel
4. `/sources` — SourcePanel opens on row click
5. `/sources/:id` — SourcesView opens with panel pre-selected
6. `/relationships` — RelationshipPanel opens on row click
7. `/groups` — GroupPanel opens on row click
8. `/research-tasks` — ResearchTaskPanel opens on row click
9. `/quality` — row clicks navigate to correct view + panel; entity links in QualityIssuesTable work
10. All cross-entity links (citations in PersonPanel, relationships in PersonPanel) navigate correctly

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: sweep /visualisering → /persons refs, delete PlaceDetailView"
```

---

## Post-completion checklist

- [ ] No `/visualisering` string remains in `src/` (except router.ts redirect entries):
  ```bash
  grep -rn "visualisering" src/ --include="*.vue" --include="*.ts"
  ```

- [ ] No `*DetailView.vue` files remain:
  ```bash
  ls src/renderer/views/*DetailView.vue 2>&1
  ```
  Expected: "No such file or directory"

- [ ] All panel routes work end-to-end: `/persons/:id`, `/places/:id`, `/sources/:id`, `/relationships/:id`, `/groups/:id`

- [ ] Quality view navigates correctly to entity panels

- [ ] No ← back button visible in the sidebar
