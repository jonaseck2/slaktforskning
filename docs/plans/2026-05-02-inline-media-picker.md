# Inline Media Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (with the project `subagent-handoff` template) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## User goal

In every right-side entity panel that has a media section, attaching a photo means **one inline interaction**: type a few letters of an existing media item to link it, or click 📎 to upload a new file — without losing the context of the panel I'm looking at. All three section flavors (PersonMediaSection, EntityMediaSection, LinkedMediaSection) expose the same picker shape.

## Scope

| Section component | Hosting panels | Migration |
|---|---|---|
| `PersonMediaSection` | PersonPanel | grow inline picker (replaces direct file-dialog `attach()`) |
| `EntityMediaSection` | PlacePanel, RelationshipPanel, SourcePanel | grow inline picker (replaces direct file-dialog `attach()`) |
| `LinkedMediaSection` | GroupPanel, ResearchTaskPanel | refactor to use shared `MediaAddRow`; gain 📎 file-upload path |

**Scope deviations:** none. All three section flavors migrate together; all six hosting panels behave identically from the user's point of view after this change.

**Out of scope:** unifying `media` and `sources` into one GEDCOM-X `SourceDescription` table; switching the GEDCOM exporter from inline `OBJE` to pointer-style `OBJE`; inline-editing media titles/notes from the panel.

## Verification (user-observable)

The plan is complete when **all** of these are true in the running app:

1. Opening each of the six panels (`/persons/:id`, `/places/:id`, `/relationships/:id`, `/sources/:id`, `/groups/:id`, `/research-tasks/:id`) and clicking `+ Attach` reveals the same inline `[picker | Add | Cancel]` row.
2. Picking an existing media in one panel and then attaching the *same* media via the picker in a different entity's panel produces two `media_links` rows (verified by both panels showing the photo with the same thumbnail).
3. The in-field 📎 icon and the dropdown footer item both upload a new file. Title is prefilled from the search query when one is present.
4. A media item already linked to the current entity does **not** appear in that entity's picker dropdown (it still appears in other entities' dropdowns).
5. The component-consistency test (Task 8) passes.

Lint + the unit suite passing is hygiene, not user-goal verification — items 1–4 must be exercised in the running app before the plan closes.

## Failure modes / RCA reference

The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent panels because tasks were scoped at "the 6 panels" without acknowledging that those 6 panels actually use 3 different section components. This plan enumerates the three flavors in §Scope and verifies user-observable shape (Task 8 component test + items 1–4 above) — not just "vitest passes". Don't merge with one section flavor unmigrated.

The `media_links` table has **no UNIQUE constraint** on `(media_id, entity_type, entity_id)` — accidentally creating duplicate rows is silently legal. Task 3's `excludeIds` filter is the user-facing guard against this.

---

**Goal:** Add an autocomplete-with-file-upload media picker to all six entity panels, unifying the three current section flavors on a shared `MediaAddRow` component.

**Architecture:** Enhance the existing `MediaPicker.vue` (add 📎 + filter), wrap it in a new `MediaAddRow.vue` that emits `committed: { mediaId }`. Add a new `media:createFromFile` IPC that creates a media row without any link (callers add the link in the appropriate join table). Three section flavors render `<MediaAddRow>` and call the right link-table API on commit.

**Tech Stack:** Vue 3 (Composition API), TypeScript, Electron IPC channel registry, node-sqlite3-wasm, vitest.

---

## File map

**Create:**
- `src/renderer/components/MediaAddRow.vue` — wrapper around `MediaPicker` + Add/Cancel buttons; calls `media.createFromFile` on 📎.
- `tests/components/media-picker-add-row-consistency.test.ts` — mounts each of the three section flavors and asserts a `MediaAddRow` is rendered after toggling.

