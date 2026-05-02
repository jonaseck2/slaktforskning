# Name changes on the timeline + opt-in name change in marriage modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## User goal

Two coupled outcomes:

1. **A user-authored name change appears on the person's timeline at the date the user typed.** Today, if a user opens the name editor for a person, sets the type to `married` or `name_change`, types a new given/surname and a from-date, the name is saved but it is invisible on the timeline. The timeline only emits real events. The user goal is: that authored fact about *when* the person started being known by a different name shows up alongside births, marriages, and deaths.
2. **The marriage event modal can optionally record a married name in the same step,** mirroring the existing birth-flow pattern where adding a person also captures their birth name. Off by default. The user-typed surname (and given name if changed) is written as a regular `person_names` row with `name_type='married'` and `date_from` = the marriage event's date. Cascading event-edits do NOT propagate to the name row — it's a separately authored fact from the moment it's created.

The second outcome is enabled by the first: without timeline-visible name changes, a married name authored by the marriage modal would still be invisible.

## Scope

Every surface that authors, displays, or derives from `person_names` rows where `name_type !== 'birth'`.

**In scope:**
- `src/renderer/components/modals/PersonNameModal.vue` — surface `date_from` as a top-level field (not buried in `<details>`) for every non-birth name type. Remove the duplicate hidden `date_from` in the `<details>` block. Keep `date_to` in `<details>` (rare).
- `src/api/report_data.ts` `getTimeline()` — derive synthetic timeline entries from `person_names` rows where `name_type !== 'birth'` AND `date_from IS NOT NULL`. Render-time only; no DB writes.
- `src/renderer/components/PersonTimeline.vue` — render the new entry shape (i18n label, dot class). Display: "Took the name {fullname}" / Swedish "Tog namnet {fullname}".
- `src/renderer/components/modals/EventModal.vue` — when `event_type ∈ {marriage, wedding, engagement}` AND `personId` is set AND we are not editing an existing event, expose an opt-in collapsible section "Also record a name change for {person}" with given_name / surname / name_type fields, pre-filled from the person's current displayed name. On save, after creating the event, also call `persons.addName` with `date_from = event.date_value`.
- `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` — new keys for the timeline label, dot class translation, and the marriage-modal opt-in section.
- `tests/unit/timeline-name-changes.test.ts` (new) — Vitest covering the timeline derivation against an in-memory DB.

**Scope deviations (explicit):**
- **Schema migration: NOT NEEDED.** `person_names` already has `date_from` and `date_to` columns (`schema.ts` lines 23–24, 66–67, present since v0.79.0).
- **MCP changes: NOT NEEDED.** `add_person_name` and `update_person_name` already accept `date_from`. Agents authoring named names with dates already produces correct timeline entries via the new derivation.
- **EventModal name change for `divorce`: out of scope.** A married name typically remains after divorce; the user can manually add a `name_change` row with a divorce-date `date_from` if they want to capture reverting to a maiden name. Adding this as a checkbox would clutter the divorce form for the rare case.
- **EventModal companion for the spouse: out of scope.** The companion field captures a name change for `props.personId` only (the panel-owner). If the user wants to record a name change for the spouse too, they open the spouse's panel and use PersonNameModal directly. Capturing both in one modal is a UX maze.
- **`alias` / `aka` name types: not given a top-level date_from field by default.** These are typically not date-bound. Keep `date_from` for those types accessible in the `<details>` block. (For `married` and `name_change`, surface it inline.)
- **PersonNamesTable display: out of scope.** The current table doesn't show dates. Adding a "From" column is a separate UX decision; the timeline is the user-facing surface this plan targets.

## Verification

The user goal is user-observable; tests are not enough. Run the manual smoke check first; passing Vitest is hygiene, not verification.

1. **Smoke check (manual, in the running app):**
   - Open a person, edit their name to add a `married` row with `given_name="Anna"`, `surname="Lindberg"`, `date_from="1962-03-15"`.
   - Switch to the Timeline section in the same panel.
   - Confirm a new entry appears at 1962-03-15: "Took the name Anna Lindberg" (or Swedish equivalent).
   - Confirm pre-existing names without `date_from` produce NO new timeline entries (no spurious "Took the name …" rows from old data).

