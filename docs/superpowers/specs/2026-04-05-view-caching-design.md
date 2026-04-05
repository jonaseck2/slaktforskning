# View Caching: keep-alive + data version invalidation

## Goal

Eliminate redundant SQLite fetches when navigating back to a list view. After the first load, navigating away and back is instant unless data actually changed.

## Architecture

A `dataVersion` Pinia store holds a single integer counter. App.vue increments it on every mutation (`onDataChanged`) and on GEDCOM import (`data-imported`). Each cached list view records the version at last load; `onActivated` reloads only when the version has advanced.

`<keep-alive>` in App.vue keeps list views mounted in memory between navigations. Detail views (`/persons/:id`, `/relationships/:id`, etc.) are not cached — they get a `route.fullPath` key so they remount when the ID changes.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/stores/dataVersion.ts` | New Pinia store: `version: number`, `increment()` |
| `src/renderer/App.vue` | Increment store on `onDataChanged` + `data-imported`; replace `<router-view :key>` with keep-alive setup |
| `src/renderer/views/PersonsView.vue` | Add `onActivated` reload guard |
| `src/renderer/views/RelationshipsView.vue` | Add `onActivated` reload guard |
| `src/renderer/views/SourcesView.vue` | Add `onActivated` reload guard |
| `src/renderer/views/PlacesView.vue` | Add `onActivated` reload guard |
| `src/renderer/views/GroupsView.vue` | Add `onActivated` reload guard |

## dataVersion Store (`src/renderer/stores/dataVersion.ts`)

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDataVersionStore = defineStore('dataVersion', () => {
  const version = ref(0);
  function increment() { version.value++; }
  return { version, increment };
});
```

## App.vue Changes

**Template** — replace line 69 (`<router-view :key="$route.fullPath" />`) with:

```html
<router-view v-slot="{ Component, route }">
  <keep-alive :include="CACHED_VIEWS">
    <component
      :is="Component"
      :key="(CACHED_VIEWS as string[]).includes(route.name as string) ? (route.name as string) : route.fullPath"
    />
  </keep-alive>
</router-view>
```

**Script** — import `useDataVersionStore` and define `CACHED_VIEWS`:

```typescript
import { useDataVersionStore } from './stores/dataVersion';

const CACHED_VIEWS = ['PersonsView', 'RelationshipsView', 'SourcesView', 'PlacesView', 'GroupsView'] as const;
const dataVersionStore = useDataVersionStore();
```

**`onMounted`** — add `dataVersionStore.increment()` in both the `onDataChanged` callback and the `data-imported` listener (before the existing badge refresh calls):

```typescript
window.addEventListener('data-imported', () => {
  dataVersionStore.increment(); // new
  loadQualityBadge();
  loadResearchBadge();
});
(window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
  dataVersionStore.increment(); // new
  // existing debounced badge logic unchanged
});
```

## List View Pattern (same for all 5 views)

Add `onActivated` import alongside `onMounted`. Add a module-level `loadedVersion` variable and the `onActivated` guard:

```typescript
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
import { useDataVersionStore } from '../stores/dataVersion';

const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

// existing load() function unchanged

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
});
```

`load()` itself is unchanged in each view.

## What Is Not Changing

- Detail views (`PersonDetailView`, `RelationshipDetailView`, `SourceDetailView`, `PlaceDetailView`) — not cached, remount normally on navigation
- Database switch — App.vue already calls `window.location.reload()`, which bypasses keep-alive entirely
- The `mutating()` wrapper in preload — already fires `onDataChanged`; no change needed there
- Badge debouncing logic in App.vue — unchanged
- ResearchTasksView and QualityView — not cached (they run expensive checks on mount; caching would require additional thought)

## Staleness Behaviour

Brief staleness is acceptable. If you edit a person's name in PersonDetailView and navigate back to PersonsView, the old name is visible until the view activates and detects the version bump (one query, <10ms). The `dataVersionStore.increment()` fires synchronously in the preload's `onDataChanged` callback, so by the time `onActivated` runs the version is already updated.