**Modify:**
- `src/main/ipc/media.ts` — add `media:createFromFile` handler.
- `src/shared/channels/media.ts` — no change (the new channel is main-thread only and registered manually like `media:attach`).
- `tests/unit/ipc-worker-coverage.test.ts` — add `'media:createFromFile'` to `MAIN_THREAD_ONLY_CHANNELS`.
- `src/preload/index.ts` — add `createFromFile: mutating(...)` to the `media:` block.
- `src/static/static-api.ts` — add `createFromFile: noop` stub in the media block.
- `src/renderer/components/MediaPicker.vue` — add `excludeIds` prop, in-field 📎 icon, dropdown footer item, `attach-file` event.
- `src/renderer/components/PersonMediaSection.vue` — replace direct file-dialog `attach()` with `showAddRow` toggle + `<MediaAddRow>`.
- `src/renderer/components/EntityMediaSection.vue` — same migration as PersonMediaSection.
- `src/renderer/components/LinkedMediaSection.vue` — drop inline picker markup; render `<MediaAddRow>` instead.
- `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` — add three new keys under `media.*`.

---

## Task 1: Add `media:createFromFile` IPC + plumbing

**Why:** `media:attach` couples create+link in one call; that forces `MediaAddRow` to know which link table the section uses (different across `media_links` / `group_links` / `task_links`). Splitting create from link makes `MediaAddRow` reusable across all three flavors.

**Files:**
- Modify: `src/main/ipc/media.ts`
- Modify: `tests/unit/ipc-worker-coverage.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/static/static-api.ts`

- [ ] **Step 1: Add the handler in `src/main/ipc/media.ts`**

Add a new `wrapHandler` block right after the existing `media:attach` handler (around line 84). Reuse the same dialog + fs-copy logic but skip the `addMediaLink` call:

```typescript
  wrapHandler('media:createFromFile', async (data) => {
    const opts = data as { suggestedTitle?: string } | undefined;
    const dbDir = path.dirname(getCurrentDatabasePath());
    const result = await dialog.showOpenDialog({
      title: 'Välj mediafil',
      defaultPath: dbDir,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const srcPath = result.filePaths[0];
    const dbPath = getCurrentDatabasePath();
    const mediaFolder = media.getMediaFolderName(dbPath);
    const mediaDir = path.join(dbDir, mediaFolder);
    fs.mkdirSync(mediaDir, { recursive: true });

    const filename = path.basename(srcPath);
    let destPath = path.join(mediaDir, filename);
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      destPath = path.join(mediaDir, `${base}_${Date.now()}${ext}`);
    }
    fs.copyFileSync(srcPath, destPath);

    const fileRef = path.join(mediaFolder, path.basename(destPath));
    const ext = path.extname(destPath).slice(1).toLowerCase();
    const db = getDb();
    const item = media.createMedia(db, {
      file_ref: fileRef,
      title: opts?.suggestedTitle?.trim() || path.basename(destPath, path.extname(destPath)),
      format: ext || null,
    });

    return { canceled: false, media: item };
  });
```

- [ ] **Step 2: Register `media:createFromFile` as main-thread-only in the coverage test**

In `tests/unit/ipc-worker-coverage.test.ts`, around line 25–27, add `'media:createFromFile'` to the existing `MAIN_THREAD_ONLY_CHANNELS` set:

```typescript
const MAIN_THREAD_ONLY_CHANNELS = new Set([
  'media:attach', 'media:createFromFile', 'media:openFile',
  // ...rest unchanged
```

- [ ] **Step 3: Expose `createFromFile` on `window.api.media`**

In `src/preload/index.ts`, locate the `media:` block (around line 189) and add the new method right after `attach`:

```typescript
    attach: mutating((data?: unknown) => ipcRenderer.invoke('media:attach', data)),
    createFromFile: mutating((data?: unknown) => ipcRenderer.invoke('media:createFromFile', data)),
```

- [ ] **Step 4: Add static-api stub**

In `src/static/static-api.ts`, find the line containing `attach: noop` (around line 574) and add `createFromFile: noop` next to it:

```typescript
    addLink: noop, removeLink: noopFalse, reorder: noopVoid, attach: noop, createFromFile: noop, openFile: noopVoid,
```

- [ ] **Step 5: Run the IPC coverage tests — they MUST pass**

```bash
npx vitest run tests/unit/ipc-worker-coverage.test.ts \
                tests/unit/preload-coverage.test.ts \
                tests/unit/static-api-coverage.test.ts
```

Expected: all three suites pass. If any fail, fix the matching layer until they're green.