2. **Smoke check, marriage flow:**
   - Open a female person Anna Andersson with no married name. From her panel, click Add event → marriage. Pick a partner. Tick "Also record a name change for Anna Andersson". Surname changes to "Lindberg". Set marriage date to 1962-03-15. Save.
   - Confirm the marriage event appears on her timeline.
   - Confirm a `married` name row exists in PersonNamesTable with `date_from=1962-03-15`.
   - Confirm a "Took the name Anna Lindberg" entry appears at the same date in her timeline.
   - Edit the marriage event's date to 1963-01-01. Confirm the event timeline entry moves but the name-change entry stays at 1962-03-15 (the name row's `date_from` is independent — separately authored).
   - Delete the marriage event. Confirm the name row remains in PersonNamesTable. (Cascade-decoupling.)

3. **Vitest:** `tests/unit/timeline-name-changes.test.ts` — given an in-memory DB with a person, a birth name, and a `married` name with `date_from='1962-03-15'`, calling `getTimeline(db, personId)` returns an entry with `event.event_type === 'name_change'`, `event.date_value === '1962-03-15'`, `relationship_label === 'self'`, and the synthetic event's `description` contains the new full name. Add a sibling test asserting that a `married` row with NULL `date_from` produces NO timeline entry (no inference).

4. **Regression:** Run `npm test`. No existing timeline test should regress.

## Failure modes / RCA reference

