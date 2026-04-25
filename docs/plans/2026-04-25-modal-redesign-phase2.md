# Modal Redesign — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish what Phase 1 (the original `2026-04-25-modal-redesign.md`) started. The four entity modals shipped (Person, Event, Citation, Source), but the rest of the modal surface still uses the old themed look:

- Old "green" themed cards (`background: var(--surface-bg)`) on raw `BaseModal` with inline `<form>`.
- `AddRelatedPersonModal` still uses inline `<details>` + `EventFormBody` instead of an entity sub-panel.
- Non-entity forms (name, identifier, confirm, merge, citation-edit) never got the new look.
- Inline "Add X" forms are scattered across views (`PlacesView`, `SourcesView`, `RelationshipsView`, `GroupsView`, `ResearchTasksView`, `LinkRulesView`, `SourceDetailView`).

Phase 2 migrates every remaining modal to `BaseSubPanel` so the whole app speaks one visual language.

**Foundation already landed (commit `d8d0b44`):**

- `ENTITY_VISUALS` is the single source of truth for fg / hd / border / icon / labelKey per entity. New entity types: `place`, `relationship`, `task`, `group`, `name`, `identifier`, plus a `neutral` variant for non-entity modals.
- `BaseSubPanel` standalone mode now uses `modal--panel-host` (transparent BaseModal wrapper) and shows the entity-coloured header with icon — identical to sub-panel mode minus the × close button.
- Multi-panel layout: overlay pins the row to the upper-left and lets it scroll horizontally as sub-panels open. Parent panels no longer dim.

**Architecture rule:** every modal in the app uses `BaseSubPanel`. There are no inline `<BaseModal><form>` patterns left. Entity modals pass an `entityType` of the matching entity. Non-entity modals (name, identifier, confirm, merge, edit-citation, import) pass `entity-type="neutral"` (or the dedicated semantic type, e.g. `name` / `identifier`) and provide an explicit `:label`.

**Tech Stack:** Vue 3 + TypeScript, `window.api.*` IPC bridge. See `docs/IPC_REFERENCE.md` for the complete surface.

---

## Tasks at a glance

| # | Scope | New component(s) | Replaces |
|---|---|---|---|
| 1 | i18n entity labels | — | adds `*.entity` keys |
| 2 | Place entity modal | `PlaceModal.vue` | inline form in `PlacesView` |
| 3 | Relationship entity modal | `RelationshipModal.vue` | inline form in `RelationshipsView` |
| 4 | Group entity modal | `GroupModal.vue` | inline form in `GroupsView` |
| 5 | ResearchTask entity modal | `ResearchTaskModal.vue` | inline form in `ResearchTasksView` + `AddResearchTaskModal.vue` |
| 6 | Source standalone path | reuse `SourceModal.vue` (add standalone mode) | inline form in `SourcesView` |
| 7 | Citation edit support | `CitationModal.vue` gains `editingCitation` prop | `CitationEditModal.vue` (delete) |
| 8 | Person name modal | `PersonNameModal.vue` | `PersonNameFormModal.vue` |
| 9 | Person identifier modal | `PersonIdentifierModal.vue` | inline modal inside `PersonIdentifiersSection.vue` |
| 10 | Add-related person flow | extend `PersonModal.vue` with add-related mode + relationship inference | `AddRelatedPersonModal.vue` (delete), `AddPersonModal.vue` (delete) |
| 11 | LinkRule modal | `LinkRuleModal.vue` | two raw `modal-overlay` blocks in `LinkRulesView` |
| 12 | MergePersons modal | restyle `MergePersonsModal.vue` to `BaseSubPanel` (`entity-type="person"`, neutral footer) | itself |
| 13 | ConfirmModal restyle | restyle `ConfirmModal.vue` to `BaseSubPanel` (`entity-type="neutral"`) | itself |
| 14 | Import section dialogs | restyle the five `import/*Section.vue` to `BaseSubPanel` (`entity-type="neutral"`) | themselves |
| 15 | Citation-add path in SourceDetailView | drop the manual `<BaseModal>` wrapper; use `<CitationModal mode="standalone">` | itself |
| 16 | Final cleanup | delete `EventForm`, `EventFormBody`, `CitationForm`, `AddPersonModal`, `AddRelatedPersonModal`, `CitationEditModal`, `PersonNameFormModal`, `AddResearchTaskModal` | all the old shells |
| 17 | Smoke test + version bump | — | — |