- [ ] **Step 6: Type-check**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/media.ts tests/unit/ipc-worker-coverage.test.ts src/preload/index.ts src/static/static-api.ts
git commit -m "feat(media): add media:createFromFile IPC (create-only, no link)"
```

---

## Task 2: Add i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add keys to `src/renderer/i18n/sv.ts`**

Locate the existing `media: { ... }` namespace block. Add three new keys (alphabetical placement is fine):

```typescript
  media: {
    // ...existing keys...
    attachFromFile: 'Bifoga fil…',
    attachFromFileWithQuery: 'Bifoga fil "{query}"…',
    alreadyAttached: 'Redan kopplat till denna {entityType}',
  },
```

- [ ] **Step 2: Add the same keys to `src/renderer/i18n/en.ts`**

```typescript
  media: {
    // ...existing keys...
    attachFromFile: 'Attach file…',
    attachFromFileWithQuery: 'Attach file "{query}"…',
    alreadyAttached: 'Already attached to this {entityType}',
  },
```

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: add attachFromFile / attachFromFileWithQuery / alreadyAttached"
```

---

## Task 3: Enhance `MediaPicker.vue` — `excludeIds` prop + 📎 in-field icon + dropdown footer

**Files:**
- Modify: `src/renderer/components/MediaPicker.vue`

- [ ] **Step 1: Add `excludeIds` prop and apply it in `filter()`**

Update the `defineProps` and `filter` function. Existing structure (around lines 50–102):

```typescript
const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
  excludeIds?: string[];
}>();
```

Update `filter()` to drop excluded ids:

```typescript
function filter(query: string) {
  const excluded = new Set(props.excludeIds ?? []);
  const pool = allMedia.value.filter(m => !excluded.has(m.id));
  const q = query.trim().toLowerCase();
  if (!q) {
    results.value = pool.slice(0, 20);
    return;
  }
  results.value = pool
    .filter(m => displayTitle(m).toLowerCase().includes(q))
    .slice(0, 20);
}
```

- [ ] **Step 2: Add `attach-file` event to `defineEmits`**

```typescript
const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  select: [item: MediaItem];
  'attach-file': [suggestedTitle: string];
}>();
```

- [ ] **Step 3: Add the in-field 📎 icon to the template**

Right after the existing `<button v-if="modelValue" class="picker-clear" ...>` line, add the attach-file button (always visible — does not depend on `modelValue`):

```vue
      <button v-if="modelValue" type="button" class="picker-clear" :aria-label="$t('a11y.clearSearch')" @click="clear">&times;</button>
      <button
        type="button"
        class="picker-attach"
        :aria-label="$t('media.attachFromFile')"
        :title="$t('media.attachFromFile')"
        @mousedown.prevent="onAttachClick"
      >📎</button>
```

`@mousedown.prevent` is required — the input's `onBlur` would otherwise close the dropdown before the click registers (same pattern the option `<li>` rows already use).

- [ ] **Step 4: Add the dropdown footer item to the template**

Update the `<ul role="listbox">` block. The footer is **always** rendered when `open` is true, even when `results` is empty. Replace the current `<ul v-if="open && results.length > 0">` with:

```vue
    <ul v-if="open" role="listbox" class="picker-dropdown">
      <li
        v-for="(item, idx) in results"
        :key="item.id"
        role="option"
        :aria-selected="idx === highlightIndex"
        class="picker-option"
        :class="{ highlighted: idx === highlightIndex }"
        v-narrate="() => narrateMedia({ title: displayTitle(item), format: item.format ?? undefined }, labels)"
        @mousedown.prevent="select(item)"
      >
        <span class="picker-name">{{ displayTitle(item) }}</span>
        <span v-if="item.format" class="picker-format">{{ item.format.toUpperCase() }}</span>
      </li>
      <li
        role="option"
        class="picker-option picker-option-attach"
        :class="{ highlighted: highlightIndex === results.length }"
        @mousedown.prevent="onAttachClick"
      >
        <span class="picker-name">📎 {{ searchQuery.trim() ? $t('media.attachFromFileWithQuery', { query: searchQuery.trim() }) : $t('media.attachFromFile') }}</span>
      </li>
    </ul>
```

- [ ] **Step 5: Add `onAttachClick` handler and update keyboard nav**

In the `<script setup>` block, add:

