# Navigation Focus Persistence

## Goal

Keep a "selected person" (focus person) consistent across all views. When the user opens a person's detail, clicks a name in any view, or selects a node in the chart, that person becomes the app-wide focus person — remembered as you switch between views.

## Design

### Focus store (`src/renderer/stores/focus.ts`)

Pinia store with two fields:
- `personId: string | null` — the focused person's DB id
- `personName: string | null` — display name (pre-computed so sidebar doesn't need extra API calls)

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useFocusStore = defineStore('focus', () => {
  const personId = ref<string | null>(null);
  const personName = ref<string | null>(null);
  function set(id: string, name: string) { personId.value = id; personName.value = name; }
  function clear() { personId.value = null; personName.value = null; }
  return { personId, personName, set, clear };
});
```

### Where focus is set

| View / Component | When | Fields |
|---|---|---|
| `PersonDetailView` | `onMounted` (after names load) | id + computed full name |
| `PersonsView` | on row click (before navigate) | id + rendered name |
| `SearchView` | on person result click | id + name from result |
| `RelationshipDetailView` | on person name click | id + name |
| `GroupDetailView` | on member row click | id + name |

### Sidebar focus indicator (App.vue)

Below the search input, above NAVIGERA label:

```html
<div v-if="focusStore.personId" class="focus-indicator">
  <span class="focus-label">{{ $t('nav.focusPerson') }}</span>
  <router-link :to="'/persons/' + focusStore.personId" class="focus-name">
    {{ focusStore.personName }}
  </router-link>
</div>
```

### VisualizationView — two separate concepts

The viz has two distinct person roles that must not be conflated:
- **Chart focal person** — who is at the center of the pedigree/hourglass tree (determines the tree structure). Set by double-clicking a node or clicking "Visa i trädet" ("Show in tree"). URL param `/visualisering/:personId`.
- **App focus person** — the globally selected person (Pinia store). Set by single-clicking a node.

Single click on a viz node → call `focusStore.set(id, name)` + open the side panel for that person. Do NOT change the chart focal person or re-center the chart.

Double click (or existing "make focal" button) → change chart focal person, re-center. This already works.

---

## Tasks

### Task 1: Create focus store

**Files:**
- Create: `src/renderer/stores/focus.ts`

- [ ] Create `src/renderer/stores/focus.ts` with the store above
- [ ] No tests needed (Pinia stores are integration-tested via components)
- [ ] Commit: `feat(store): add focus person Pinia store`

---

### Task 2: PersonDetailView — set focus on mount

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] Import `useFocusStore` from `'../stores/focus'`
- [ ] After `primaryName.value` is set (line ~616), call `focusStore.set(personId, primaryName.value)`
- [ ] Run tests: `npm test`
- [ ] Commit: `feat(focus): set focus person in PersonDetailView`

---

### Task 3: PersonsView — set focus on row click

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`

The `goToDetail` function currently just calls `router.push`. Update it to also set focus.

Find `goToDetail`:
```typescript
function goToDetail(id: string) {
  router.push(`/persons/${id}`);
}
```

Replace with:
```typescript
function goToDetail(person: PersonRow) {
  const name = fullNameParts(person.given_name ?? null, person.surname ?? null, person.preferred_name ?? null, person.nickname ?? null).map(p => p.text).join('');
  focusStore.set(person.id, name);
  router.push(`/persons/${person.id}`);
}
```

The `PersonRow` interface already has all name fields. Update the `@click` handler from `goToDetail(person.id)` to `goToDetail(person)`.

- [ ] Read `PersonsView.vue` to confirm field names on `PersonRow`
- [ ] Import `useFocusStore` and `fullNameParts`
- [ ] Update `goToDetail` signature and body
- [ ] Update `@click="goToDetail(person.id)"` to `@click="goToDetail(person)"`
- [ ] Run tests
- [ ] Commit: `feat(focus): set focus person from PersonsView row click`

---

### Task 4: SearchView — set focus on person result click

**Files:**
- Modify: `src/renderer/views/SearchView.vue`

- [ ] Read `SearchView.vue` to find where person results are clicked / navigated
- [ ] Import `useFocusStore`
- [ ] Before `router.push` for a person result, call `focusStore.set(id, name)` using the name already present in the result row
- [ ] Run tests
- [ ] Commit: `feat(focus): set focus person from SearchView`

---

### Task 5: RelationshipDetailView + GroupDetailView — set focus on person click

**Files:**
- Modify: `src/renderer/views/RelationshipDetailView.vue`
- Modify: `src/renderer/views/GroupDetailView.vue`

- [ ] Read both views to find where person names are rendered as router-links or click targets
- [ ] In both, import `useFocusStore` and call `focusStore.set(id, name)` before/on navigation to a person
- [ ] Run tests
- [ ] Commit: `feat(focus): set focus person from RelationshipDetailView and GroupDetailView`

---

### Task 6: Sidebar focus indicator

**Files:**
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

Add a focus person indicator in the sidebar.

In `App.vue` `<script setup>`:
```typescript
import { useFocusStore } from './stores/focus';
const focusStore = useFocusStore();
```

In `App.vue` template, between the sidebar-search form and the nav-section-label:
```html
<div v-if="focusStore.personId" class="focus-indicator">
  <span class="focus-label">{{ $t('nav.focusPerson') }}</span>
  <router-link :to="'/persons/' + focusStore.personId" class="focus-name">
    {{ focusStore.personName }}
  </router-link>
</div>
```

CSS in `App.vue`:
```css
.focus-indicator {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  margin-bottom: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  border-left: 3px solid rgba(100, 180, 255, 0.7);
}
.focus-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
}
.focus-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.focus-name:hover { color: white; text-decoration: underline; }
```

i18n keys:
- `sv.ts`: `nav: { focusPerson: 'Fokusperson' }`
- `en.ts`: `nav: { focusPerson: 'Focus person' }`

- [ ] Read `sv.ts` and `en.ts` to find the `nav` key block
- [ ] Add `focusPerson` key to both locale files
- [ ] Import and wire `useFocusStore` in App.vue
- [ ] Add template block and CSS
- [ ] Start app and verify focus indicator appears after clicking a person
- [ ] Run tests
- [ ] Commit: `feat(focus): sidebar focus person indicator`

---

### Task 7: VisualizationView — single-click sets focus without re-centering

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue`

- [ ] Read `VisualizationView.vue` to find the node click handler (look for `@click` or `handleNodeClick`)
- [ ] Identify how it currently handles single-click vs double-click / focal person change
- [ ] On single-click: call `focusStore.set(nodePersonId, nodeName)` — do NOT change chart focal person or re-center
- [ ] The existing panel/side-panel that opens on click remains as-is
- [ ] Run tests
- [ ] Commit: `feat(focus): single-click viz node sets focus without re-centering`

---

### Task 8: Wire focus → Visualization "jump to" button

**Files:**
- Modify: `src/renderer/views/VisualizationView.vue` (or wherever the viz sidebar panel is)

When a node is selected (focus set), add a "Visa i trädet" / "Show in tree" button in the side panel that changes the chart focal person. This gives the user explicit control over re-centering.

- [ ] Read VisualizationView to understand the side panel structure
- [ ] If a "show in tree" / re-center action already exists, ensure it uses the focus store person
- [ ] If it doesn't exist, add a button in the side panel that calls the existing focal-person-change function
- [ ] Run tests
- [ ] Commit: `feat(focus): Show in tree button wires focus person to chart focal`