Each task ends with `npm run lint && npm test`, a brief manual smoke test, and a separate commit.

---

## Conventions for every task in this plan

- **Component template skeleton.** Use `BaseSubPanel` with `mode="standalone"` for top-level modals and `mode="subpanel"` for sub-panels embedded in another modal:

  ```vue
  <BaseSubPanel
    entity-type="<type>"
    :title="displayTitle"
    :mode="mode"
    @cancel="$emit('cancel')"
    @close="$emit('close')"
    @save="handleSave"
  >
    <div class="ep-fields"> … </div>
    <!-- optional sections (events/sources/etc.) -->
    <template #subpanels> … </template>
  </BaseSubPanel>
  ```

- **Form fields.** Use the `.ep-field` / `.ep-field-label` / `.ep-input` / `.ep-textarea` / `.ep-seg` classes already defined in `shared.css`. **No** `<form>` element, **no** `.modal-actions`, **no** `<h3>` heading inside the slot — `BaseSubPanel` owns the chrome.
- **Submit on Enter.** Wire a `@keydown.enter.prevent="handleSave"` on the panel root or first text input where applicable.
- **i18n.** Every label resolves through `useI18n()`. New keys go into both `en.ts` and `sv.ts`.
- **Toast on save failure** via `useToast`. No silent catches.
- **Replacement edits in views** must drop the entire old `<BaseModal>…</BaseModal>` block and the now-unused state (`showAddX`, the `form` reactive, the submit handler) — no commented-out leftovers.

---

### Task 1: Add `*.entity` i18n keys

**Files:**
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

`BaseSubPanel` resolves the small-caps header label via `ENTITY_VISUALS[entityType].labelKey`. Several keys may already exist from Phase 1; add the missing ones.

- [ ] **Audit existing keys** — run:

  ```bash
  for k in persons.entity events.entity sources.entity citations.entity places.entity relationships.entity researchTasks.entity groups.entity persons.nameEntity persons.identifierEntity; do
    echo "== $k =="
    grep -n "$k" src/renderer/i18n/en.ts src/renderer/i18n/sv.ts | head
  done
  ```

- [ ] **Add missing keys** to both `en.ts` and `sv.ts`. English values:

  ```
  persons.entity         = 'Person'
  persons.nameEntity     = 'Name'
  persons.identifierEntity = 'Identifier'
  events.entity          = 'Event'
  sources.entity         = 'Source'
  citations.entity       = 'Citation'
  places.entity          = 'Place'
  relationships.entity   = 'Relationship'
  researchTasks.entity   = 'Research task'
  groups.entity          = 'Group'
  ```

  Swedish values: `Person`, `Namn`, `Identifierare`, `Händelse`, `Källa`, `Citat`, `Plats`, `Relation`, `Forskningsuppgift`, `Grupp`.

- [ ] Run `npm run lint && npm test`.
- [ ] Commit: `feat(i18n): add *.entity labels for modal headers`.

---

### Task 2: PlaceModal.vue

**Files:**
- Create: `src/renderer/components/modals/PlaceModal.vue`
- Modify: `src/renderer/views/PlacesView.vue`

Fields: name, type (dropdown), parent place (`PlacePicker`), latitude, longitude, notes. No section in MVP — the panel for events at a place lives in `PlacePanel`, not in the create modal.

- [ ] **Create `PlaceModal.vue`** using the standard skeleton, `entity-type="place"`. Submits via `window.api.places.create` (or `update` when `editingPlace` is passed). `props.parentPlaceId` pre-fills the parent picker.
- [ ] **Replace inline form in `PlacesView.vue`** — delete the `<BaseModal>…</BaseModal>` block, `addPlace()` handler, and `form` ref. Render `<PlaceModal v-if="showAddForm" mode="standalone" @cancel="showAddForm = false" @saved="onSaved" />`.
- [ ] Lint, test, smoke test (`npm start`, click "+ Place", verify teal header + 📍 icon).
- [ ] Commit: `feat(modals): add PlaceModal, replace inline form in PlacesView`.

