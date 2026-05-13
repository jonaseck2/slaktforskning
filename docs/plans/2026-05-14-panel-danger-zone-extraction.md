# Panel Danger-Zone Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Extract the duplicated `panel-danger-zone` block from 6 entity panels (Person, Place, Source, Media, Group, ResearchTask) into a `<PanelDangerZone>` component. Single source of truth for entity-deletion UX; future changes land in one file.

**Architecture:** New shared component owns markup + delete-confirm state + ConfirmModal + entityType dispatcher (calls the right `window.api.<entity>.delete()`). Parent panels render `<PanelDangerZone>` with `entityType`, `entityId`, `entityLabel`, `cascadeSummary`, `readonly?` props. i18n keys unified across panels.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest.

**Design doc:** [2026-05-14-panel-danger-zone-extraction-design.md](2026-05-14-panel-danger-zone-extraction-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `src/renderer/components/PanelDangerZone.vue` | **New.** Component with internal entityType dispatcher. |
| `src/renderer/components/{Person,Place,Source,Media,Group,ResearchTask}Panel.vue` | **Modified.** Inline danger-zone block removed; `<PanelDangerZone>` rendered with props. |
| `src/renderer/i18n/sv.ts` + `en.ts` | Unified `confirmModal.deleteEntity.*` keys with `{entity}` interpolation. |
| `tests/unit/components/PanelDangerZone.test.ts` | **New.** Component unit test. |
| `CHANGELOG.md` | Unreleased entry. |

---

## Task 1: Audit current six implementations

- [ ] **Step 1: Capture each panel's current danger-zone implementation**

```bash
for f in src/renderer/components/PersonPanel.vue src/renderer/components/PlacePanel.vue src/renderer/components/SourcePanel.vue src/renderer/components/MediaPanel.vue src/renderer/components/GroupPanel.vue src/renderer/components/ResearchTaskPanel.vue; do
  echo "=== $f ==="
  grep -B 1 -A 15 'panel-danger-zone' "$f" | head -30
done
```

- [ ] **Step 2: Record per-panel differences in a scratch note**

For each panel, note:
- Confirm dialog title text (what i18n key, or hardcoded?)
- Cascade summary shape (array of strings? formatted paragraph?)
- Delete API method (`window.api.persons.delete`, etc.)
- Post-delete navigation (route back to list? close panel?)
- Whether the danger-zone is conditional on `readonly`

Differences inform the component API + i18n unification plan.

---

## Task 2: Build `<PanelDangerZone>` (TDD)

**Files:**
- Create: `src/renderer/components/PanelDangerZone.vue`
- Create: `tests/unit/components/PanelDangerZone.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/components/PanelDangerZone.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PanelDangerZone from '../../../src/renderer/components/PanelDangerZone.vue';

describe('PanelDangerZone', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      api: {
        persons: { delete: vi.fn().mockResolvedValue(undefined) },
        places: { delete: vi.fn().mockResolvedValue(undefined) },
        // ...
      },
    };
  });

  it('renders the delete button with entity-typed label', () => {
    const wrapper = mount(PanelDangerZone, {
      props: { entityType: 'person', entityId: 'p-1', entityLabel: 'John Doe', cascadeSummary: [] },
    });
    expect(wrapper.find('.panel-danger-zone').exists()).toBe(true);
    expect(wrapper.text()).toContain('John Doe');
  });

  it('opens confirm dialog on click', async () => {
    const wrapper = mount(PanelDangerZone, {
      props: { entityType: 'person', entityId: 'p-1', entityLabel: 'John Doe', cascadeSummary: ['3 events'] },
    });
    await wrapper.find('.panel-danger-zone button').trigger('click');
    expect(wrapper.find('.modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('3 events');
  });

  it('dispatches to the correct delete API based on entityType', async () => {
    const wrapper = mount(PanelDangerZone, {
      props: { entityType: 'place', entityId: 'pl-1', entityLabel: 'Stockholm', cascadeSummary: [] },
    });
    await wrapper.find('.panel-danger-zone button').trigger('click');
    await wrapper.find('.modal .btn-delete').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect((window as any).api.places.delete).toHaveBeenCalledWith('pl-1');
  });

  it('emits "deleted" after successful delete', async () => {
    const wrapper = mount(PanelDangerZone, {
      props: { entityType: 'person', entityId: 'p-1', entityLabel: 'X', cascadeSummary: [] },
    });
    await wrapper.find('.panel-danger-zone button').trigger('click');
    await wrapper.find('.modal .btn-delete').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.emitted('deleted')).toBeTruthy();
  });

  it('hidden when readonly', () => {
    const wrapper = mount(PanelDangerZone, {
      props: { entityType: 'person', entityId: 'p-1', entityLabel: 'X', cascadeSummary: [], readonly: true },
    });
    expect(wrapper.find('.panel-danger-zone').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail**

```bash
npx vitest run tests/unit/components/PanelDangerZone.test.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement `PanelDangerZone.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from './ui/AppButton.vue';
import IconTrash from './icons/IconTrash.vue';
import ConfirmModal from './modals/ConfirmModal.vue';

type EntityType = 'person' | 'place' | 'source' | 'media' | 'group' | 'research-task';

const props = defineProps<{
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  cascadeSummary: string[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  deleted: [];
}>();

const { t } = useI18n();
const showConfirm = ref(false);
const deleting = ref(false);

const deleteApi = computed(() => {
  switch (props.entityType) {
    case 'person': return window.api.persons.delete;
    case 'place': return window.api.places.delete;
    case 'source': return window.api.sources.delete;
    case 'media': return window.api.media.delete;
    case 'group': return window.api.groups.delete;
    case 'research-task': return window.api.researchTasks.delete;
  }
});

async function confirmDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await deleteApi.value(props.entityId);
    showConfirm.value = false;
    emit('deleted');
  } catch (err) {
    console.error(`[PanelDangerZone] delete failed for ${props.entityType}/${props.entityId}:`, err);
    // TODO: toast — surface to user once toast host exists
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div v-if="!readonly" class="panel-danger-zone">
    <AppButton variant="secondary" size="sm" @click="showConfirm = true">
      <IconTrash class="trash-icon" />
      {{ t('confirmModal.deleteEntity.action', { entity: t(`entities.${entityType}`) }) }}
    </AppButton>

    <ConfirmModal
      v-if="showConfirm"
      :title="t('confirmModal.deleteEntity.title', { entity: t(`entities.${entityType}`) })"
      :body="t('confirmModal.deleteEntity.body', { entity: entityLabel })"
      :details="cascadeSummary"
      tone="danger"
      :confirm-label="t('confirmModal.deleteEntity.confirm')"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<style scoped>
.trash-icon { width: 16px; height: 16px; margin-right: 4px; }
</style>
```

- [ ] **Step 4: Run tests → expected to pass**

```bash
npx vitest run tests/unit/components/PanelDangerZone.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PanelDangerZone.vue tests/unit/components/PanelDangerZone.test.ts
git commit -m "feat(components): PanelDangerZone with entityType dispatcher

Shared danger-zone component for the 6 entity panels. Internal
dispatcher selects window.api.<entity>.delete based on entityType
prop (typed union — typos fail tsc). Parent panels supply
cascadeSummary as already-formatted strings."
```

---

## Task 3: Add unified i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts`, `en.ts`

- [ ] **Step 1: Add the unified keys**

```typescript
// In each i18n file, add under existing structure:

confirmModal: {
  deleteEntity: {
    action: 'Ta bort {entity}',       // sv
    title: 'Ta bort {entity}?',
    body: 'Detta tar bort {entity} och relaterad information.',
    confirm: 'Ta bort',
  },
},
entities: {
  person: 'person',
  place: 'plats',
  source: 'källa',
  media: 'media',
  group: 'grupp',
  'research-task': 'forskningsuppgift',
},
```

```typescript
// English equivalents in en.ts:
confirmModal: {
  deleteEntity: {
    action: 'Delete {entity}',
    title: 'Delete this {entity}?',
    body: 'This will delete {entity} and any related information.',
    confirm: 'Delete',
  },
},
entities: {
  person: 'person',
  place: 'place',
  source: 'source',
  media: 'media item',
  group: 'group',
  'research-task': 'research task',
},
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: unified confirmModal.deleteEntity.* keys for PanelDangerZone

Single key shape interpolating {entity} replaces six panel-specific
wordings. User-visible change documented in close-out: previous
panels had slightly different confirm-dialog text."
```

---

## Task 4: Migrate PersonPanel (reference)

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

- [ ] **Step 1: Replace inline danger-zone with `<PanelDangerZone>`**

```vue
<!-- Before (somewhere near the bottom of <template>): -->
<div v-if="!props.readonly" class="panel-danger-zone">
  <AppButton variant="secondary" size="sm" @click="showDeleteConfirm = true">
    <IconTrash class="trash-icon" />
    {{ t('persons.deleteButton') }}
  </AppButton>
</div>
<ConfirmModal v-if="showDeleteConfirm" ... />

<!-- After: -->
<PanelDangerZone
  entity-type="person"
  :entity-id="personId"
  :entity-label="formatFullName(person)"
  :cascade-summary="cascadeSummary"
  :readonly="props.readonly"
  @deleted="onDeleted"
/>
```

- [ ] **Step 2: Remove the now-dead `showDeleteConfirm` ref + `confirmDelete` handler from `<script setup>`**

- [ ] **Step 3: Keep `cascadeSummary` computed in the panel** — domain-specific (counts events, citations, etc.).

- [ ] **Step 4: Wire `onDeleted`**

```typescript
function onDeleted() {
  emit('close');
  router.push('/persons');
}
```

- [ ] **Step 5: In-app spot-test**

```bash
npm start &
# Open PersonPanel for a test person
# Click the danger-zone button
# Confirm dialog appears with the right person name and cascade summary
# Click Delete; verify person disappears, panel closes, route returns to /persons
# Kill app
```

- [ ] **Step 6: Verify LOC drop**

```bash
wc -l src/renderer/components/PersonPanel.vue
```

Expected: ~30-50 LOC less than before.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/PersonPanel.vue
git commit -m "refactor(PersonPanel): use PanelDangerZone (reference migration)

First of six. PersonPanel.vue: <old LOC> → <new LOC>. Confirms
the component API works end-to-end before fanning out to other panels."
```

---

## Tasks 5-9: Migrate remaining panels

For each of PlacePanel, SourcePanel, MediaPanel, GroupPanel, ResearchTaskPanel, repeat Task 4's pattern (Steps 1-7). Each is a separate task and a separate commit.

- [ ] **Task 5: PlacePanel** — entityType="place"
- [ ] **Task 6: SourcePanel** — entityType="source"
- [ ] **Task 7: MediaPanel** — entityType="media"
- [ ] **Task 8: GroupPanel** — entityType="group"
- [ ] **Task 9: ResearchTaskPanel** — entityType="research-task"

After each task: in-app spot-test the relevant entity's delete flow.

---

## Task 10: Verify no inline `panel-danger-zone` remains

- [ ] **Step 1: Grep across the entity panels**

```bash
grep 'panel-danger-zone' src/renderer/components/{Person,Place,Source,Media,Group,ResearchTask}Panel.vue
```

Expected: empty.

- [ ] **Step 2: Grep all renderer for the class — should only appear inside PanelDangerZone.vue + shared.css**

```bash
grep -rln 'panel-danger-zone' src/renderer/
```

Expected: only `PanelDangerZone.vue` and `src/renderer/styles/shared.css` (the CSS class definition).

---

## Task 11: Verification

- [ ] **Step 1: `tsc --noEmit` + `npm test`**

```bash
npx tsc --noEmit 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: 0 type errors; test count up by 5 (PanelDangerZone tests).

- [ ] **Step 2: Per-panel LOC verification**

```bash
wc -l src/renderer/components/{Person,Place,Source,Media,Group,ResearchTask}Panel.vue
```

Each panel should drop ~30-50 LOC vs pre-refactor.

- [ ] **Step 3: All six deletion flows spot-tested in-app**

Sequence: launch app → for each of {person, place, source, media, group, research-task}, open one entity, click trash, confirm dialog appears with correct cascade summary, click delete, entity disappears, navigation returns to list. Kill app.

---

## Task 12: CHANGELOG + close-out

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Unreleased entry**

```markdown
## Unreleased

### Refactored

- Six entity panels (Person, Place, Source, Media, Group, ResearchTask) migrated from inline `panel-danger-zone` markup to shared `<PanelDangerZone>` component. Single source of truth for entity-deletion UX; future changes (e.g., type-name-to-confirm gate) land in one file. Per-panel LOC drop: ~30-50 each. Confirm-dialog wording unified — minor user-visible change documented here.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: changelog for PanelDangerZone extraction"
```

---

## Self-review checklist

- [ ] `src/renderer/components/PanelDangerZone.vue` exists with internal entityType dispatcher.
- [ ] Six entity panels import + render it; no inline `panel-danger-zone` blocks remain.
- [ ] Per-panel LOC drop ~30-50 each.
- [ ] `tests/unit/components/PanelDangerZone.test.ts` covers: render, confirm-on-click, dispatcher per entityType, emit on success, readonly hides component.
- [ ] Unified i18n keys (`confirmModal.deleteEntity.*` + `entities.*`) in both `sv.ts` and `en.ts`.
- [ ] All six deletion flows spot-tested in-app.
- [ ] CHANGELOG Unreleased entry naming the i18n string change.

## Failure modes / RCA reference

- **Cascade-summary divergence.** Each panel computes its own cascade-summary array. `PanelDangerZone` only renders; doesn't compute. Don't push domain knowledge into the shared component.
- **Reactive prop staleness.** When the user navigates between entities, `entityId` prop changes; the component's internal `showConfirm` state must reset. Verify in Task 4's spot-test.
- **i18n drift visible to users.** Previous panels had slightly different confirm-dialog wording. The unification is a real UX change — document in CHANGELOG so it doesn't surprise users.