```typescript
function onAttachClick() {
  emit('attach-file', searchQuery.value.trim());
  open.value = false;
}
```

Update `onKeydown` so the footer item participates in arrow-down/up and Enter selection. The footer's index is `results.value.length`:

```typescript
function onKeydown(e: KeyboardEvent) {
  if (!open.value) return;
  const max = results.value.length;  // last index = footer
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightIndex.value = Math.min(highlightIndex.value + 1, max);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (e.key === 'Enter' && highlightIndex.value >= 0) {
    e.preventDefault();
    if (highlightIndex.value === max) {
      onAttachClick();
    } else {
      select(results.value[highlightIndex.value]);
    }
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}
```

- [ ] **Step 6: Add scoped styles for the new elements**

Append to the `<style scoped>` block:

```css
.picker-input-wrap { gap: 0; }
.picker-attach {
  background: none;
  border: none;
  font-size: var(--font-base);
  cursor: pointer;
  padding: 0 6px;
  line-height: 1;
}
.picker-attach:hover { color: var(--accent); }
.picker-option-attach {
  border-top: 1px solid var(--surface-border-subtle);
  color: var(--text-secondary);
  font-style: italic;
}
```

- [ ] **Step 7: Lint + run any picker-related tests**

```bash
npm run lint
npx vitest run --reporter=dot src/renderer/components/MediaPicker
```

Expected: zero lint errors. Existing tests (if any) pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/MediaPicker.vue
git commit -m "feat(media-picker): add excludeIds prop, in-field attach-file icon, dropdown footer"
```

---

## Task 4: Create `MediaAddRow.vue`

**Files:**
- Create: `src/renderer/components/MediaAddRow.vue`

- [ ] **Step 1: Write the new component**

Create `src/renderer/components/MediaAddRow.vue` with the following content (this is the full file — every line):

```vue
<template>
  <div class="add-row">
    <MediaPicker
      v-model="pickedId"
      :exclude-ids="excludeIds"
      :placeholder="$t('media.title_label')"
      @attach-file="onAttachFile"
    />
    <AppButton variant="primary" size="sm" :disabled="!pickedId" @click="commitExisting">
      {{ $t('common.add') }}
    </AppButton>
    <AppButton variant="ghost" size="sm" @click="cancel">
      {{ $t('common.cancel') }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MediaPicker from './MediaPicker.vue';
import AppButton from './ui/AppButton.vue';

defineProps<{
  excludeIds?: string[];
}>();

const emit = defineEmits<{
  committed: [{ mediaId: string }];
  cancelled: [];
}>();

const pickedId = ref<string | null>(null);

function commitExisting() {
  if (!pickedId.value) return;
  const id = pickedId.value;
  pickedId.value = null;
  emit('committed', { mediaId: id });
}

async function onAttachFile(suggestedTitle: string) {
  const result = (await window.api.media.createFromFile({ suggestedTitle })) as
    | { canceled: true }
    | { canceled: false; media: { id: string } };
  if (result.canceled) return;
  emit('committed', { mediaId: result.media.id });
}

function cancel() {
  pickedId.value = null;
  emit('cancelled');
}
</script>

<style scoped>
.add-row {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-xs) 0;
}
.add-row > :first-child { flex: 1; }
</style>
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/MediaAddRow.vue
git commit -m "feat(media): add MediaAddRow wrapper component"
```

---

## Task 5: Wire `PersonMediaSection.vue`

**Files:**
- Modify: `src/renderer/components/PersonMediaSection.vue`

- [ ] **Step 1: Replace `attach()` body with `showAddRow` toggle**

In `src/renderer/components/PersonMediaSection.vue`:

(a) Add the import near the other component imports:

```typescript
import MediaAddRow from './MediaAddRow.vue';
```

(b) Add the new ref next to `media`:

```typescript
const showAddRow = ref(false);
```

(c) Replace the existing `attach()` function (currently calls `window.api.media.attach(...)`) with:

```typescript
async function attach() {
  showAddRow.value = true;
}