---

### Task 3: RelationshipModal.vue

**Files:**
- Create: `src/renderer/components/modals/RelationshipModal.vue`
- Modify: `src/renderer/views/RelationshipsView.vue`

Fields: person 1 + person 2 (`PersonPicker`), type (segmented: Couple / Parent–Child / Sibling / Godparent / Other), subtype (conditional dropdown). Section: 📅 Events (sub-panel via `EventModal`).

- [ ] **Create `RelationshipModal.vue`** with `entity-type="relationship"`. Reuse the Events-section pattern from `PersonModal.vue` (search bar that opens an `EventModal` sub-panel with `relationshipId`).
- [ ] **Replace inline form in `RelationshipsView.vue`**.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): add RelationshipModal, replace inline form in RelationshipsView`.

---

### Task 4: GroupModal.vue

**Files:**
- Create: `src/renderer/components/modals/GroupModal.vue`
- Modify: `src/renderer/views/GroupsView.vue`

Fields: name, notes. Section: 👤 Members — search bar opens `PersonModal` sub-panel for "+ Create new person" or links an existing person via dropdown.

- [ ] **Create `GroupModal.vue`** with `entity-type="group"`. Member-search uses `window.api.persons.search`; selection calls `window.api.groups.addMember`; "+ Create new person" opens `<PersonModal mode="subpanel">`.
- [ ] **Replace inline form in `GroupsView.vue`**.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): add GroupModal with members section`.

---

### Task 5: ResearchTaskModal.vue

**Files:**
- Create: `src/renderer/components/modals/ResearchTaskModal.vue`
- Modify: `src/renderer/views/ResearchTasksView.vue`
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/views/PersonsListTab.vue` (if present)
- Delete: `src/renderer/components/AddResearchTaskModal.vue`

Fields: task (textarea), person (`PersonPicker`, optional), priority (segmented Low/Medium/High), status (segmented Open/In Progress/Done/Stopped), notes, result (shown when status is Done/Stopped).

- [ ] **Create `ResearchTaskModal.vue`** with `entity-type="task"`. Supports both add and edit (when `editingTask` prop is passed).
- [ ] **Replace inline form in `ResearchTasksView.vue`** and the `AddResearchTaskModal` import in `PersonDetailView` / `PersonsListTab`.
- [ ] Delete `AddResearchTaskModal.vue` once unreferenced.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): add ResearchTaskModal, drop AddResearchTaskModal`.

---

### Task 6: SourceModal standalone mode

**Files:**
- Modify: `src/renderer/components/modals/SourceModal.vue`
- Modify: `src/renderer/views/SourcesView.vue`

`SourceModal` was sub-panel only in Phase 1. Add standalone support so `SourcesView` can use it. When standalone, also add a 📖 Citations read-only section.

- [ ] **Add `mode` prop** to `SourceModal.vue` (default `'subpanel'` for backwards compatibility).
- [ ] **Add Citations section** that renders only when `mode === 'standalone'` and a saved source exists. Read-only list, click row → navigate to `/sources/:id`.
- [ ] **Replace inline form in `SourcesView.vue`** with `<SourceModal v-if="showAddForm" mode="standalone" @cancel … @saved …/>`.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): SourceModal standalone mode, replace inline form in SourcesView`.

---

### Task 7: Citation edit support → drop CitationEditModal

**Files:**
- Modify: `src/renderer/components/modals/CitationModal.vue`
- Modify: `src/renderer/views/SourceDetailView.vue`
- Delete: `src/renderer/components/CitationEditModal.vue`

Phase 1 punted on edit. Now add it.

- [ ] **Add `editingCitation` prop** to `CitationModal.vue`. When set, prefill all fields and call `window.api.citations.update` on save instead of `create`.
- [ ] **Replace `CitationEditModal` usage in `SourceDetailView.vue`** with `<CitationModal mode="standalone" :editing-citation="editingCitation" :source-id="…" :source-title="…" />`.
- [ ] Delete `CitationEditModal.vue`.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): CitationModal edit mode, drop CitationEditModal`.

---

