# Monospaced Notes Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-notes-type monospaced-font toggle, persisted in localStorage, to the 5 strong-fit notes locations (Person, Relationship, Place, Group, Media).

**Architecture:** A single `useMonospacedNotes(entityType)` composable owns state + persistence. Each notes location calls it, renders a right-aligned toggle button (`AppButton variant="soft" size="sm"`) in the notes heading row, and applies `.notes-mono` to its textarea when the setting is on. The toggle's label text is itself rendered in monospace so the effect is self-demonstrating.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest (for composable unit tests), existing design-token system (`tokens.css` + `shared.css`).

**Scope note (vs. spec):** `MediaView.vue` is dropped from scope because its per-row notes cell is a single-line `<input type="text">` in a data table, not a notes textarea with a heading — the toggle pattern does not apply. The media entity type is still covered via `MediaPanel.vue`. Spec will be updated in Task 11 to reflect this.

**Spec:** [docs/superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md](../superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md)

---

## File Structure

**New files:**
- `src/renderer/composables/useMonospacedNotes.ts` — composable (state + localStorage persistence)
- `tests/unit/useMonospacedNotes.test.ts` — unit tests

**Modified files:**
- `src/renderer/styles/tokens.css` — add `--font-mono` token
- `src/renderer/styles/shared.css` — add `.notes-mono` and `.toggle-label-mono` classes
- `src/renderer/i18n/en.ts` — add `common.monospaced` + `common.monospacedTooltip`
- `src/renderer/i18n/sv.ts` — same, Swedish
- `src/renderer/components/PersonNotesSection.vue` — accept `monospaced` prop, apply class
- `src/renderer/components/PersonDetailsSection.vue` — render heading row with toggle, pass prop
- `src/renderer/views/RelationshipDetailView.vue` — restructure notes block with heading row + toggle
- `src/renderer/views/PlaceDetailView.vue` — add toggle to existing `<h4>` row, class on textarea
- `src/renderer/components/PlacePanel.vue` — add toggle next to `compact-label`, class on textarea
- `src/renderer/views/GroupDetailView.vue` — add heading row with label + toggle above textarea
- `src/renderer/components/MediaPanel.vue` — add toggle inside notes panel-section-body, class on textarea
- `package.json` — minor version bump on final commit

---

## Task 1: Add `--font-mono` token and CSS classes

**Files:**
- Modify: `src/renderer/styles/tokens.css` (add token in the existing typography block)
- Modify: `src/renderer/styles/shared.css` (add two classes)

- [ ] **Step 1: Add the `--font-mono` token to `tokens.css`**

Find the existing typography block:

```css
/* ─── Typography weights (theme-invariant) ───────────────────────────────── */
/* NOTE: --font-xs through --font-2xl are defined in shared.css (accessibility
 * text-size feature). Do not redefine them here. Only weight tokens are new. */
:root {
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold:   600;
}
```

Add the `--font-mono` token to that `:root` block, so it becomes:

```css
:root {
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold:   600;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
```

- [ ] **Step 2: Add the two CSS classes to `shared.css`**

Append to the end of `src/renderer/styles/shared.css`:

```css
/* Monospaced notes toggle — see docs/superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md */
.notes-mono {
  font-family: var(--font-mono);
}
.toggle-label-mono {
  font-family: var(--font-mono);
}
```