- **Prime Directive risk in EventModal companion field.** The marriage-modal "Also record a name change" checkbox MUST default to off. Pre-filling fields from the current displayed name is a UI convenience, but **only the user clicking "Save" with the box ticked** writes the row. If the box is unticked, no name row is created — even if the surname field has text in it.
- **Prime Directive risk on event edit/delete.** The married name created during marriage-event creation is a regular `person_names` row from the moment it's written. Editing the marriage event's date later does NOT update the name row's `date_from`. Deleting the marriage event does NOT delete the name row. The plan's spec-reviewer must confirm this — silently cascading would be a Prime Directive violation (the user authored both as separate facts at the time of creation; a later event edit didn't authorize a re-author of the name row).
- **Synthetic event leakage.** The timeline derivation builds a fake `GenealogyEvent` shape with `event_type='name_change'` and pushes it into `entries[]`. This object MUST exist only in memory inside `getTimeline()` and the renderer. It must NOT be written via any `events.create` / INSERT path. The plan's code-reviewer must grep for any path that takes a TimelineEntry and persists `entry.event` — there should be none.

---

## File structure

| File | Responsibility | Status |
|------|----------------|--------|
| `src/api/report_data.ts` | Add `appendNameChangeEntries(db, personId, names, primaryName, lifetime, entries)` helper; call it from `getTimeline()` after own-events block | Modify |
| `src/api/types.ts` | (Optional, only if `event_type` is constrained) — confirm the synthetic value passes the type. If `event_type` is `string`, no change. | Read-only verify |
| `tests/unit/timeline-name-changes.test.ts` | New Vitest suite | Create |
| `src/renderer/components/PersonTimeline.vue` | i18n label fall-through for `event_type='name_change'`; CSS `dot-name_change` class | Modify |
| `src/renderer/components/modals/PersonNameModal.vue` | Surface `date_from` inline for `married` / `name_change`; remove duplicate from `<details>`; keep `date_to` in `<details>` | Modify |
| `src/renderer/components/modals/EventModal.vue` | Add opt-in "Also record a name change" companion section for couple events | Modify |
| `src/renderer/i18n/sv.ts` | New keys: `timelineLabels.nameChange`, `eventTypes.name_change`, `events.alsoRecordNameChange`, `events.alsoRecordNameChangeHint` | Modify |
| `src/renderer/i18n/en.ts` | Same keys, English | Modify |

---

## Tasks

### Task 1: Timeline derivation — failing test first

**Files:**
- Create: `tests/unit/timeline-name-changes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createTestDb, closeTestDb } from './helpers';
import { createPerson, addPersonName } from '../../src/api/persons';
import { getTimeline } from '../../src/api/report_data';

describe('getTimeline — name change derivation', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { closeTestDb(db); });

  it('emits a name_change entry for a non-birth name with date_from', () => {
    const p = createPerson(db, { sex: 'F', notes: '' });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Andersson', name_type: 'birth', sort_order: 0,
    });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Lindberg', name_type: 'married',
      date_from: '1962-03-15', sort_order: 1,
    });

    const entries = getTimeline(db, p.id)!;
    const nameChange = entries.find(e => e.event.event_type === 'name_change');
    expect(nameChange).toBeDefined();
    expect(nameChange!.event.date_value).toBe('1962-03-15');
    expect(nameChange!.relationship_label).toBe('self');
    expect(nameChange!.event.description).toContain('Anna Lindberg');
  });

  it('emits NO name_change entry for a name with NULL date_from', () => {
    const p = createPerson(db, { sex: 'F', notes: '' });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Lindberg', name_type: 'married', sort_order: 1,
    });
    const entries = getTimeline(db, p.id)!;
    expect(entries.find(e => e.event.event_type === 'name_change')).toBeUndefined();
  });

  it('emits NO name_change entry for the birth name even with date_from set', () => {
    const p = createPerson(db, { sex: 'F', notes: '' });
    addPersonName(db, p.id, {
      given_name: 'Anna', surname: 'Andersson', name_type: 'birth',
      date_from: '1940-06-01', sort_order: 0,
    });
    const entries = getTimeline(db, p.id)!;
    expect(entries.find(e => e.event.event_type === 'name_change')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/timeline-name-changes.test.ts`
Expected: FAIL — no name_change entries are emitted yet.

---

### Task 2: Timeline derivation — implementation

**Files:**
- Modify: `src/api/report_data.ts` — add helper after `readSubjectLifetime()`, call from `getTimeline()` after the own-events block

- [ ] **Step 1: Add the synthetic-entry helper**

Open `src/api/report_data.ts`. Find the spot inside `getTimeline()` immediately after the own-events block (after the loop that pushes `ownEvents` to `entries`, before the `lifetime` calculation or right after — placement doesn't matter for ordering since the timeline is sorted at render). Add:

```typescript
// Synthetic timeline entries for authored name changes.
// PRIME DIRECTIVE: these entries are computed from authored person_names rows
// (date_from + name_type !== 'birth'). Nothing is persisted; the synthetic
// GenealogyEvent shape lives only in this returned array.
for (const n of names) {
  if (n.name_type === 'birth') continue;
  if (!n.date_from) continue;
  const fullName = [n.name_prefix, n.given_name, n.surname, n.name_suffix]
    .filter(Boolean).join(' ').trim();
  if (!fullName) continue;
  entries.push({
    event: {
      id: `name-change-${n.id}`,
      event_type: 'name_change',
      date_type: 'exact',
      date_value: n.date_from,
      date_value_end: null,
      date_original: n.date_from,
      place_id: null,
      place_address: null,
      place_name: null,
      place: null,
      cause: null,
      description: fullName,
      relationship_id: null,
      created_at: '',
      updated_at: '',
    } as EventWithPlace,
    person_id: personId,
    person_given_name: primaryName.given_name,
    person_surname: primaryName.surname,
    relationship_label: 'self',
  });
}
```

The exact `EventWithPlace` shape may have additional optional fields — fill any unspecified ones with `null` to satisfy the type. If the type is strict and rejects `event_type: 'name_change'`, cast through `as unknown as EventWithPlace` (the synthetic event is exactly the kind of render-time-only shape this cast is for).

- [ ] **Step 2: Re-run the test**

Run: `npx vitest run tests/unit/timeline-name-changes.test.ts`
Expected: All three test cases PASS.

- [ ] **Step 3: Run full vitest to check for regressions**

Run: `npm test -- --run`
Expected: PASS. Pay attention to any existing `report_data` / timeline tests.

- [ ] **Step 4: Commit**

```bash
git add src/api/report_data.ts tests/unit/timeline-name-changes.test.ts
git commit -m "feat(timeline): derive name-change entries from authored person_names.date_from"
```

---

### Task 3: PersonTimeline renderer — i18n + dot class

**Files:**
- Modify: `src/renderer/components/PersonTimeline.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add i18n keys**

In `src/renderer/i18n/sv.ts`, find the `eventTypes` block and add:

```typescript
name_change: 'Namnändring',
```

In the `timelineLabels` block (or wherever the per-event-type narration strings live — grep `timelineLabels` to confirm), add a key the timeline component will use to format the entry. Confirm by reading PersonTimeline.vue how the description is rendered. If the description is rendered raw (as is the case via `item.event.description`), the i18n key is not strictly needed there — `eventTypes.name_change` is enough to label the dot/label area.

In `src/renderer/i18n/en.ts`, mirror:
```typescript
name_change: 'Name change',
```

- [ ] **Step 2: Add the dot CSS class**

Open `src/renderer/components/PersonTimeline.vue`. Find the existing `.dot-birth`, `.dot-marriage`, `.dot-death` style rules. Add:

```css
.dot-name_change {
  background: var(--accent);
}
```

Pick a color that visually distinguishes name changes from other event types — `var(--accent)` is fine, or a softer tone if it clashes. Verify by visual smoke check.

- [ ] **Step 3: Sanity-check rendering**

Run `npm start`. Open a person panel. With a `married` name with `date_from` already on file, confirm the entry appears in the timeline at the right date with the right label and dot. If the description doesn't read well (e.g., raw fullname), tweak the description format in `report_data.ts` to "Tog namnet {fullname}" / "Took the name {fullname}" or — better — use a dedicated i18n key resolved in PersonTimeline.vue from `event.event_type === 'name_change'` plus `event.description`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PersonTimeline.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(timeline): render name-change entries with dot class and i18n label"
```

---

### Task 4: PersonNameModal — surface date_from inline; remove duplicate

**Files:**
- Modify: `src/renderer/components/modals/PersonNameModal.vue`

- [ ] **Step 1: Surface date_from for non-birth types and remove the duplicate**

Today the inline `date_from` field shows only for `married` / `name_change`. The same field also appears unconditionally in the `<details>` block. Goal: one inline `date_from` field shown for any non-birth name type; only `date_to` remains in `<details>`.

Replace the inline conditional block:
```vue
<!-- Date from (for dated name types) -->
<div v-if="form.name_type === 'married' || form.name_type === 'name_change'" class="ep-field">
  <span class="ep-field-label">{{ $t('names.dateFrom') }}</span>
  <SimpleDateInput v-model="form.date_from" />
</div>
```
with:
```vue
<!-- Date from — shown for every non-birth name type -->
<div v-if="form.name_type !== 'birth'" class="ep-field">
  <span class="ep-field-label">{{ $t('names.dateFrom') }}</span>
  <SimpleDateInput v-model="form.date_from" />
  <span class="ep-field-hint">{{ $t('names.dateFromHint') }}</span>
</div>
```

Inside the `<details>` block, remove the `date_from` field:
```vue
<!-- DELETE this block -->
<div class="ep-field">
  <span class="ep-field-label">{{ $t('names.dateFrom') }}</span>
  <SimpleDateInput v-model="form.date_from" />
</div>
```
Keep the `date_to` field in `<details>`.

- [ ] **Step 2: Add the i18n hint**

In `src/renderer/i18n/sv.ts` `names`:
```typescript
dateFromHint: 'Visas på personens tidslinje när datum anges.',
```
In `src/renderer/i18n/en.ts` `names`:
```typescript
dateFromHint: 'Shows on the person’s timeline when a date is set.',
```

- [ ] **Step 3: Smoke test**

Run `npm start`. Open a person, add an `alias` name with a `date_from`, save, switch to the Timeline section. Confirm the alias appears as a name_change entry. Open the modal again, confirm the date_from shows inline and is no longer duplicated in `<details>`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/modals/PersonNameModal.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(person-name-modal): surface date_from inline for non-birth name types"
```

---

### Task 5: EventModal — opt-in name change companion

**Files:**
- Modify: `src/renderer/components/modals/EventModal.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add reactive state for the companion section**

In `<script setup>` of `EventModal.vue`, near the `COUPLE_EVENT_TYPES` set, add:

```typescript
// Marriage-modal name-change companion (opt-in).
// PRIME DIRECTIVE: this checkbox is OFF by default. The fields are pre-filled
// from the person's current displayed name as a convenience, but no name row is
// written unless the user keeps the checkbox ticked when saving.
const NAME_CHANGE_EVENT_TYPES = new Set(['marriage', 'wedding', 'engagement']);
const recordNameChange = ref(false);
const nameChangeForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'married' as 'married' | 'name_change',
});
const showNameChangeCompanion = computed(
  () => NAME_CHANGE_EVENT_TYPES.has(form.event_type)
    && !!props.personId
    && !props.editingEvent,
);
```

- [ ] **Step 2: Pre-fill name fields when the section becomes visible**

Add a watcher that pre-fills `nameChangeForm` when the section first appears (or when the user toggles the checkbox on). Pre-fill from the person's current displayed name via `pickDisplayedName(names, events)`:

```typescript
watch([showNameChangeCompanion, recordNameChange], async ([visible, on]) => {
  if (!(visible && on)) return;
  if (nameChangeForm.given_name || nameChangeForm.surname) return; // already typed
  if (!props.personId || !window.api) return;
  try {
    const [namesResp, eventsResp] = await Promise.all([
      window.api.persons.getNames(props.personId) as Promise<Array<{ given_name: string; surname: string; name_type: string; date_from: string | null; preferred_name?: string | null }>>,
      window.api.events.forPerson(props.personId) as Promise<Array<{ event_type: string; date_value: string | null }>>,
    ]);
    const current = pickDisplayedName(namesResp, eventsResp);
    if (!current) return;
    nameChangeForm.given_name = current.given_name ?? '';
    nameChangeForm.surname = current.surname ?? '';
  } catch { /* ignore */ }
});
```

`pickDisplayedName` is already imported in `PersonNameModal.vue` from `../../utils/nameUtils` — add the same import to `EventModal.vue` if not already present.

- [ ] **Step 3: Render the companion section in the template**

Just below the second-person picker block (where the spouse-picker section lives), add:

```vue
<!-- Opt-in: also record a name change for the panel-owning person.
     PRIME DIRECTIVE: a name row is only written if recordNameChange stays true at save. -->
<div v-if="showNameChangeCompanion" class="ep-field">
  <label class="ep-checkbox">
    <input type="checkbox" v-model="recordNameChange" />
    <span>{{ $t('events.alsoRecordNameChange', { name: subjectFullName }) }}</span>
  </label>
  <span class="ep-field-hint">{{ $t('events.alsoRecordNameChangeHint') }}</span>
</div>
<template v-if="showNameChangeCompanion && recordNameChange">
  <div class="ep-field">
    <span class="ep-field-label">{{ $t('persons.givenName') }}</span>
    <input class="ep-input" v-model="nameChangeForm.given_name" type="text" />
  </div>
  <div class="ep-field">
    <span class="ep-field-label">{{ $t('persons.surname') }}</span>
    <input class="ep-input" v-model="nameChangeForm.surname" type="text" />
  </div>
  <div class="ep-field">
    <span class="ep-field-label">{{ $t('names.nameType') }}</span>
    <div class="ep-seg">
      <button type="button" class="ep-seg-opt" :class="{ 'ep-seg-opt--on': nameChangeForm.name_type === 'married' }"
        @click="nameChangeForm.name_type = 'married'">{{ $t('nameTypes.married') }}</button>
      <button type="button" class="ep-seg-opt" :class="{ 'ep-seg-opt--on': nameChangeForm.name_type === 'name_change' }"
        @click="nameChangeForm.name_type = 'name_change'">{{ $t('nameTypes.name_change') }}</button>
    </div>
  </div>
</template>
```

`subjectFullName` is a `computed` that reads from `props.personId`. If EventModal already loads the subject's name for display elsewhere, reuse it; otherwise add a small `loadSubjectName()` `onMounted` that sets a `subjectFullName = ref('')` from `pickDisplayedName(names, events)`.

- [ ] **Step 4: Persist the companion row after the event is saved**

In the `handleSave` (or equivalent) flow, after the successful `events.create` call, add:

```typescript
if (recordNameChange.value && showNameChangeCompanion.value && props.personId) {
  const given = nameChangeForm.given_name.trim();
  const surname = nameChangeForm.surname.trim();
  if (given || surname) {
    try {
      await window.api.persons.addName(props.personId, {
        given_name: given,
        surname: surname || null,
        name_type: nameChangeForm.name_type,
        date_from: form.date_value || null,
        date_to: null,
      });
    } catch (err) {
      console.error('[EventModal] companion name save failed:', err);
      toast.error(t('errors.saveFailed'));
      // event is already saved; do NOT roll back. Surface the partial-failure to the user.
    }
  }
}
```

Match the actual call signature in `EventModal.vue` (it may use a different shape). The point: the name row is created via the existing `addName` IPC, with `date_from = form.date_value`.

- [ ] **Step 5: i18n keys**

Add to `src/renderer/i18n/sv.ts` under `events`:
```typescript
alsoRecordNameChange: 'Registrera även namnändring för {name}',
alsoRecordNameChangeHint: 'Skapar en separat namnpost. Datum hämtas från händelsedatumet.',
```
Add to `src/renderer/i18n/en.ts` under `events`:
```typescript
alsoRecordNameChange: 'Also record a name change for {name}',
alsoRecordNameChangeHint: 'Creates a separate name record. Date comes from the event date.',
```

- [ ] **Step 6: Smoke test**

Run `npm start`. Open Anna Andersson's panel. Click Add event → marriage. Pick a partner. Tick the checkbox. Surname → "Lindberg". Date → 1962-03-15. Save.

Verify:
- Marriage event appears.
- PersonNamesTable shows a `married` row with date_from 1962-03-15.
- Timeline shows both the marriage entry and a "Took the name Anna Lindberg" entry at the same date.
- Edit the marriage event date → 1963-01-01. The married-name row's date_from stays at 1962-03-15. (Confirms cascade-decoupling.)
- Delete the marriage event. The married-name row remains. (Confirms cascade-decoupling on delete.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/modals/EventModal.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(event-modal): opt-in companion name change for couple events"
```

---

### Task 6: Self-review and finishing

- [ ] **Step 1: Run full test + lint**

```bash
npm run lint
npm test -- --run
```
Both must pass with zero errors.

- [ ] **Step 2: Verify no synthetic-event leakage**

Grep the codebase for any path that takes a `TimelineEntry.event` and writes it back. There must be none:
```bash
grep -rn "events.create\|INSERT INTO events" src/ | grep -i "timeline\|name_change"
```
Expected: no hits inside the timeline derivation path.

- [ ] **Step 3: Re-read this plan with fresh eyes**

Open the plan file and verify:
- User goal is user-observable, not mechanism-named.
- Scope deviations are listed with reasons.
- Verification is by smoke check + targeted test, not lint+vitest alone.
- Prime Directive is explicit on the EventModal companion + cascade-decoupling.

- [ ] **Step 4: Tick every checkbox in this plan file as `[x]`.**

- [ ] **Step 5: Archive the plan**

```bash
git mv docs/plans/2026-05-02-name-changes-on-timeline.md docs/plans/archive/
```

- [ ] **Step 6: Bump version**

In `package.json`, bump the minor version (this is a feature). Add an `## Unreleased` line in `CHANGELOG.md`:
```
## Unreleased
- Name changes (married name, name change) now appear on the person timeline at the date the user authored.
- Marriage event modal can optionally record a married name in the same step (off by default).
```

- [ ] **Step 7: Final commit**

```bash
git add docs/plans/archive/2026-05-02-name-changes-on-timeline.md package.json CHANGELOG.md
git commit -m "chore: archive completed name-changes-on-timeline plan"
```

- [ ] **Step 8: Hand to `superpowers:finishing-a-development-branch`** for the worktree merge.

---

## Self-review checklist

- [ ] Spec coverage: every section mapped to a Task
- [ ] No placeholders / TODO markers in steps
- [ ] Type/property names consistent across tasks
- [ ] User goal stated user-observably
- [ ] Scope enumerated; deviations listed with reasons
- [ ] Verification includes a smoke check, not only Vitest
- [ ] Prime Directive risks called out: companion checkbox defaults off; cascade-decoupling explicit; synthetic event is render-time-only