### Task 8: PersonNameModal.vue

**Files:**
- Create: `src/renderer/components/modals/PersonNameModal.vue`
- Modify: `src/renderer/views/PersonDetailView.vue`
- Delete: `src/renderer/components/PersonNameFormModal.vue`

Fields: given name, surname, name_type (segmented: birth/married/alias/aka), preferred (toggle), date_from / date_to, qualifier, prefix/suffix (in a "More" details disclosure).

- [ ] **Create `PersonNameModal.vue`** with `entity-type="name"` (uses neutral grey header + 🏷️ icon). Add and edit modes (`editingName` prop).
- [ ] **Replace `PersonNameFormModal` usage in `PersonDetailView.vue`**.
- [ ] Delete `PersonNameFormModal.vue`.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): add PersonNameModal, drop PersonNameFormModal`.

---

### Task 9: PersonIdentifierModal.vue

**Files:**
- Create: `src/renderer/components/modals/PersonIdentifierModal.vue`
- Modify: `src/renderer/components/PersonIdentifiersSection.vue`

Fields: identifier_type (dropdown), identifier_value (input).

- [ ] **Create `PersonIdentifierModal.vue`** with `entity-type="identifier"`.
- [ ] **Replace inline `<BaseModal>` block in `PersonIdentifiersSection.vue`** with the new modal.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): add PersonIdentifierModal, drop inline form`.

---

### Task 10: Add-related-person flow → fold into PersonModal

**Files:**
- Modify: `src/renderer/components/modals/PersonModal.vue`
- Modify: every caller of `AddRelatedPersonModal` (`PersonPanel.vue`, `HourglassChart.vue`, `PedigreeChart.vue`, `DescendantChart.vue`)
- Delete: `src/renderer/components/AddRelatedPersonModal.vue`
- Delete: `src/renderer/components/AddPersonModal.vue` (orphaned in Phase 1, still imported by `AddRelatedPersonModal`; will become orphaned for real)

Folds the "Add father / mother / spouse / child" flow into `PersonModal`. Add an `addRelatedTo` prop:

```ts
addRelatedTo?: {
  personId: string;
  mode: 'father' | 'mother' | 'spouse' | 'child';
  personSex?: 'M' | 'F' | 'U';
  personSurname?: string;
};
```

When set, `PersonModal` infers sex (father→M, mother→F, spouse→opposite of `personSex`), pre-fills surname for child mode, and on save creates the person + the matching relationship + an optional event in one go via `window.api.persons.createWithEvent` and `window.api.relationships.create`. Adds a "Use existing person" toggle that switches the form to a `PersonPicker` instead of name fields.

- [ ] **Extend `PersonModal.vue`** with `addRelatedTo` prop + entry-mode toggle.
- [ ] **Update each chart and `PersonPanel.vue`** to use `<PersonModal :add-related-to="…">` instead of `<AddRelatedPersonModal>`.
- [ ] Delete `AddRelatedPersonModal.vue` and `AddPersonModal.vue`.
- [ ] Lint, test, smoke test (open hourglass → click outline → verify father/mother flow still works).
- [ ] Commit: `feat(modals): fold add-related-person into PersonModal; drop AddRelatedPersonModal + AddPersonModal`.

---

### Task 11: LinkRuleModal.vue

**Files:**
- Create: `src/renderer/components/modals/LinkRuleModal.vue`
- Modify: `src/renderer/views/LinkRulesView.vue`

`LinkRulesView` currently has two raw `class="modal-overlay"` blocks (add + view). Both become a single `LinkRuleModal` with a `mode: 'add' | 'view'` prop (or `editingRule` for view-mode).

- [ ] **Create `LinkRuleModal.vue`** with `entity-type="neutral"` and an explicit `:label="$t('linkRules.entity')"`.
- [ ] **Replace both raw modal blocks in `LinkRulesView.vue`**.
- [ ] Lint, test, smoke test.
- [ ] Commit: `feat(modals): add LinkRuleModal, drop raw modal-overlay blocks`.

---

### Task 12: Restyle MergePersonsModal

**Files:**
- Modify: `src/renderer/components/MergePersonsModal.vue`