- [ ] **Step 3: Verify app still builds**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/tokens.css src/renderer/styles/shared.css
git commit -m "feat(styles): add --font-mono token and notes-mono classes"
```

---

## Task 2: Add i18n keys

**Files:**
- Modify: `src/renderer/i18n/en.ts` (inside the `common:` block, ~line 50)
- Modify: `src/renderer/i18n/sv.ts` (inside the `common:` block, same position)

- [ ] **Step 1: Add English keys**

In `src/renderer/i18n/en.ts`, find the `common: {` block and add two keys. The block currently ends with `close: 'Close',`. Insert before the closing brace so it becomes:

```ts
  common: {
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    create: 'Create',
    actions: 'Actions',
    loading: 'Loading\u2026',
    yes: 'Yes',
    no: 'No',
    notes: 'Notes',
    type: 'Type',
    name: 'Name',
    unknown: '(unknown)',
    back: 'Back',
    view: 'View',
    all: 'All',
    close: 'Close',
    monospaced: 'Monospaced',
    monospacedTooltip: 'Show notes in monospaced font for ASCII tables and aligned text',
  },
```

- [ ] **Step 2: Add Swedish keys**

Locate the matching `common: {` block in `src/renderer/i18n/sv.ts` and add the Swedish equivalents with the same key names:

```ts
    monospaced: 'Fast bredd',
    monospacedTooltip: 'Visa anteckningar med fast bredd for ASCII-tabeller och justerad text',
```

(Note: use the actual Swedish letter "för" — `för` — in place of `for` above. The plain-ASCII placeholder is only to avoid encoding issues in this plan file. The final string must be: `Visa anteckningar med fast bredd för ASCII-tabeller och justerad text`)

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "i18n: add common.monospaced and common.monospacedTooltip keys"
```

---

## Task 3: Create `useMonospacedNotes` composable (TDD)

**Files:**
- Create: `tests/unit/useMonospacedNotes.test.ts`
- Create: `src/renderer/composables/useMonospacedNotes.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/useMonospacedNotes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useMonospacedNotes } from '../../src/renderer/composables/useMonospacedNotes';

describe('useMonospacedNotes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to false when no value is stored', () => {
    const { monospaced } = useMonospacedNotes('person');
    expect(monospaced.value).toBe(false);
  });

  it('reads the stored value from localStorage on init', () => {
    localStorage.setItem('slaktforskning-monospace-notes-person', 'true');
    const { monospaced } = useMonospacedNotes('person');
    expect(monospaced.value).toBe(true);
  });

  it('toggle() flips the value and persists to localStorage', () => {
    const { monospaced, toggle } = useMonospacedNotes('place');
    expect(monospaced.value).toBe(false);

    toggle();
    expect(monospaced.value).toBe(true);
    expect(localStorage.getItem('slaktforskning-monospace-notes-place')).toBe('true');

    toggle();
    expect(monospaced.value).toBe(false);
    expect(localStorage.getItem('slaktforskning-monospace-notes-place')).toBe('false');
  });

  it('keeps each entity type independent', () => {
    const person = useMonospacedNotes('person');
    const place = useMonospacedNotes('place');

    person.toggle();
    expect(person.monospaced.value).toBe(true);
    expect(place.monospaced.value).toBe(false);
    expect(localStorage.getItem('slaktforskning-monospace-notes-person')).toBe('true');
    expect(localStorage.getItem('slaktforskning-monospace-notes-place')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/useMonospacedNotes.test.ts`
Expected: FAIL — "Cannot find module '../../src/renderer/composables/useMonospacedNotes'".

- [ ] **Step 3: Create the composable**

Create `src/renderer/composables/useMonospacedNotes.ts`:

```ts
import { ref, watch } from 'vue';

export type NotesEntityType = 'person' | 'relationship' | 'place' | 'group' | 'media';

const STORAGE_PREFIX = 'slaktforskning-monospace-notes-';

export function useMonospacedNotes(entityType: NotesEntityType) {
  const storageKey = STORAGE_PREFIX + entityType;
  const initial = localStorage.getItem(storageKey) === 'true';
  const monospaced = ref(initial);

  watch(monospaced, (value) => {
    localStorage.setItem(storageKey, String(value));
  });

  function toggle() {
    monospaced.value = !monospaced.value;
  }

  return { monospaced, toggle };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/useMonospacedNotes.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/composables/useMonospacedNotes.ts tests/unit/useMonospacedNotes.test.ts
git commit -m "feat(composables): add useMonospacedNotes for per-type monospace toggle"
```

---

## Task 4: Add `monospaced` prop to PersonNotesSection

**Files:**
- Modify: `src/renderer/components/PersonNotesSection.vue`

- [ ] **Step 1: Update the component to accept a `monospaced` prop and apply the class**

Replace the entire file with:

```vue
<template>
  <textarea
    ref="textareaRef"
    :value="notes"
    :rows="rows ?? 3"
    :class="{ 'notes-mono': monospaced }"
    :placeholder="$t('personDetail.notesPlaceholder')"
    :style="storedHeight ? { height: storedHeight + 'px' } : undefined"
    @blur="onBlur(($event.target as HTMLTextAreaElement).value)"
    @mouseup="persistHeight"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';
import { useTextareaHeight } from '../composables/useTextareaHeight';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{ personId: string; rows?: number; monospaced?: boolean }>();

const notes = ref('');
const { textareaRef, storedHeight, persistHeight } = useTextareaHeight('person-notes');

async function load(id: string) {
  const raw = (await window.api.persons.get(id)) as { notes: string | null } | null;
  if (props.personId !== id) return;
  notes.value = raw?.notes ?? '';
}

function onBlur(value: string) {
  persistHeight();
  save(value);
}

async function save(value: string) {
  const trimmed = value.trim();
  try {
    await window.api.persons.update(props.personId, { notes: trimmed });
    notes.value = trimmed;
  } catch (err) {
    console.error('[PersonNotesSection] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

watch(() => props.personId, (id) => {
  notes.value = '';
  if (id) load(id);
}, { immediate: true });
</script>
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PersonNotesSection.vue
git commit -m "feat(person): PersonNotesSection accepts monospaced prop"
```

---

## Task 5: Add toggle to PersonDetailsSection (Person)

**Files:**
- Modify: `src/renderer/components/PersonDetailsSection.vue`

This view currently wraps the textarea inside a `<label>` with a single text line ("Notes") above it. We restructure to a heading row (label + toggle) so the toggle can sit to the right of the label.

- [ ] **Step 1: Update the template and script**

Replace the entire file with:

```vue
<template>
  <div class="details-row">
    <select
      class="details-select"
      :value="sex"
      @change="updateSex(($event.target as HTMLSelectElement).value)"
    >
      <option value="M">{{ $t('sex.M') }}</option>
      <option value="F">{{ $t('sex.F') }}</option>
      <option value="U">{{ $t('sex.U') }}</option>
    </select>
    <label class="checkbox-label">
      <input type="checkbox" :checked="!!living" @change="updateLiving(($event.target as HTMLInputElement).checked)" />
      {{ $t('personDetail.statusLiving') }}
    </label>
  </div>
  <div class="notes-block">
    <div class="notes-heading-row">
      <span class="notes-heading-label">{{ $t('common.notes') }}</span>
      <AppButton
        variant="soft"
        size="sm"
        :aria-pressed="monospaced"
        :title="$t('common.monospacedTooltip')"
        @click="toggle"
      >
        <span class="mono-glyph">&lt;/&gt;</span>
        <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
      </AppButton>
    </div>
    <PersonNotesSection :person-id="personId" :monospaced="monospaced" />
  </div>
</template>

<script setup lang="ts">
import PersonNotesSection from './PersonNotesSection.vue';
import AppButton from './ui/AppButton.vue';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  personId: string;
  sex: string;
  living: boolean | number;
}>();

const emit = defineEmits<{
  updated: [field: string, value: unknown];
}>();

const { monospaced, toggle } = useMonospacedNotes('person');

async function updateSex(value: string) {
  await window.api.persons.update(props.personId, { sex: value });
  emit('updated', 'sex', value);
}

async function updateLiving(checked: boolean) {
  const value = checked ? 1 : 0;
  await window.api.persons.update(props.personId, { living: value });
  emit('updated', 'living', value);
}
</script>

<style scoped>
.details-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.details-select {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  font-family: inherit;
  background: var(--surface);
  color: var(--text-primary);
}
.details-select:focus {
  outline: none;
  border-color: var(--accent);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-sm);
  color: var(--text-secondary);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.notes-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-md);
}

.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.notes-heading-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.mono-glyph {
  font-family: var(--font-mono);
  font-weight: 600;
  opacity: 0.85;
}

:deep(textarea) {
  width: 100%;
  padding: var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--font-sm);
  color: var(--text-primary);
  background: var(--surface);
  resize: vertical;
}
:deep(textarea.notes-mono) {
  font-family: var(--font-mono);
}
:deep(textarea:focus) {
  outline: none;
  border-color: var(--accent);
}
</style>
```

- [ ] **Step 2: Start app and verify Person notes toggle works**

Run: `npm start` and navigate to a person's detail page.
Expected:
- A small "`</>` Monospaced" button sits to the right of the "Notes" label.
- Click it: the button gains the accent-soft background (ON state), and the textarea font becomes monospaced.
- The word "Monospaced" on the button is itself rendered in monospace.
- Reload the app: the toggle state persists (localStorage key `slaktforskning-monospace-notes-person`).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PersonDetailsSection.vue
git commit -m "feat(person): add monospaced notes toggle to person detail"
```

---

## Task 6: Add toggle to RelationshipDetailView (Relationship)

**Files:**
- Modify: `src/renderer/views/RelationshipDetailView.vue` (lines ~45-56 and the `<script setup>` imports)

Currently, notes is written as:
```html
<label>
  {{ $t('common.notes') }}
  <textarea ... />
</label>
```

We split that into a heading row + standalone textarea, and import the composable.

- [ ] **Step 1: Restructure the notes block**

Locate the block (around line 45):

```html
<label>
  {{ $t('common.notes') }}
  <textarea
    ref="notesRef"
    v-model="notesText"
    rows="2"
    :placeholder="$t('relationshipDetail.notesPlaceholder')"
    :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
    @blur="persistNotesHeight(); saveNotes()"
    @mouseup="persistNotesHeight"
  />
</label>
```

Replace with:

```html
<div class="notes-block">
  <div class="notes-heading-row">
    <span class="notes-heading-label">{{ $t('common.notes') }}</span>
    <AppButton
      variant="soft"
      size="sm"
      :aria-pressed="notesMonospaced"
      :title="$t('common.monospacedTooltip')"
      @click="toggleNotesMonospaced"
    >
      <span class="mono-glyph">&lt;/&gt;</span>
      <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
    </AppButton>
  </div>
  <textarea
    ref="notesRef"
    v-model="notesText"
    rows="2"
    :class="{ 'notes-mono': notesMonospaced }"
    :placeholder="$t('relationshipDetail.notesPlaceholder')"
    :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
    @blur="persistNotesHeight(); saveNotes()"
    @mouseup="persistNotesHeight"
  />
</div>
```

- [ ] **Step 2: Import the composable and pull in its state**

In the `<script setup>` block, find the existing imports (AppBadge, AppButton, SectionHeader, etc.) and add:

```ts
import { useMonospacedNotes } from '../composables/useMonospacedNotes';
```

Then, somewhere near the other top-level setup calls (after the `const route = useRoute()` etc. lines), add:

```ts
const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('relationship');
```

If `AppButton` is not already imported in this file, add it:
```ts
import AppButton from '../components/ui/AppButton.vue';
```
(check first — it is imported in the header of this file, so likely already present.)

- [ ] **Step 3: Add scoped styles for the heading row**

Append to the `<style scoped>` block at the bottom of the file:

```css
.notes-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.notes-heading-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.mono-glyph {
  font-family: var(--font-mono);
  font-weight: 600;
  opacity: 0.85;
}
textarea.notes-mono {
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Start app and verify**

Run: `npm start` and navigate to a relationship detail page.
Expected: toggle appears right of "Notes", click flips font, state persists per entity type (independent of person-notes).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/RelationshipDetailView.vue
git commit -m "feat(relationship): add monospaced notes toggle to relationship detail"
```

---

## Task 7: Add toggle to PlaceDetailView (Place)

**Files:**
- Modify: `src/renderer/views/PlaceDetailView.vue` (around line 63-66 and `<script setup>`)

Current structure:

```html
<section class="detail-section" aria-labelledby="section-place-notes">
  <h4 id="section-place-notes" tabindex="0" :data-narrate="...">{{ $t('common.notes') }}</h4>
  <textarea ref="notesRef" v-model="editNotes" rows="3" ... />
</section>
```

- [ ] **Step 1: Wrap the heading in a flex row and add the toggle**

Replace those 3 lines with:

```html
<section class="detail-section" aria-labelledby="section-place-notes">
  <div class="notes-heading-row">
    <h4 id="section-place-notes" tabindex="0" :data-narrate="editNotes ? t('screenReader.sectionNotes', { content: editNotes }) : t('screenReader.sectionNotesEmpty')">{{ $t('common.notes') }}</h4>
    <AppButton
      variant="soft"
      size="sm"
      :aria-pressed="notesMonospaced"
      :title="$t('common.monospacedTooltip')"
      @click="toggleNotesMonospaced"
    >
      <span class="mono-glyph">&lt;/&gt;</span>
      <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
    </AppButton>
  </div>
  <textarea
    ref="notesRef"
    v-model="editNotes"
    rows="3"
    :class="{ 'notes-mono': notesMonospaced }"
    :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
    @blur="persistNotesHeight(); save({ notes: editNotes })"
    @mouseup="persistNotesHeight"
  />
</section>
```

- [ ] **Step 2: Import the composable and `AppButton` (if not already)**

In `<script setup>`, add:

```ts
import { useMonospacedNotes } from '../composables/useMonospacedNotes';
// AppButton may already be imported; verify first.
import AppButton from '../components/ui/AppButton.vue';
```

Then near the other top-level setup:

```ts
const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('place');
```

- [ ] **Step 3: Add scoped styles**

Append to the `<style scoped>` block:

```css
.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.mono-glyph {
  font-family: var(--font-mono);
  font-weight: 600;
  opacity: 0.85;
}
textarea.notes-mono {
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Start app and verify**

Run: `npm start`, go to `/places/:id`, confirm toggle works and is independent from person/relationship.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/PlaceDetailView.vue
git commit -m "feat(place): add monospaced notes toggle to place detail"
```

---

## Task 8: Add toggle to PlacePanel (Place, same entity type)

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`

PlacePanel uses the same entity type as PlaceDetailView (`'place'`), so the toggle state is **shared** — flipping one flips the other. This is the intended behavior (global per entity type).

Current structure (around line 71):

```html
<div class="compact-field">
  <label class="compact-label">{{ $t('panel.notes') }}</label>
  <textarea
    ref="notesRef"
    class="compact-control"
    rows="2"
    :value="place.notes ?? ''"
    :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
    @blur="persistNotesHeight(); saveField('notes', ($event.target as HTMLTextAreaElement).value || null)"
    @mouseup="persistNotesHeight"
  />
</div>
```

- [ ] **Step 1: Replace that block**

Replace with:

```html
<div class="compact-field">
  <div class="notes-heading-row">
    <label class="compact-label">{{ $t('panel.notes') }}</label>
    <AppButton
      variant="soft"
      size="sm"
      :aria-pressed="notesMonospaced"
      :title="$t('common.monospacedTooltip')"
      @click="toggleNotesMonospaced"
    >
      <span class="mono-glyph">&lt;/&gt;</span>
      <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
    </AppButton>
  </div>
  <textarea
    ref="notesRef"
    class="compact-control"
    rows="2"
    :value="place.notes ?? ''"
    :class="{ 'notes-mono': notesMonospaced }"
    :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
    @blur="persistNotesHeight(); saveField('notes', ($event.target as HTMLTextAreaElement).value || null)"
    @mouseup="persistNotesHeight"
  />
</div>
```

- [ ] **Step 2: Add imports + composable**

In `<script setup>`, add if not already present:

```ts
import AppButton from './ui/AppButton.vue';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';

const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('place');
```

- [ ] **Step 3: Add scoped styles**

Append to the `<style scoped>` block:

```css
.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.mono-glyph {
  font-family: var(--font-mono);
  font-weight: 600;
  opacity: 0.85;
}
textarea.compact-control.notes-mono {
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Start app and verify state is shared with PlaceDetailView**

Run: `npm start`. Open the map view (`/map`), click a pin to open PlacePanel, toggle monospaced on. Navigate to that place's detail page — the toggle is already on there. Flip it off on the detail page, return to the panel — it reflects the change.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PlacePanel.vue
git commit -m "feat(place): add monospaced notes toggle to place panel"
```

---

## Task 9: Add toggle to GroupDetailView (Group)

**Files:**
- Modify: `src/renderer/views/GroupDetailView.vue`

GroupDetailView currently has a bare textarea with no heading above it. We need to add a heading row.

Current block (around line 10-19):

```html
<textarea
  ref="notesRef"
  class="group-notes-input"
  v-model="editNotes"
  rows="2"
  :placeholder="$t('groups.notes')"
  :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
  @blur="persistNotesHeight(); saveNotes()"
  @mouseup="persistNotesHeight"
/>
```

- [ ] **Step 1: Wrap with heading row**

Replace the above block with:

```html
<div class="notes-block">
  <div class="notes-heading-row">
    <span class="notes-heading-label">{{ $t('common.notes') }}</span>
    <AppButton
      variant="soft"
      size="sm"
      :aria-pressed="notesMonospaced"
      :title="$t('common.monospacedTooltip')"
      @click="toggleNotesMonospaced"
    >
      <span class="mono-glyph">&lt;/&gt;</span>
      <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
    </AppButton>
  </div>
  <textarea
    ref="notesRef"
    class="group-notes-input"
    :class="{ 'notes-mono': notesMonospaced }"
    v-model="editNotes"
    rows="2"
    :placeholder="$t('groups.notes')"
    :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
    @blur="persistNotesHeight(); saveNotes()"
    @mouseup="persistNotesHeight"
  />
</div>
```

- [ ] **Step 2: Import the composable**

In `<script setup>`, add:

```ts
import { useMonospacedNotes } from '../composables/useMonospacedNotes';

const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('group');
```

(`AppButton` is already imported in this file.)

- [ ] **Step 3: Add scoped styles**

Append to the `<style scoped>` block:

```css
.notes-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: 24px;
}
.notes-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.notes-heading-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.mono-glyph {
  font-family: var(--font-mono);
  font-weight: 600;
  opacity: 0.85;
}
.group-notes-input.notes-mono {
  font-family: var(--font-mono);
}
```

**Also:** remove the existing `margin-bottom: 24px;` from `.group-notes-input` in the current scoped styles — it's now on the wrapper `.notes-block`. Find:

```css
.group-notes-input {
  width: 100%;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  padding: 8px;
  font-size: var(--font-base);
  font-family: inherit;
  resize: vertical;
  margin-bottom: 24px;
  box-sizing: border-box;
}
```

and remove the `margin-bottom: 24px;` line.

- [ ] **Step 4: Start app and verify**

Run: `npm start`, open `/groups`, click a group, confirm heading + toggle appear above the notes textarea, toggle works, state persists.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/GroupDetailView.vue
git commit -m "feat(group): add monospaced notes toggle to group detail"
```

---

## Task 10: Add toggle to MediaPanel (Media)

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`

The notes block here is inside a `panel-section` with a `SectionHeader` (collapsible). The toggle goes inside the `panel-section-body`, above the textarea, right-aligned.

Current block (around lines 30-49):

```html
<!-- Notes -->
<div class="panel-section">
  <SectionHeader
    :title="$t('common.notes')"
    :collapsed="!sections.notes"
    @toggle="toggleSection('notes')"
  />
  <div v-if="sections.notes" class="panel-section-body">
    <textarea
      ref="notesRef"
      v-model="notesDraft"
      class="notes-textarea"
      :placeholder="$t('media.notesPlaceholder')"
      rows="3"
      :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
      @blur="persistNotesHeight(); saveNotes()"
      @mouseup="persistNotesHeight"
    ></textarea>
  </div>
</div>
```

- [ ] **Step 1: Add toggle bar inside the body**

Replace that body with:

```html
<div v-if="sections.notes" class="panel-section-body">
  <div class="notes-toggle-row">
    <AppButton
      variant="soft"
      size="sm"
      :aria-pressed="notesMonospaced"
      :title="$t('common.monospacedTooltip')"
      @click="toggleNotesMonospaced"
    >
      <span class="mono-glyph">&lt;/&gt;</span>
      <span class="toggle-label-mono">{{ $t('common.monospaced') }}</span>
    </AppButton>
  </div>
  <textarea
    ref="notesRef"
    v-model="notesDraft"
    class="notes-textarea"
    :class="{ 'notes-mono': notesMonospaced }"
    :placeholder="$t('media.notesPlaceholder')"
    rows="3"
    :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
    @blur="persistNotesHeight(); saveNotes()"
    @mouseup="persistNotesHeight"
  ></textarea>
</div>
```

Notes on layout: we can't add the toggle inside `SectionHeader`'s bar (it only has an `actionLabel` prop that renders a single label-driven AppButton). Putting it inside the body — aligned right above the textarea — keeps the section-header generic and is visually clean.

- [ ] **Step 2: Import composable (AppButton already imported)**

In `<script setup>`, add:

```ts
import { useMonospacedNotes } from '../composables/useMonospacedNotes';

const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('media');
```

- [ ] **Step 3: Add scoped styles**

Append to the `<style scoped>` block:

```css
.notes-toggle-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-xs);
}
.mono-glyph {
  font-family: var(--font-mono);
  font-weight: 600;
  opacity: 0.85;
}
.notes-textarea.notes-mono {
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Start app and verify**

Run: `npm start`. Open a media item's panel (via `/media` — select an item), expand the Notes section, confirm the toggle appears above the textarea and works as expected.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/MediaPanel.vue
git commit -m "feat(media): add monospaced notes toggle to media panel"
```

---

## Task 11: Update spec, bump version, update docs

**Files:**
- Modify: `docs/superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md` (update media scope)
- Modify: `package.json` (minor version bump)
- Modify: `docs/PLAN.md` (add/mark the feature done)

- [ ] **Step 1: Update the spec to reflect actual media scope**

Find in the spec the line:

```
5. **Media notes** — `MediaView.vue` and `MediaPanel.vue`.
```

Replace with:

```
5. **Media notes** — `MediaPanel.vue`. (MediaView uses single-line `<input type="text">` cells in a table, not a notes textarea, so it is excluded.)
```

And in "Files touched", remove the `src/renderer/views/MediaView.vue` line. Verify the "Total" line still matches (1 new composable + 1 new CSS token + 2 CSS classes + 2 i18n keys × 2 locales + 7 file edits across 5 entity types).

- [ ] **Step 2: Bump `package.json` version**

Find `"version": "x.y.z"` and bump the minor digit by 1 (feature addition). E.g. `0.119.6` -> `0.120.0` (minor bump resets patch to 0).

- [ ] **Step 3: Update `docs/PLAN.md`**

Add a `[done]` roadmap entry with a pointer to the spec. Look for how other completed entries are formatted — match that style exactly. Entry should include the date (2026-04-19), a one-line summary, and a link to `docs/superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md`.

- [ ] **Step 4: Run full test suite + lint + typecheck**

Run:
```bash
npm test
npm run lint
```
Expected: all tests pass (including new `useMonospacedNotes` tests), 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md package.json docs/PLAN.md
git commit -m "feat: monospaced notes toggle + docs + version bump to x.y.z"
```

(replace `x.y.z` with actual version.)

---

## Task 12: Archive the spec

**Files:**
- Move: `docs/superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md` -> `docs/superpowers/specs/archive/2026-04-19-monospaced-notes-toggle-design.md`
- Modify: `docs/PLAN.md` (update link to archived path)

- [ ] **Step 1: Move the spec to archive**

```bash
git mv docs/superpowers/specs/2026-04-19-monospaced-notes-toggle-design.md docs/superpowers/specs/archive/2026-04-19-monospaced-notes-toggle-design.md
```

- [ ] **Step 2: Update the link in `docs/PLAN.md`**

Change the pointer from `docs/superpowers/specs/2026-04-19-...` to `docs/superpowers/specs/archive/2026-04-19-...`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/archive/2026-04-19-monospaced-notes-toggle-design.md docs/PLAN.md
# (the git mv already staged the deletion)
git commit -m "docs: archive monospaced notes toggle spec"
```

---

## Manual verification checklist (end-to-end)

After Task 11 completes, run through this checklist in the app:

- [ ] Person notes: toggle appears right of heading, click flips font to monospaced, `localStorage` key `slaktforskning-monospace-notes-person` is `"true"`, persists across app reload.
- [ ] Relationship notes: same, key `...-relationship`.
- [ ] Place notes (both PlaceDetailView and PlacePanel): share state (flip in one, it's already on in the other), key `...-place`.
- [ ] Group notes: key `...-group`.
- [ ] Media notes (MediaPanel): key `...-media`.
- [ ] Flipping Person notes does NOT affect any other entity type.
- [ ] Button's "Monospaced" label is rendered in mono font, `</>` glyph in mono font, so the effect is self-demonstrating.
- [ ] `aria-pressed` reflects state (inspect DOM to confirm).
- [ ] Tooltip (hover) shows the long description.
- [ ] Dark mode + high-contrast mode: button still legible (AppButton variant "soft" uses tokens, so should be fine — verify anyway).
- [ ] ASCII-aligned content in an imported notes field (e.g. a simple column of names/dates) visually aligns when toggle is on and misaligns when toggle is off.
