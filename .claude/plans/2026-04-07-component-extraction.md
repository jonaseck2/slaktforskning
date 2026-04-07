# Large Component Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `PersonPanel.vue` (675 lines) and `ImportExportView.vue` (538 lines) into focused sub-components that are individually understandable, testable, and reusable — following the established "Person Section Component" pattern already used for `PersonIdentifiersSection`, `PersonMediaSection`, and `PersonChecksSection`.

**Architecture:** Extract each collapsible section in PersonPanel into its own self-loading component following the pattern: `watch(() => props.personId, load, { immediate: true })`, parent owns the section header button. Extract each import workflow tab in ImportExportView into a separate view component with its own route or dynamic component. No functionality changes — pure extraction.

**Tech Stack:** Vue 3 Composition API, `<script setup>`, `defineExpose`, `defineEmits`

---

### Task 1: Read and map PersonPanel.vue sections

**Files:**
- Read: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Read the full file**

Run: `cat -n src/renderer/components/PersonPanel.vue`

Map out each distinct section (look for collapsible divs with section headings). The known sections are:
1. Person header (name, sex, living toggle) — stays in PersonPanel
2. Names section — may already be `PersonNamesTable`
3. Events section — may already be `EventList`
4. Relationships section — may already be `PersonRelationshipsSection`
5. Sources/Citations section
6. Groups section — may already be `GroupsTable`
7. Research tasks section — may already be `ResearchTasksTable`
8. Notes section

For each section: note its line range, what data it loads, what it emits, and whether it already uses a sub-component.

- [ ] **Step 2: Identify what is NOT yet extracted**

Focus the plan on sections that are still inlined in PersonPanel's template. If a section is already a sub-component (e.g. `<EventList :person-id="personId" />`), skip it.

---

### Task 2: Extract PersonPanel notes section (if inlined)

**Files:**
- Create: `src/renderer/components/PersonNotesSection.vue` (if notes are inlined)
- Modify: `src/renderer/components/PersonPanel.vue`
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Check if notes are inlined in PersonPanel**

Run:
```bash
grep -n "notes\|textarea" src/renderer/components/PersonPanel.vue | head -20
```

If notes are a simple `<textarea v-model="person.notes" @blur="save">` inline, extract to a component:

```vue
<!-- src/renderer/components/PersonNotesSection.vue -->
<template>
  <textarea
    v-model="notes"
    class="notes-textarea"
    :placeholder="$t('personDetail.notesPlaceholder')"
    @blur="save"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ personId: string }>();
const { t } = useI18n();

const notes = ref('');

watch(
  () => props.personId,
  async (id) => {
    if (!id) return;
    const person = await window.api.persons.get(id);
    notes.value = person?.notes ?? '';
  },
  { immediate: true },
);

async function save() {
  if (!props.personId) return;
  await window.api.persons.update(props.personId, { notes: notes.value });
}
</script>

<style scoped>
.notes-textarea {
  width: 100%;
  min-height: 80px;
  resize: vertical;
  padding: 6px 8px;
  border: 1px solid var(--color-border-input);
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
</style>
```

- [ ] **Step 2: Replace inlined notes in PersonPanel.vue**

Replace the inlined notes textarea with:
```vue
<PersonNotesSection :person-id="personId" />
```

Import at the top of `<script setup>`:
```typescript
import PersonNotesSection from './PersonNotesSection.vue';
```

- [ ] **Step 3: Use in PersonDetailView.vue too**

Find the notes section in `src/renderer/views/PersonDetailView.vue` and replace it with `<PersonNotesSection :person-id="person.id" />`.

---

### Task 3: Extract any remaining inlined list sections from PersonPanel.vue

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

After Task 1's mapping, for each section still inlined:

- [ ] **Step 1: For each inlined section, create a self-loading component**

Follow the established pattern from `PersonIdentifiersSection.vue`:

```vue
<!-- Template pattern -->
<template>
  <div v-if="items.length === 0" class="empty-hint">{{ $t('section.empty') }}</div>
  <table v-else class="data-table">
    <!-- rows -->
  </table>
  <!-- add form modal (if applicable) -->
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ personId: string }>();
const items = ref<ItemType[]>([]);

watch(() => props.personId, load, { immediate: true });

async function load() {
  if (!props.personId) return;
  items.value = await window.api.namespace.forPerson(props.personId);
}

defineExpose({ openAddForm });
</script>
```

Key rules:
- Use `watch(() => props.personId, load, { immediate: true })` — never `onMounted`
- Call `load()` after every mutation
- `defineExpose` only if parent needs to trigger an action (e.g. open add form)