Drops the raw `BaseModal` + `<form>` + `<h3>` chrome and uses `BaseSubPanel` with `entity-type="person"`. Body content (the merge target / source pickers and field-level merge selectors) stays as-is, just rewrapped.

- [ ] **Refactor template** to `BaseSubPanel` skeleton.
- [ ] **Strip duplicated heading and `.modal-actions`**.
- [ ] Lint, test, smoke test.
- [ ] Commit: `refactor(modals): MergePersonsModal uses BaseSubPanel`.

---

### Task 13: Restyle ConfirmModal

**Files:**
- Modify: `src/renderer/components/ConfirmModal.vue`

Wraps the existing confirm/cancel logic in `BaseSubPanel` with `entity-type="neutral"`, optional `:label="$t('common.confirm')"`, and ⚠️ icon (override via prop for delete vs. info confirms).

- [ ] **Add `icon` and `tone` props** (`tone: 'info' | 'warning' | 'danger'`) — `tone="danger"` swaps the save button colour to red.
- [ ] **Replace template** with `BaseSubPanel` skeleton.
- [ ] **Verify `GazetteersView.vue`** still renders correctly.
- [ ] Lint, test, smoke test.
- [ ] Commit: `refactor(modals): ConfirmModal uses BaseSubPanel`.

---

### Task 14: Restyle import section dialogs

**Files:**
- Modify: `src/renderer/components/import/ArchiveSection.vue`
- Modify: `src/renderer/components/import/GedcomImportSection.vue`
- Modify: `src/renderer/components/import/GedcomExportSection.vue`
- Modify: `src/renderer/components/import/GenneyImportSection.vue`
- Modify: `src/renderer/components/import/HolgerImportSection.vue`

Each section currently uses `<BaseModal>` for status / progress / result dialogs.

- [ ] For each: replace `<BaseModal>` with `<BaseSubPanel entity-type="neutral" :label="…" :title="…" mode="standalone">`. Keep the body content (progress bars, file pickers, result tables) as-is.
- [ ] Confirm-modal-style "Close" button replaces "Save" via `:save-label` and a dedicated emit. (If the dialog truly has no save action, render the body without a footer save — extend `BaseSubPanel` with a `hideSave` prop in this task.)
- [ ] Lint, test, smoke test (run a GEDCOM import).
- [ ] Commit: `refactor(modals): import sections use BaseSubPanel`.

---

### Task 15: Tidy citation-add path in SourceDetailView

**Files:**
- Modify: `src/renderer/views/SourceDetailView.vue`

Phase 1 left a manual `<BaseModal>` wrapper around `<CitationModal>` because `CitationModal` was sub-panel only.

- [ ] **Drop the `<BaseModal>` wrapper** — render `<CitationModal mode="standalone" :source-id="…" :source-title="…" />` directly.
- [ ] Remove the `BaseModal` import if it becomes unused.
- [ ] Lint, test, smoke test.
- [ ] Commit: `refactor(views): SourceDetailView uses CitationModal standalone`.

---

### Task 16: Final cleanup — delete orphaned files

**Files:**
- Delete: `src/renderer/components/EventForm.vue`
- Delete: `src/renderer/components/EventFormBody.vue`
- Delete: `src/renderer/components/CitationForm.vue`

These were supposed to die in Phase 1 Task 11 but were kept "for follow-on" because `AddRelatedPersonModal` still imported them and `EventForm` was used by `PlacePanel` / `VisualizationView`.

- [ ] **Find all remaining references**:

  ```bash
  grep -rln "EventForm\|EventFormBody\|CitationForm" src/renderer --include="*.vue" --include="*.ts" \
    | grep -v "/modals/"
  ```

  Update each caller to use `EventModal` / `CitationModal` directly (or remove the import if it became unused after Tasks 5–10).
- [ ] **Delete** the three orphaned files.
- [ ] **Sanity grep**:

  ```bash
  grep -rn "EventForm\b\|EventFormBody\b\|CitationForm\b\|AddPersonModal\|AddRelatedPersonModal\|CitationEditModal\|AddResearchTaskModal\|PersonNameFormModal" src/renderer
  ```

  Must return zero results.
- [ ] Lint, test, smoke test.
- [ ] Commit: `chore(modals): delete EventForm/EventFormBody/CitationForm`.

