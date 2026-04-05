# View Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate redundant SQLite fetches when navigating back to a list view by keeping list views mounted in memory and reloading only when data has actually changed.

**Architecture:** A `dataVersion` Pinia store holds a counter incremented on every mutation and import. App.vue uses `<keep-alive>` to cache list view components and stable route keys so detail views still remount on ID change. Each cached list view uses `onActivated` to reload only when the version counter has advanced since its last load.

**Tech Stack:** Vue 3 Composition API, Pinia, `<keep-alive>`, `onActivated` lifecycle hook, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/stores/dataVersion.ts` | Create: new Pinia store with `version` counter + `increment()` |
| `src/renderer/App.vue` | Modify: import store, call `increment()` in `onDataChanged` + `data-imported`, replace `<router-view :key>` with keep-alive setup |
| `src/renderer/views/PersonsView.vue` | Modify: add `onActivated` reload guard |
| `src/renderer/views/RelationshipsView.vue` | Modify: add `onActivated` reload guard |
| `src/renderer/views/SourcesView.vue` | Modify: add `onActivated` reload guard |
| `src/renderer/views/PlacesView.vue` | Modify: add `onActivated` reload guard |
| `src/renderer/views/GroupsView.vue` | Modify: add `onActivated` reload guard |

---

### Task 1: dataVersion Pinia store

**Files:**
- Create: `src/renderer/stores/dataVersion.ts`

No unit test needed — this is a trivial counter store; correctness is verified by the integration behaviour in later tasks.

- [ ] **Step 1: Create the store**

Create `src/renderer/stores/dataVersion.ts`:

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useDataVersionStore = defineStore('dataVersion', () => {
  const version = ref(0);
  function increment() { version.value++; }
  return { version, increment };
});
```

- [ ] **Step 2: Run tests to confirm nothing broken**

```bash
npm test 2>&1 | tail -5
```

Expected: all 462 tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(store): add dataVersion Pinia store"
```

---

### Task 2: Wire App.vue — increment on mutations + import

**Files:**
- Modify: `src/renderer/App.vue`

This task only adds the `increment()` calls. The keep-alive template change is Task 3.

- [ ] **Step 1: Add import to the script block**

In `src/renderer/App.vue`, the script block currently starts:

```typescript
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { saveLocale } from './i18n';
import type { SupportedLocale } from './i18n';
import { useFocusStore } from './stores/focus';
```

Add after the `useFocusStore` import:

```typescript
import { useDataVersionStore } from './stores/dataVersion';
```

- [ ] **Step 2: Instantiate the store**

After `const focusStore = useFocusStore();` add:

```typescript
const dataVersionStore = useDataVersionStore();
```

- [ ] **Step 3: Increment on data-imported and onDataChanged**

The current `onMounted` block contains:

```typescript
window.addEventListener('data-imported', () => {
  loadQualityBadge();
  loadResearchBadge();
});
let qualityDebounce: ReturnType<typeof setTimeout> | null = null;
let researchDebounce: ReturnType<typeof setTimeout> | null = null;
(window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
  if (qualityDebounce) clearTimeout(qualityDebounce);
  qualityDebounce = setTimeout(loadQualityBadge, 800);
  if (researchDebounce) clearTimeout(researchDebounce);
  researchDebounce = setTimeout(loadResearchBadge, 400);
});
```

Replace with:

```typescript
window.addEventListener('data-imported', () => {
  dataVersionStore.increment();
  loadQualityBadge();
  loadResearchBadge();
});
let qualityDebounce: ReturnType<typeof setTimeout> | null = null;
let researchDebounce: ReturnType<typeof setTimeout> | null = null;
(window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
  dataVersionStore.increment();
  if (qualityDebounce) clearTimeout(qualityDebounce);
  qualityDebounce = setTimeout(loadQualityBadge, 800);
  if (researchDebounce) clearTimeout(researchDebounce);
  researchDebounce = setTimeout(loadResearchBadge, 400);
});
```

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all 462 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(app): increment dataVersion on mutations and import"
```

---

### Task 3: App.vue keep-alive template

**Files:**
- Modify: `src/renderer/App.vue` (template + script)

- [ ] **Step 1: Add CACHED_VIEWS constant to the script block**

After `const dataVersionStore = useDataVersionStore();` add:

```typescript
const CACHED_VIEWS = ['PersonsView', 'RelationshipsView', 'SourcesView', 'PlacesView', 'GroupsView'];
```

- [ ] **Step 2: Replace the router-view in the template**

Find line 69 in `src/renderer/App.vue`:

```html
      <router-view :key="$route.fullPath" />
```

Replace with:

```html
      <router-view v-slot="{ Component, route }">
        <keep-alive :include="CACHED_VIEWS">
          <component
            :is="Component"
            :key="CACHED_VIEWS.includes(route.name as string) ? (route.name as string) : route.fullPath"
          />
        </keep-alive>
      </router-view>
```

- [ ] **Step 3: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all 462 tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(app): keep-alive for list views, stable keys for detail views"
```

---

### Task 4: onActivated guards in all five list views

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`
- Modify: `src/renderer/views/RelationshipsView.vue`
- Modify: `src/renderer/views/SourcesView.vue`
- Modify: `src/renderer/views/PlacesView.vue`
- Modify: `src/renderer/views/GroupsView.vue`

Apply the same pattern to all five. The `load()` function in each view is unchanged.

- [ ] **Step 1: Update PersonsView.vue**

Find the import line:
```typescript
import { ref, reactive, onMounted, onUnmounted } from 'vue';
```
Replace with:
```typescript
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
```

Add after the `useI18n` / store imports (before `const persons = ref...`):
```typescript
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;
```

Find:
```typescript
onMounted(load);
```
Replace with:
```typescript
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

- [ ] **Step 2: Update RelationshipsView.vue**

Find:
```typescript
import { ref, reactive, onMounted, onUnmounted } from 'vue';
```
Replace with:
```typescript
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
```

Add after the existing store/router imports (before the first `ref()`):
```typescript
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;
```

Find:
```typescript
onMounted(load);
```
Replace with:
```typescript
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

- [ ] **Step 3: Update SourcesView.vue**

Find:
```typescript
import { ref, reactive, onMounted, onUnmounted } from 'vue';
```
Replace with:
```typescript
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
```

Add after the existing imports (before the first `ref()`):
```typescript
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;
```

Find:
```typescript
onMounted(load);
```
Replace with:
```typescript
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

- [ ] **Step 4: Update PlacesView.vue**

Find:
```typescript
import { ref, reactive, onMounted, onUnmounted } from 'vue';
```
Replace with:
```typescript
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
```

Add after the existing imports (before the first `ref()`):
```typescript
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;
```

Find:
```typescript
onMounted(load);
```
Replace with:
```typescript
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

- [ ] **Step 5: Update GroupsView.vue**

Find:
```typescript
import { ref, reactive, onMounted, onUnmounted } from 'vue';
```
Replace with:
```typescript
import { ref, reactive, onMounted, onActivated, onUnmounted } from 'vue';
```

Add after the existing imports (before the first `ref()`):
```typescript
import { useDataVersionStore } from '../stores/dataVersion';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;
```

Find:
```typescript
onMounted(load);
```
Replace with:
```typescript
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

- [ ] **Step 6: Run tests**

```bash
npm test 2>&1 | tail -5
```

Expected: all 462 tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(views): onActivated reload guard for all cached list views"
```