- [ ] **Step 2: Update PersonPanel.vue to use the new component**

Replace the inlined template block with `<NewSectionComponent :person-id="personId" />`.

- [ ] **Step 3: Update PersonDetailView.vue to use the same component**

Every section component must be used in both `PersonPanel` and `PersonDetailView`.

---

### Task 4: Extract ImportExportView tab sections

**Files:**
- Read: `src/renderer/views/ImportExportView.vue`
- Create: `src/renderer/components/import/GedcomImportSection.vue`
- Create: `src/renderer/components/import/GenneyImportSection.vue`
- Create: `src/renderer/components/import/HolgerImportSection.vue`
- Create: `src/renderer/components/import/GedcomExportSection.vue`
- Modify: `src/renderer/views/ImportExportView.vue`

- [ ] **Step 1: Read ImportExportView.vue fully**

Run: `cat -n src/renderer/views/ImportExportView.vue`

Map the four sections:
1. GEDCOM Import
2. GEDCOM Export
3. Genney Import (Docker + Derby + Archive)
4. Holger Import (file + EDB)

Note the props/data each section uses and what events it emits.

- [ ] **Step 2: Extract GedcomImportSection.vue**

Move the GEDCOM import UI (file picker button, options, import button, progress/result display) into:

```vue
<!-- src/renderer/components/import/GedcomImportSection.vue -->
<template>
  <!-- GEDCOM import form and progress display extracted from ImportExportView -->
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';

const { t } = useI18n();
const toast = useToast();
const status = ref('');
const running = ref(false);

async function runImport() {
  running.value = true;
  status.value = '';
  try {
    const result = await window.api.gedcom.import();
    if (result) {
      status.value = t('importExport.gedcomImportDone', { count: result.imported });
    }
  } catch (err) {
    console.error('[GedcomImportSection] import failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    running.value = false;
  }
}
</script>
```

- [ ] **Step 3: Extract GenneyImportSection.vue**

Move the Genney import UI (Docker check, Derby/Archive path selection, discover/run buttons, progress log). This section is stateful — it has a multi-step flow. Keep all the step state inside the component.

- [ ] **Step 4: Extract HolgerImportSection.vue**

Move the Holger import UI (file picker, media dir, run button, progress log).

- [ ] **Step 5: Extract GedcomExportSection.vue**

Move the GEDCOM export UI (format selector if present, export button, result path display).

- [ ] **Step 6: Simplify ImportExportView.vue to a tab container**

After extraction, ImportExportView becomes a tab bar that renders the appropriate section:

```vue
<template>
  <div class="import-export-view">
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <GedcomImportSection v-if="activeTab === 'gedcom-import'" />
    <GedcomExportSection v-if="activeTab === 'gedcom-export'" />
    <GenneyImportSection v-if="activeTab === 'genney'" />
    <HolgerImportSection v-if="activeTab === 'holger'" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import GedcomImportSection from '../components/import/GedcomImportSection.vue';
import GedcomExportSection from '../components/import/GedcomExportSection.vue';
import GenneyImportSection from '../components/import/GenneyImportSection.vue';
import HolgerImportSection from '../components/import/HolgerImportSection.vue';

const { t } = useI18n();
const activeTab = ref<'gedcom-import' | 'gedcom-export' | 'genney' | 'holger'>('gedcom-import');

const tabs = [
  { id: 'gedcom-import' as const, label: t('importExport.gedcomImport') },
  { id: 'gedcom-export' as const, label: t('importExport.gedcomExport') },
  { id: 'genney' as const, label: t('importExport.genney') },
  { id: 'holger' as const, label: t('importExport.holger') },
];
</script>
```

---

### Task 5: Run tests and commit

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Verify PersonPanel functionality**

Run: `npm start`
- Open a person in the visualization panel
- Verify all sections load correctly (names, events, relationships, etc.)
- Add an event, verify the list updates
- Switch to a different person in the panel — verify all sections reload (the `watch` pattern)

- [ ] **Step 3: Verify ImportExportView functionality**

- Navigate to Import/Export
- Switch between tabs — each should load cleanly
- Run a GEDCOM import end-to-end

- [ ] **Step 4: Verify PersonDetailView**

- Open a person detail page
- All sections should still work (they use the same sub-components as PersonPanel)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): extract PersonPanel and ImportExportView sections into components

Extract inlined sections from PersonPanel.vue into self-loading
components following the watch-immediate pattern. Extract import
workflow tabs from ImportExportView.vue into GedcomImportSection,
GedcomExportSection, GenneyImportSection, HolgerImportSection.
No functional changes."
```