async function onCommitted({ mediaId }: { mediaId: string }) {
  await window.api.media.addLink({
    media_id: mediaId,
    entity_type: 'person',
    entity_id: props.personId,
  });
  showAddRow.value = false;
  profilePicStore.invalidatePerson(props.personId);
  await reload();
  emit('profileChanged');
}
```

(d) `defineExpose` already exposes `attach` — leave it. The parent's `+ Attach` button calls `mediaSectionRef?.attach()` and now flips the boolean.

- [ ] **Step 2: Render `MediaAddRow` conditionally above the table**

In the `<template>`, wrap the existing content. Insert `<MediaAddRow>` before the `<SectionEmpty>` / table:

```vue
<template>
  <div>
    <MediaAddRow
      v-if="showAddRow"
      :exclude-ids="excludeIds"
      @committed="onCommitted"
      @cancelled="showAddRow = false"
    />
    <SectionEmpty v-if="media.length === 0 && !showAddRow" :message="$t('empty.media')" />
    <table v-else-if="media.length > 0" class="data-table">
      <!-- ...rest unchanged... -->
```

(Note: the existing `v-else` after `SectionEmpty` becomes `v-else-if="media.length > 0"` so the table doesn't show when only the add-row is visible on an empty list.)

- [ ] **Step 3: Add the `excludeIds` computed**

In `<script setup>`:

```typescript
const excludeIds = computed(() => media.value.map(m => m.id));
```

- [ ] **Step 4: Lint + run any existing PersonMediaSection tests**

```bash
npm run lint
npx vitest run --reporter=dot PersonMediaSection
```

Expected: zero lint errors; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PersonMediaSection.vue
git commit -m "feat(person-panel): inline MediaAddRow replaces direct file-dialog attach"
```

---

## Task 6: Wire `EntityMediaSection.vue`

**Files:**
- Modify: `src/renderer/components/EntityMediaSection.vue`

- [ ] **Step 1: Apply the same migration as PersonMediaSection**

In `src/renderer/components/EntityMediaSection.vue`:

(a) Import:

```typescript
import MediaAddRow from './MediaAddRow.vue';
```

(b) Add ref next to `media`:

```typescript
const showAddRow = ref(false);
```

(c) Replace the existing `attach()` body with:

```typescript
async function attach() {
  showAddRow.value = true;
}

async function onCommitted({ mediaId }: { mediaId: string }) {
  await window.api.media.addLink({
    media_id: mediaId,
    entity_type: props.entityType,
    entity_id: props.entityId,
  });
  showAddRow.value = false;
  await load();
}
```

(d) Compute `excludeIds`:

```typescript
const excludeIds = computed(() => media.value.map(m => m.id));
```

Add `computed` to the `vue` import line if it's not already there:

```typescript
import { ref, watch, computed } from 'vue';
```

(e) Update template — add the `<MediaAddRow>` block the same way:

```vue
<template>
  <div>
    <MediaAddRow
      v-if="showAddRow"
      :exclude-ids="excludeIds"
      @committed="onCommitted"
      @cancelled="showAddRow = false"
    />
    <SectionEmpty v-if="media.length === 0 && !showAddRow" :message="$t('empty.media')" />
    <table v-else-if="media.length > 0" class="data-table">
      <!-- ...rest unchanged... -->
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/EntityMediaSection.vue
git commit -m "feat(entity-panel): inline MediaAddRow on Place/Relationship/Source media sections"
```

---

## Task 7: Refactor `LinkedMediaSection.vue` to use `MediaAddRow`

**Why:** `LinkedMediaSection` currently has its own inline `MediaPicker + Add + Cancel` block. Replacing it with `<MediaAddRow>` brings Group/ResearchTask in line with the other four panels and gives them the 📎 file-upload path for free.

**Files:**
- Modify: `src/renderer/components/LinkedMediaSection.vue`

- [ ] **Step 1: Replace the inline picker block with `MediaAddRow`**

(a) Update the imports — drop `MediaPicker` and `AppButton` (if no longer used), add `MediaAddRow`:

```typescript
import MediaAddRow from './MediaAddRow.vue';
import IconUnlink from './ui/IconUnlink.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { mediaDisplayName } from '../utils/mediaUtils';
```

(Verify `AppButton` is still used by the unlink action — if so, keep the import; otherwise drop it.)

(b) Replace the entire `<div v-if="showPicker" class="add-row">…</div>` block in the template with:

```vue
    <MediaAddRow
      v-if="showPicker"
      :exclude-ids="excludeIds"
      @committed="onCommitted"
      @cancelled="emit('cancelPicker')"
    />
```

(c) In `<script setup>`, replace the `pickedId` ref + `onAdd` + `cancelAdd` functions with:

```typescript
const excludeIds = computed(() => rows.value.map(r => r.mediaId));

function onCommitted({ mediaId }: { mediaId: string }) {
  emit('add', mediaId);
}
```

Add `computed` to the `vue` import line:

```typescript
import { ref, watch, computed } from 'vue';
```

(d) Drop the `watch(() => props.showPicker, ...)` (it only existed to clear `pickedId` — `MediaAddRow` owns that ref now).

- [ ] **Step 2: Drop the now-unused `.add-row` styles**

The `<style scoped>` block can keep `.th-shrink`, `.td-shrink`, `.actions-cell`. Remove the `.add-row` rule (lives in `MediaAddRow.vue` now).

- [ ] **Step 3: Lint + smoke**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/LinkedMediaSection.vue
git commit -m "refactor(group/task panel): LinkedMediaSection delegates to MediaAddRow"
```

---

## Task 8: Component-consistency test

**Files:**
- Create: `tests/components/media-picker-add-row-consistency.test.ts`

- [ ] **Step 1: Write the test**

Look at any existing test in `tests/components/` for the project's mount conventions (e.g. `tests/components/panel-layout-consistency.test.ts`). Reuse the same imports, i18n stub, and `window.api` stub patterns.

The test mounts each of the three section flavors with `readonly=false`, calls the exposed `attach()` to flip `showAddRow`, then asserts that a `MediaAddRow` is in the DOM containing a `MediaPicker`.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import en from '../../src/renderer/i18n/en';
import PersonMediaSection from '../../src/renderer/components/PersonMediaSection.vue';
import EntityMediaSection from '../../src/renderer/components/EntityMediaSection.vue';
import LinkedMediaSection from '../../src/renderer/components/LinkedMediaSection.vue';
import MediaAddRow from '../../src/renderer/components/MediaAddRow.vue';
import MediaPicker from '../../src/renderer/components/MediaPicker.vue';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

const stubApi = {
  media: {
    forEntity: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    addLink: vi.fn().mockResolvedValue({}),
    removeLink: vi.fn().mockResolvedValue(true),
    reorder: vi.fn().mockResolvedValue(undefined),
    createFromFile: vi.fn().mockResolvedValue({ canceled: true }),
    readAsDataUrl: vi.fn().mockResolvedValue(null),
  },
  onDataChanged: vi.fn(() => () => undefined),
};

beforeEach(() => {
  (globalThis as unknown as { window: { api: typeof stubApi } }).window = { api: stubApi };
});

describe('media picker add-row consistency', () => {
  it('PersonMediaSection reveals MediaAddRow on attach()', async () => {
    const wrapper = mount(PersonMediaSection, {
      global: { plugins: [i18n], stubs: { 'router-link': true } },
      props: { personId: 'p1' },
    });
    await flushPromises();
    (wrapper.vm as { attach: () => Promise<void> }).attach();
    await flushPromises();
    expect(wrapper.findComponent(MediaAddRow).exists()).toBe(true);
    expect(wrapper.findComponent(MediaPicker).exists()).toBe(true);
  });

  it('EntityMediaSection reveals MediaAddRow on attach()', async () => {
    const wrapper = mount(EntityMediaSection, {
      global: { plugins: [i18n], stubs: { 'router-link': true } },
      props: { entityType: 'place', entityId: 'pl1' },
    });
    await flushPromises();
    (wrapper.vm as { attach: () => Promise<void> }).attach();
    await flushPromises();
    expect(wrapper.findComponent(MediaAddRow).exists()).toBe(true);
    expect(wrapper.findComponent(MediaPicker).exists()).toBe(true);
  });

  it('LinkedMediaSection renders MediaAddRow when showPicker=true', async () => {
    const wrapper = mount(LinkedMediaSection, {
      global: { plugins: [i18n], stubs: { 'router-link': true } },
      props: { links: [], showPicker: true },
    });
    await flushPromises();
    expect(wrapper.findComponent(MediaAddRow).exists()).toBe(true);
    expect(wrapper.findComponent(MediaPicker).exists()).toBe(true);
  });
});
```

