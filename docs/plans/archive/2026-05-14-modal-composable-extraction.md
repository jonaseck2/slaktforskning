# Modal Composable Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** EventModal, PersonNameModal, PersonModal, and RelationshipModal become thin orchestrators. State + validation + save logic lives in composables under `src/renderer/composables/`. Each composable has its own unit test.

**Architecture:** Each modal extracts to 3–5 composables along the canonical state/validation/save axes (same shape as the project's existing `useEntityData`, `useEditableFields`). Shared composables (expected: `useFormDirtyTracking`, `useRaceSafeSave`) discovered *after* the per-modal migration, not preemptively. All four modals migrate together (all-or-nothing).

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest.

**Design doc:** [2026-05-14-modal-composable-extraction-design.md](2026-05-14-modal-composable-extraction-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `src/renderer/composables/useEventForm.ts` | **New.** Form ref + dirty tracking + hydration for EventModal. |
| `src/renderer/composables/useEventValidation.ts` | **New.** Computed errors per field; blocking-save predicate. |
| `src/renderer/composables/useEventCitations.ts` | **New.** Citation list + add/remove/edit via CitationModal. |
| `src/renderer/composables/useEventParticipants.ts` | **New.** Participant list + add/remove/roles. |
| `src/renderer/composables/useEventSave.ts` | **New.** Save orchestration: insert/update + nested entity persistence + emit. |
| `src/renderer/composables/usePersonNameForm.ts` | **New.** |
| `src/renderer/composables/usePersonNameValidation.ts` | **New.** |
| `src/renderer/composables/usePersonNameSave.ts` | **New.** |
| `src/renderer/composables/usePersonForm.ts` | **New.** |
| `src/renderer/composables/usePersonValidation.ts` | **New.** |
| `src/renderer/composables/usePersonSave.ts` | **New.** Including primary-name creation on insert. |
| `src/renderer/composables/useRelationshipForm.ts` | **New.** |
| `src/renderer/composables/useRelationshipValidation.ts` | **New.** |
| `src/renderer/composables/useRelationshipSave.ts` | **New.** |
| `src/renderer/composables/useFormDirtyTracking.ts` | **New IF discovered shared.** Deep-equal comparison of refs. |
| `src/renderer/composables/useRaceSafeSave.ts` | **New IF discovered shared.** Generation-guarded save call. |
| `src/renderer/components/modals/EventModal.vue` | **Modified.** Target ≤ 400 LOC. |
| `src/renderer/components/modals/PersonNameModal.vue` | **Modified.** Target ≤ 300 LOC. |
| `src/renderer/components/modals/PersonModal.vue` | **Modified.** Target ≤ 300 LOC. |
| `src/renderer/components/modals/RelationshipModal.vue` | **Modified.** Target ≤ 300 LOC. |
| `tests/unit/composables/use<Name>.test.ts` | **New, one per composable.** |
| `src/renderer/i18n/sv.ts` + `en.ts` | New `errors.X` keys if needed. |
| `CHANGELOG.md` | Unreleased entry. |

---

## Task 1: Pre-flight measurement

- [ ] **Step 1: Capture per-modal LOC**

```bash
wc -l src/renderer/components/modals/EventModal.vue src/renderer/components/modals/PersonNameModal.vue src/renderer/components/modals/PersonModal.vue src/renderer/components/modals/RelationshipModal.vue
```

Record these. They go in the close-out's "before vs after" table.

- [ ] **Step 2: Capture template-vs-script split**

```bash
for f in src/renderer/components/modals/EventModal.vue src/renderer/components/modals/PersonNameModal.vue src/renderer/components/modals/PersonModal.vue src/renderer/components/modals/RelationshipModal.vue; do
  echo "=== $f ==="
  echo "template: $(awk '/<template>/{flag=1} flag{n++} /<\/template>/{flag=0; print n; exit}' $f)"
  echo "script:   $(awk '/<script setup/{flag=1} flag{n++} /<\/script>/{flag=0; print n; exit}' $f)"
done
```

Confirm the design's premise: script-setup is the dominant section in each modal.

---

## Task 2: Extract `useEventForm` (TDD)

**Files:**
- Create: `src/renderer/composables/useEventForm.ts`
- Create: `tests/unit/composables/useEventForm.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/composables/useEventForm.test.ts
import { describe, it, expect } from 'vitest';
import { useEventForm } from '../../../src/renderer/composables/useEventForm';

describe('useEventForm', () => {
  it('hydrates form from defaults on create mode', () => {
    const { form } = useEventForm({ eventId: null, mode: 'create', defaults: { event_type: 'birth' } });
    expect(form.event_type).toBe('birth');
    expect(form.date_original).toBe('');
  });

  it('marks dirty when a field changes', () => {
    const { form, isDirty } = useEventForm({ eventId: null, mode: 'create' });
    expect(isDirty.value).toBe(false);
    form.event_type = 'death';
    expect(isDirty.value).toBe(true);
  });

  it('hydrates form from existing event on edit mode', async () => {
    // Mock window.api.events.get
    (globalThis as any).window = { api: { events: { get: async () => ({ event_type: 'marriage', date_original: '1900-01-01' }) } } };
    const { form, loading } = useEventForm({ eventId: 'ev-1', mode: 'edit' });
    expect(loading.value).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(form.event_type).toBe('marriage');
  });
});
```

- [ ] **Step 2: Run test → expected to fail**

```bash
npx vitest run tests/unit/composables/useEventForm.test.ts 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write `useEventForm.ts`**

```typescript
// src/renderer/composables/useEventForm.ts
import { reactive, ref, watch, type Ref } from 'vue';

export interface UseEventFormOptions {
  eventId: string | null;
  mode: 'create' | 'edit' | 'copy';
  defaults?: Partial<EventForm>;
}

export interface EventForm {
  event_type: string;
  date_original: string;
  date_type: string;
  // ... add all event fields the modal renders
}

const EMPTY_FORM: EventForm = {
  event_type: '',
  date_original: '',
  date_type: 'exact',
  // ...
};

export function useEventForm(options: UseEventFormOptions) {
  const form = reactive<EventForm>({ ...EMPTY_FORM, ...options.defaults });
  const loading = ref(false);
  const originalSnapshot = ref<EventForm | null>(null);
  const isDirty = ref(false);

  watch(form, () => {
    if (!originalSnapshot.value) return;
    isDirty.value = JSON.stringify(form) !== JSON.stringify(originalSnapshot.value);
  }, { deep: true });

  if (options.mode === 'edit' && options.eventId) {
    loading.value = true;
    window.api.events.get(options.eventId).then((existing) => {
      Object.assign(form, existing);
      originalSnapshot.value = { ...form };
      loading.value = false;
    });
  } else {
    originalSnapshot.value = { ...form };
  }

  return { form, loading, isDirty };
}
```

- [ ] **Step 4: Run test → expected to pass**

```bash
npx vitest run tests/unit/composables/useEventForm.test.ts 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/composables/useEventForm.ts tests/unit/composables/useEventForm.test.ts
git commit -m "feat(composables): useEventForm — form ref + dirty tracking + hydration"
```

---

## Tasks 3-5: Extract the rest of EventModal's composables

Repeat the TDD pattern (Steps 1-5 from Task 2) for:

### Task 3: `useEventValidation`

- [ ] Write failing test: form with `event_type: ''` → returns `{ event_type: 'errors.required' }`.
- [ ] Implement: takes the form ref, returns `errors` (computed) and `canSave` (computed boolean).
- [ ] Commit.

### Task 4: `useEventCitations`

- [ ] Write failing test: starts empty for new events, returns existing citations for edit mode.
- [ ] Implement: list ref, `add(citation)`, `remove(id)`, `edit(id, citation)`.
- [ ] Commit.

### Task 5: `useEventParticipants`

- [ ] Write failing test: primary participant is auto-added; can add/remove non-primary.
- [ ] Implement: list ref + role-handling helpers.
- [ ] Commit.

### Task 6: `useEventSave`

- [ ] Write failing test: calls `window.api.events.create` for new events, `update` for existing; persists citations + participants in sequence.
- [ ] Implement: takes form + citations + participants refs + validation; orchestrates the save sequence.
- [ ] Commit.

---

## Task 7: Migrate EventModal.vue

**Files:**
- Modify: `src/renderer/components/modals/EventModal.vue`

- [ ] **Step 1: Replace inline state + handlers with composable mounts**

```vue
<script setup lang="ts">
import { useEventForm } from '../../composables/useEventForm';
import { useEventValidation } from '../../composables/useEventValidation';
import { useEventCitations } from '../../composables/useEventCitations';
import { useEventParticipants } from '../../composables/useEventParticipants';
import { useEventSave } from '../../composables/useEventSave';

const props = defineProps<{
  eventId: string | null;
  mode: 'create' | 'edit' | 'copy';
  primaryPersonId: string;
  defaults?: Partial<EventForm>;
}>();

const emit = defineEmits<{
  saved: [eventId: string];
  cancel: [];
}>();

const { form, loading, isDirty } = useEventForm({ ... });
const { errors, canSave } = useEventValidation(form);
const { citations, addCitation, removeCitation } = useEventCitations(props.eventId);
const { participants, addParticipant, removeParticipant } = useEventParticipants(props.eventId, props.primaryPersonId);
const { save, saving } = useEventSave({ form, citations, participants, eventId: props.eventId, mode: props.mode, emit });
</script>

<template>
  <BaseSubPanel
    entity-type="event"
    :title="mode === 'create' ? $t('events.addTitle') : $t('events.editTitle')"
    :save-disabled="!canSave || saving"
    @save="save"
    @cancel="emit('cancel')"
  >
    <!-- Existing template — fields bind to form.*, errors.*, citations/participants — unchanged structure -->
  </BaseSubPanel>
</template>
```

- [ ] **Step 2: Verify LOC target**

```bash
wc -l src/renderer/components/modals/EventModal.vue
```

Expected: ≤ 400.

- [ ] **Step 3: In-app spot-test**

```bash
npm start &
# Open PersonPanel → Events → click "+ Event"
# Fill form, save, verify event appears
# Edit an existing event, save, verify changes persist
# Cancel — verify no save
# Kill app
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/modals/EventModal.vue
git commit -m "refactor(EventModal): use composables (useEventForm/Validation/Citations/Participants/Save)

EventModal.vue: 1,052 → <new LOC>. State/validation/save logic
extracted to dedicated composables, each unit-tested in
tests/unit/composables/. Template structure unchanged."
```

---

## Tasks 8-10: Migrate PersonNameModal, PersonModal, RelationshipModal

Apply the same composable-extraction pattern to each. Each modal needs:
- `use<Name>Form`
- `use<Name>Validation`
- `use<Name>Save`

(No `useXCitations` / `useXParticipants` for these — simpler than EventModal.)

### Task 8: PersonNameModal

- [ ] Extract `usePersonNameForm`, `usePersonNameValidation`, `usePersonNameSave` with TDD (Steps 1-5 per composable).
- [ ] Migrate `PersonNameModal.vue`; verify ≤ 300 LOC; in-app spot-test.
- [ ] Commit per composable + final migration commit.

### Task 9: PersonModal

- [ ] Extract `usePersonForm`, `usePersonValidation`, `usePersonSave`. `usePersonSave` handles primary-name creation on insert.
- [ ] Migrate `PersonModal.vue`; verify ≤ 300 LOC; in-app spot-test.
- [ ] Commit per composable + final migration commit.

### Task 10: RelationshipModal

- [ ] Extract `useRelationshipForm`, `useRelationshipValidation`, `useRelationshipSave`.
- [ ] Migrate `RelationshipModal.vue`; verify ≤ 300 LOC; in-app spot-test.
- [ ] Commit per composable + final migration commit.

---

## Task 11: Discover shared composables

**Files:**
- Possibly create: `src/renderer/composables/useFormDirtyTracking.ts`
- Possibly create: `src/renderer/composables/useRaceSafeSave.ts`
- Modify: per-entity composables to import from shared.

- [ ] **Step 1: Compare the four `use<Name>Form.ts` files side-by-side**

```bash
diff -y --suppress-common-lines src/renderer/composables/useEventForm.ts src/renderer/composables/usePersonForm.ts | head -30
```

Look for identical patterns:
- Dirty-tracking via deep-equal snapshot comparison.
- Race-safe loading on prop changes.

- [ ] **Step 2: For each pattern used identically in ≥2 composables**

Extract to a shared composable:

```typescript
// src/renderer/composables/useFormDirtyTracking.ts
import { ref, watch } from 'vue';

export function useFormDirtyTracking<T extends object>(form: T) {
  const snapshot = ref<T | null>(null);
  const isDirty = ref(false);

  watch(form, () => {
    if (!snapshot.value) return;
    isDirty.value = JSON.stringify(form) !== JSON.stringify(snapshot.value);
  }, { deep: true });

  function setOriginal() {
    snapshot.value = JSON.parse(JSON.stringify(form));
    isDirty.value = false;
  }

  return { isDirty, setOriginal };
}
```

- [ ] **Step 3: Update consumers + write a unit test for the shared composable**

- [ ] **Step 4: Commit**

```bash
git add src/renderer/composables/useFormDirtyTracking.ts tests/unit/composables/useFormDirtyTracking.test.ts src/renderer/composables/use*Form.ts
git commit -m "refactor(composables): extract useFormDirtyTracking (≥2 modal usage)

Replaces inline dirty-tracking in useEventForm/usePersonForm/...
with a shared composable. Documented in close-out: rejected
patterns (cousins-but-different) listed."
```

- [ ] **Step 5: Same for `useRaceSafeSave`** if it qualifies. If neither pattern is ≥2-modal identical, skip — document the analysis in the close-out commit message.

---

## Task 12: i18n + verification

**Files:**
- Modify: `src/renderer/i18n/sv.ts`, `en.ts`

- [ ] **Step 1: Add any new error keys the validation composables surfaced**

Each composable's validation should surface `t('errors.fieldRequired')`, `t('errors.invalidDate')`, etc. Add new keys to both files.

- [ ] **Step 2: `tsc --noEmit` + `npm test`**

```bash
npx tsc --noEmit 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: 0 errors; test count up (new composable tests added).

- [ ] **Step 3: Per-modal LOC verification**

```bash
wc -l src/renderer/components/modals/EventModal.vue src/renderer/components/modals/PersonNameModal.vue src/renderer/components/modals/PersonModal.vue src/renderer/components/modals/RelationshipModal.vue
```

Expected: EventModal ≤ 400; others ≤ 300.

- [ ] **Step 4: Composable count + grep verification**

```bash
ls src/renderer/composables/use*Modal*.ts src/renderer/composables/use{Event,PersonName,Person,Relationship}*.ts | wc -l
grep -l "import { use" src/renderer/components/modals/EventModal.vue | xargs grep -c "import { use"
```

Each modal imports ≥3 composables.

- [ ] **Step 5: Commit i18n**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: add error keys for new modal validation composables"
```

---

## Task 13: CHANGELOG + close-out

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Unreleased entry**

```markdown
## Unreleased

### Refactored

- EventModal, PersonNameModal, PersonModal, RelationshipModal migrated to composable pattern. State, validation, and save orchestration live in dedicated composables under `src/renderer/composables/use<Modal>{Form,Validation,Save,...}.ts` with focused unit tests. Modal LOC: EventModal 1,052 → <new>, PersonNameModal 701 → <new>, PersonModal 646 → <new>, RelationshipModal 568 → <new>. Shared composables extracted: <list>; cousin-but-different patterns documented in commits.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: changelog for modal composable extraction"
```

---

## Self-review checklist

- [ ] Per-modal LOC under targets (EventModal ≤ 400; PersonName/Person/Relationship ≤ 300).
- [ ] Each modal imports ≥3 composables.
- [ ] Each composable has a unit test in `tests/unit/composables/`.
- [ ] Shared composables (if any) used by ≥2 modals; rejected-but-similar patterns documented.
- [ ] i18n error keys added to both `sv.ts` and `en.ts`.
- [ ] In-app spot-test verifies all four modals open + save + cancel correctly.
- [ ] `tsc --noEmit` + `npm test` pass.
- [ ] CHANGELOG Unreleased entry.

## Failure modes / RCA reference

- **Composable proliferation.** Per-modal composables are intentional; shared composables require ≥2 modal usage. Don't write speculative shared abstractions.
- **State synchronization bugs.** Refs passed between composables must be shared by reference. Each composable's JSDoc names which refs it takes by-ref vs by-value.
- **i18n drift.** Surface error keys via composables, not inline in modals. New keys go to both `sv.ts` and `en.ts` per CLAUDE.md i18n rule.