---

### Task 17: Smoke test + version bump

**Files:**
- Modify: `package.json` (minor bump)
- Modify: `CHANGELOG.md`
- Move: `docs/plans/2026-04-25-modal-redesign*.md` → `docs/plans/archive/`
- Modify: `docs/PLAN.md` (remove the modal-redesign milestone if listed)

End-to-end smoke checklist (run with `npm start` after Xvfb if in dev container):

1. **Persons view** → "+ Person" → indigo header, 👤 icon, name + sex fields, Events + Relationships sections; create the person.
2. **Person detail** → add a name → 🏷️ neutral header; add an identifier → 🪪 neutral header.
3. **Person panel on visualization** → open chart → click an outline placeholder → "Add father" → indigo header with mode-aware title.
4. **Places view** → "+ Place" → teal header, 📍 icon. Edit an existing place → same modal in edit mode.
5. **Relationships view** → "+ Relationship" → slate header, 🔗 icon, Events section. Add an event from inside the modal → orange `EventModal` slides in to the right.
6. **Sources view** → "+ Source" → purple header, 📚 icon, Citations section visible (read-only) only after first save.
7. **Source detail** → add citation → green header, 📖 icon. Edit citation → same modal pre-filled.
8. **Research tasks view** → "+ Task" → amber header, 📋 icon. Open from a person's detail page → person pre-filled.
9. **Groups view** → "+ Group" → sky-blue header, 👥 icon, Members section. Add an existing person → row appears. "+ Create new person" → `PersonModal` slides in to the right.
10. **Settings → Link rules** → "+ Add rule" → neutral header.
11. **Settings → GEDCOM import** → start an import, observe progress dialog uses neutral header.
12. **Quality view** → click an "Ignore" delete → `ConfirmModal` shows neutral header with ⚠️ icon and red save button.
13. **Multi-panel chain**: from a Person modal, open Events section → "+ Add Event" → from inside Event modal, type a source name → pick result → CitationModal opens; verify all three panels are visible side-by-side, none dimmed, the BaseModal overlay covers the screen, and Esc closes the focused panel.
14. **Theme check**: switch to Forest theme → modals stay white-bodied with their entity-coloured headers (no green surface bleed). Repeat for Nordic and Twilight.
15. **Dark / high-contrast**: switch to dark mode → modals stay readable; high-contrast → run `npx vitest run tests/unit/wcagContrast.test.ts` (must pass).

- [ ] Walk through every item.
- [ ] Bump `package.json` version to next minor (current `0.142.x` → `0.143.0`).
- [ ] Add CHANGELOG entry under `## Unreleased` or `## v0.143.0`:

  ```
  - feat: modal redesign phase 2 — every modal now uses BaseSubPanel with the
    entity-coloured header, icon, and side-by-side sub-panel layout. New
    PlaceModal / RelationshipModal / GroupModal / ResearchTaskModal /
    PersonNameModal / PersonIdentifierModal / LinkRuleModal replace inline
    forms across the app. AddRelatedPersonModal, AddPersonModal,
    AddResearchTaskModal, CitationEditModal, PersonNameFormModal, EventForm,
    EventFormBody and CitationForm are gone.
  ```

- [ ] Move both plan files into `docs/plans/archive/`.
- [ ] Lint + full test run + smoke test.
- [ ] Commit: `feat(v0.143.0): modal redesign phase 2 — universal entity-panel modals`.

---

## Open questions / deferred

- **Section "Open ›"** still does nothing on click. Future enhancement: navigate to the entity's standalone view, or expand/collapse the section.
- **Multi-participant events** (witness, godparent, officiant, etc.) — `EventModal` MVP still only shows the owning person. Future task: add a Participants section.
- **Place-as-sub-panel** — when typing a new place name in `EventModal.Place` we still hand off to `PlacePicker`'s inline create. A future task can promote that to a `PlaceModal` sub-panel.
- **`editingTask` for ResearchTaskModal vs. existing inline-edit row in `ResearchTasksView`** — the inline-edit pattern stays for quick edits; the modal is for creates and deeper edits. Decide per row whether to keep both paths or consolidate.