(If the project uses a different test bootstrap — e.g. a shared `mountWith()` helper or a vitest setup file that already wires `window.api` — match that convention instead. Read `tests/components/panel-layout-consistency.test.ts` first.)

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/components/media-picker-add-row-consistency.test.ts
```

Expected: 3/3 passing.

- [ ] **Step 3: Run the full unit suite to verify no regressions**

```bash
npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tests/components/media-picker-add-row-consistency.test.ts
git commit -m "test: media-picker-add-row-consistency across 3 section flavors"
```

---

## Task 9: User-observable smoke verification (running app)

This task does **not** produce code; it is the user-goal proof step. Lint + vitest passing is necessary but not sufficient. Per `.claude/rules/plans.md`, this checklist must be exercised in the running app before the plan closes.

- [ ] **Step 1: Start the app**

```bash
npm start
```

- [ ] **Step 2: Verify each panel shows the same add-row shape**

Open each route and click `+ Attach` in the media section. Confirm the inline `[picker | Add | Cancel]` row appears with the same visual shape:

- `/persons/<some-id>` (PersonPanel)
- `/places/<some-id>` (PlacePanel)
- `/relationships/<some-id>` (RelationshipPanel)
- `/sources/<some-id>` (SourcePanel)
- `/groups/<some-id>` (GroupPanel)
- `/research-tasks/<some-id>` (ResearchTaskPanel)

- [ ] **Step 3: Pick existing — cross-entity sharing**

In a PersonPanel, click `+ Attach`, click 📎, choose a real image file. Confirm the photo appears in the list with a thumbnail. Open a second PersonPanel, click `+ Attach`, type the photo's title, select it from the dropdown, click Add. Confirm both persons' media tables now show the same image with thumbnails.

- [ ] **Step 4: Already-linked filter**

Back in the first PersonPanel, click `+ Attach` again and search for the same photo title. Confirm the photo does **not** appear in the dropdown (it's already linked). Now check a third PersonPanel — confirm the photo **does** appear there.

- [ ] **Step 5: File upload with title prefill**

In any panel, click `+ Attach`, type "Brand New Title" (something with no match), click `📎 Attach file "Brand New Title"…` in the dropdown footer, choose a file. Confirm the new media row uses `Brand New Title` as the title.

- [ ] **Step 6: Cross-view reactivity**

Open `/media` in a second window (or switch to MediaView). Confirm the new media items appear there too without needing a manual refresh — `mutating()` IPC + `onDataChanged` should propagate.

- [ ] **Step 7: GEDCOM round-trip sanity (optional but recommended)**

Export to GEDCOM, re-import into a new database, confirm the media files are still linked to the same persons/places/etc. (No code in this plan touches GEDCOM, so this is a regression check, not a new verification.)

- [ ] **Step 8: Final commit if any docs / cleanup needed**

If the plan exposed any rough edges (missing i18n keys, unused exports), commit a small follow-up. Otherwise, mark this task done and proceed to the plan close-out (per CLAUDE.md "Finishing a plan" checklist).

---

## Self-review checklist (run before merging)

- [ ] All 9 tasks above have every checkbox ticked.
- [ ] All three section flavors (`PersonMediaSection`, `EntityMediaSection`, `LinkedMediaSection`) render `<MediaAddRow>`. None still uses the old `media:attach`-direct pattern; none still has its own bespoke picker block.
- [ ] `tests/components/media-picker-add-row-consistency.test.ts` is green.
- [ ] `npx vitest run tests/unit/ipc-worker-coverage.test.ts tests/unit/preload-coverage.test.ts tests/unit/static-api-coverage.test.ts` is green.
- [ ] `npm run lint` is zero errors, `npm test` is zero failures.
- [ ] User-observable items 1–4 in the plan preamble's Verification section have been exercised in the running app (Task 9).
- [ ] Plan file is moved to `docs/plans/archive/` along with `2026-05-02-inline-media-picker-design.md`, `package.json` minor-bumped, `CHANGELOG.md` updated, per the CLAUDE.md "Finishing a plan" checklist.
