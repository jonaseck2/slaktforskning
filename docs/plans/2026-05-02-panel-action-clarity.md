# Right-Panel Action Clarity & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (with `subagent-handoff` templates) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## User goal

Across every right-side panel section in Släktforskning, the icon next to a row tells me at a glance whether clicking it will **destroy data forever** or just **unlink it from this entity** — and the tooltip backs it up. The two scariest entry points — "Add father / mother / spouse / son / daughter" and "Add relationship" — clearly offer both *find existing person* and *create new* without making me click the wrong one and silently produce a duplicate. The Identifiers section disappears from PersonPanel (it was only ever round-trip plumbing for import/export). Every panel uses real design tokens, never invented names or hex strings. Clicking a relationship row opens its modal, just like clicking a name or event row does. And the panel section ordering is consistent across panels.

## Scope

This plan touches **every** instance of the patterns it changes. No "out of scope" components.

### A. Icon semantics — all 11 row-icon sites in panel components

`✕` will be **eliminated entirely from row actions**. It is replaced by:

- 🗑 **Trash icon** = "destroy this entity". Already in use in PersonPanel Danger zone (lines 175–179).
- 🔗⃥ **Unlink icon** (link-off / broken-chain) = "remove this connection; both entities preserved".

Full enumeration of `✕` row-icon sites in `src/renderer/components/`:

| File:line | API call | New icon |
|---|---|---|
| `PersonNamesTable.vue:55` | `persons.deleteName` | trash |
| `EventList.vue:44` | `events.delete` | trash |
| `ResearchTasksTable.vue:45` | `researchTasks.delete` | trash |
| `SourcePanel.vue:144` | `citations.delete` | trash |
| `RelationshipPanel.vue:157` | `citations.delete` | trash |
| `RelationshipsList.vue:65` | (relationship row) | unlink |
| `GroupsTable.vue:32` | `groups.removeLinkByEntity` | unlink |
| `PersonMediaSection.vue:40` | `media.removeLink` | unlink |
| `LinkedMediaSection.vue:27` | (linked media) | unlink |
| `LinkedPlacesSection.vue:29` | (linked place) | unlink |
| `LinkedPersonsSection.vue:44` | (linked person) | unlink |

### Scope deviations

- **`QualityIssuesTable.vue:51`** uses `✕` for `toggleIgnore` — a third semantic ("dismiss this issue from the list, no data destroyed"). This plan **does not** touch it. Reason: it's neither destroy nor unlink; conflating it into either pattern would mislead. A follow-up plan should give it its own icon (eye-off) and tooltip ("Ignore this issue"). Documented as a known deviation.
- **`EventModal.vue:156`** uses `✕` for *modal close*. Universal browser-app convention; not a row action. Out of scope.

### B. Add-relative / Add-relationship UI clarity

`PersonModal` already supports both create-new and link-existing paths (`entryMode = 'new' | 'existing'`, lines 11–29 of `PersonModal.vue`). The toggle exists but is too easy to miss. This plan changes the modal's UX so the choice is clear:

- Reorder the segmented control: **Existing person first**, New person second
- When the database has ≥1 other person, default `entryMode` to `'existing'` (current default is `'new'`)
- Add helper text above the toggle: "Already in your tree? Find them. Otherwise, add a new person."
- New i18n keys in both `sv.ts` and `en.ts`

### C. Identifiers section removal

PersonPanel's "External identifiers" section is a UI surface for round-trip-only data (FamilySearch ID, Geni ID, etc.). Users don't manage these manually; they're populated by GEDCOM/Holger/Genney import and exported back. The section is removed from the UI; the data layer (`person_identifiers` table, `persons.addIdentifier`/`deleteIdentifier`/`getIdentifiers` API, GEDCOM import/export) is untouched.

Full removal scope:
- `src/renderer/components/PersonIdentifiersSection.vue` — delete file
- `src/renderer/components/PersonPanel.vue` — remove the section block (lines 104–110), the section default-collapsed registration (line 470), the section in the order array (line 482), the i18n key references, and any `import` of the deleted file
- `src/renderer/i18n/sv.ts` and `en.ts` — remove `personDetail.identifiers` UI strings (keep API-layer error strings if any are reused)
- `docs/UX_INVENTORY.md` — remove the Identifiers section row, add a note explaining identifiers are round-trip-only
- A short doc note in either `docs/DATA_MODEL.md` or `CLAUDE.md` skill mentions, documenting "external identifiers exist on persons, populated/consumed by import/export only — no UI surface"

### D. Token cleanup

Three files use invented or hardcoded colors. Replace with existing tokens from `src/renderer/styles/tokens.css`:

| File:line | Current | Fix |
|---|---|---|
| `PersonNamesTable.vue:263–268` | `--color-bg-muted`, `--color-text-muted` (do not exist) | `--surface-bg`, `--text-muted` |
| `ResearchTasksTable.vue:132–152` | hardcoded hex (`#dbeafe`, `#1d4ed8`, `#fef3c7`, `#92400e`, `#d1fae5`, `#065f46`, `#f3f4f6`, `#6b7280`, `#9ca3af`, `#60a5fa`, `#f59e0b`, `#ef4444`) for status + priority badges | semantic tokens: `--info-bg/text`, `--warning-bg/text`, `--success-bg/text`, `--surface-hover`/`--text-muted`, `--error-bg/text` |
| `GroupsTable.vue:60` | `color: #777` | `var(--text-muted)` |

PersonIdentifiersSection's broken tokens are moot — the file is deleted in Section C.

### E. Relation-row click → opens RelationshipModal

`RelationshipsList.vue:65` currently has only a `✕` action. Add a row click that opens `RelationshipModal` in edit mode for that relationship — matching how Names rows open `PersonNameModal` and Events rows open `EventModal`.

### F. Section-ordering consistency: Quality is always last

`PlacePanel.vue:172–183` currently has `Quality` followed by `Address` and `Hierarchy`. Renderer rule says Quality goes last. Reorder so the section sequence is: Place fields → Notes → Citations → Persons → Address → Hierarchy → Media → Quality → (Danger zone if any).

Audit the other panels (`SourcePanel`, `RelationshipPanel`, `GroupPanel`, `ResearchTaskPanel`, `MediaPanel`, `WebsitePanel`, `ReportPanel`) for the same violation and fix any found.

### G. P2 polish (user-approved)

- `PersonPanel.vue:474` — change `names: false` to `names: true` (Names section default-expanded)
- `PersonDetailsSection.vue:13–15` — add `:title="$t('persons.livingTooltip')"` on the living/deceased chip
- `PersonNamesTable.vue:51` — show a *disabled* trash icon on birth-name rows with a tooltip "`persons.birthNameNotDeletable`" instead of hiding the icon entirely
- `PersonChecksSection.vue:62` — investigate the 1.5-second hand-rolled debounce. If `useEntityData` already debounces, remove. If there's a real reason (slow check computation), document it with a code comment.

### H. UX_INVENTORY.md update

Fill in the TBD entries for PersonPanel (Header, Person, Names, Timeline, Life Map, Media, Media Timeline, Quality, Danger zone). Document the new icon convention in a "Cross-cutting conventions" section. Drop the Identifiers row.

## Verification

User-observable. None of these is "vitest passes" alone.

1. **Icon semantics audit (visual + smoke):**
   - Open `npm start`. Visit `/persons` and select any person. For each section row with an icon, hover: tooltip says "Delete X permanently" (trash) or "Unlink X (X is preserved)" (unlink). Click the trash icons in turn — confirm modal copy says delete and the row vanishes from DB. Click the unlink icons — confirm modal says unlink, row vanishes from this person but the linked entity still exists at its own route.
   - Repeat in `/sources`, `/relationships` for the citation rows (trash, destroys citation).

2. **Add-relative UX:**
   - Open PersonPanel, click "+ Add father". Modal opens with **Existing person** as the default entry mode and the helper text visible above the toggle. Type a name that exists in the DB → the person matches in the picker → confirm → the relationship is created without producing a duplicate person.
   - Click "+ Add father" again on a fresh person, switch to **New person**, type a unique name → a new person is created and linked.
   - **Smoke check:** verify by counting `SELECT COUNT(*) FROM persons` before and after each click — existing-person path increments by 0, new-person path increments by 1.

3. **Identifiers removal:**
   - PersonPanel does not show an "External identifiers" section.
   - GEDCOM round-trip still works: import a `.ged` with FSID/Geni IDs, then export it; the IDs survive.

4. **Tokens:**
   - `npx vitest run tests/unit/wcag*` passes (baseline + post-change).
   - In dark and high-contrast modes, the priority/status badges in research tasks render readable (manual visual check across all three themes).

5. **Relation row click:**
   - In PersonPanel relations section, clicking any relationship row opens `RelationshipModal` in edit mode. Editing the subtype and saving updates the row without a navigation.

6. **Quality-last consistency:**
   - In every paneled view, scroll the right panel — Quality is the last section before Danger zone (or the last section, period, if no Danger zone).

7. **UX_INVENTORY.md:**
   - No TBD entries for PersonPanel surfaces.
   - The new icon convention is documented in a Cross-cutting conventions section.

## Failure modes / RCA reference

This plan addresses cross-cutting findings #1 and #2 in `docs/UX_INVENTORY.md` and the audit performed in this session. Two prior failure modes to avoid:

- **The panel-composables refactor (v0.190.0–v0.190.2) shipped half-consistent.** Cause: implicit scope ("the 6 panels"). Mitigation: Section A enumerates all 11 icon sites by file:line; Section F audits all 9 panels. Anything found mid-implementation that wasn't enumerated here means the plan is wrong — pause, edit the plan.
- **Inferred persistence (Prime Directive).** This plan changes UI presentation only — it does not write any new derived value to the DB. The `person_identifiers` table is untouched in Section C. Section A and B do not change any data persistence path.

---

## Tasks

### Task 1: Create shared icon components + add i18n keys

**Files:**
- Create: `src/renderer/components/ui/IconTrash.vue`
- Create: `src/renderer/components/ui/IconUnlink.vue`
- Modify: `src/renderer/i18n/sv.ts` (add `common.unlink`, `common.unlinkTooltip`, `common.deleteTooltip`)
- Modify: `src/renderer/i18n/en.ts` (mirror)

- [ ] **Step 1: Create IconTrash.vue (extract the SVG already used in PersonPanel Danger zone)**

```vue
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h1v12a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h1a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9zm1 4h4v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7zm-2 0v12a3 3 0 0 0 .17 1H8a1 1 0 0 1-1-1V7h1zm8 0h1v12a1 1 0 0 1-1 1h-.17A3 3 0 0 0 16 19V7z"/>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ size?: number | string }>();
</script>
```

- [ ] **Step 2: Create IconUnlink.vue (link-off SVG)**

```vue
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
    <path d="M15 7h2a5 5 0 0 1 4.546 7.071"/>
    <line x1="3" y1="3" x2="21" y2="21"/>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ size?: number | string }>();
</script>
```

- [ ] **Step 3: Add i18n keys (en.ts)**

In `src/renderer/i18n/en.ts`, find the `common:` namespace block and add:

```ts
unlink: 'Unlink',
unlinkTooltip: 'Unlink — both entities are kept',
deleteTooltip: 'Delete permanently',
```

- [ ] **Step 4: Add i18n keys (sv.ts)**

Mirror in `src/renderer/i18n/sv.ts`:

```ts
unlink: 'Koppla bort',
unlinkTooltip: 'Koppla bort — båda objekten finns kvar',
deleteTooltip: 'Radera permanent',
```

- [ ] **Step 5: Verify the icon components render**

Run: `npm run lint`
Expected: 0 errors.

Run: `npx vitest run` (existing tests should pass — these new files have no consumers yet).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ui/IconTrash.vue src/renderer/components/ui/IconUnlink.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat(ui): add IconTrash and IconUnlink + unlink/delete i18n keys"
```

---

### Task 2: Swap destroy ✕ → trash icon (5 sites)

**Files:**
- Modify: `src/renderer/components/PersonNamesTable.vue:55`
- Modify: `src/renderer/components/EventList.vue:44`
- Modify: `src/renderer/components/ResearchTasksTable.vue:45`
- Modify: `src/renderer/components/SourcePanel.vue:144`
- Modify: `src/renderer/components/RelationshipPanel.vue:157`

- [ ] **Step 1: Replace ✕ in PersonNamesTable**

Add to `<script setup>`:
```ts
import IconTrash from './ui/IconTrash.vue';
```

Replace the line:
```vue
>✕</button>
```
with:
```vue
:title="$t('common.deleteTooltip')"
><IconTrash :size="14" /></button>
```

(Keep the existing `@click`, `aria-label`, and class. The button's wrapping element stays.)

- [ ] **Step 2: Replace ✕ in EventList**

Same pattern: import `IconTrash`, replace `>✕</button>` with `:title="$t('common.deleteTooltip')"><IconTrash :size="14" /></button>`.

- [ ] **Step 3: Replace ✕ in ResearchTasksTable**

Same pattern.

- [ ] **Step 4: Replace ✕ in SourcePanel (citation row)**

The row uses `AppButton` not raw `<button>`. Replace the slot text:

```vue
<AppButton variant="ghost" size="sm"
           :aria-label="$t('common.delete')"
           :title="$t('common.deleteTooltip')"
           @click.stop="removeCitation(cit.id)">
  <IconTrash :size="14" />
</AppButton>
```

(Note: also update the `aria-label` from `common.remove` → `common.delete` since this destroys the citation.)

Add the import.

- [ ] **Step 5: Replace ✕ in RelationshipPanel (citation row)**

Same as SourcePanel; this is a citation destroy. Update `aria-label` to `common.delete` and add `:title="$t('common.deleteTooltip')"`.

- [ ] **Step 6: Smoke-check the running app**

```bash
npm start
```

Open `/persons`, select any person with names. Hover the trash icon next to a non-birth name → tooltip says "Delete permanently". Click → confirm modal appears → confirm → name is removed from DB.

Repeat for an event, a research task, a citation in `/sources`, a citation in `/relationships`.

- [ ] **Step 7: Lint + tests**

```bash
npm run lint
npx vitest run tests/components/
```

Expected: 0 errors. Component tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/PersonNamesTable.vue src/renderer/components/EventList.vue src/renderer/components/ResearchTasksTable.vue src/renderer/components/SourcePanel.vue src/renderer/components/RelationshipPanel.vue
git commit -m "feat(panels): trash icon for entity-destroy row actions (names, events, tasks, citations)"
```

---

### Task 3: Swap unlink ✕ → unlink icon (6 sites)

**Files:**
- Modify: `src/renderer/components/RelationshipsList.vue:65`
- Modify: `src/renderer/components/GroupsTable.vue:32`
- Modify: `src/renderer/components/PersonMediaSection.vue:40`
- Modify: `src/renderer/components/LinkedMediaSection.vue:27`
- Modify: `src/renderer/components/LinkedPlacesSection.vue:29`
- Modify: `src/renderer/components/LinkedPersonsSection.vue:44`

- [ ] **Step 1: Replace ✕ in RelationshipsList**

Add `import IconUnlink from './ui/IconUnlink.vue';` to script setup.

Replace `>✕</button>` with:
```vue
:title="$t('common.unlinkTooltip')"
><IconUnlink :size="14" /></button>
```

The existing `aria-label` (likely `common.remove`) should change to `common.unlink`.

- [ ] **Step 2: Replace ✕ in GroupsTable**

Same pattern. `aria-label="$t('common.unlink')"`, `:title="$t('common.unlinkTooltip')"`, body `<IconUnlink :size="14" />`.

- [ ] **Step 3: Replace ✕ in PersonMediaSection**

Same pattern.

- [ ] **Step 4: Replace ✕ in LinkedMediaSection (uses AppButton)**

```vue
<AppButton variant="ghost" size="sm"
           :aria-label="$t('common.unlink')"
           :title="$t('common.unlinkTooltip')"
           @click.stop="...">
  <IconUnlink :size="14" />
</AppButton>
```

- [ ] **Step 5: Replace ✕ in LinkedPlacesSection (uses AppButton)**

Same as Step 4.

- [ ] **Step 6: Replace ✕ in LinkedPersonsSection (uses AppButton)**

Same as Step 4.

- [ ] **Step 7: Smoke-check the running app**

In each section listed above, hover the icon → tooltip says "Unlink — both entities are kept". Click → confirm modal mentions both entities are preserved → confirm → row vanishes from this entity's panel; navigate to the other entity's route → it still exists.

- [ ] **Step 8: Lint + tests + commit**

```bash
npm run lint
npx vitest run tests/components/
```

```bash
git add src/renderer/components/RelationshipsList.vue src/renderer/components/GroupsTable.vue src/renderer/components/PersonMediaSection.vue src/renderer/components/LinkedMediaSection.vue src/renderer/components/LinkedPlacesSection.vue src/renderer/components/LinkedPersonsSection.vue
git commit -m "feat(panels): unlink icon for join-row actions (relationships, groups, media, linked-*)"
```

---

### Task 4: Fix invented + hardcoded color tokens

**Files:**
- Modify: `src/renderer/components/PersonNamesTable.vue:263–268`
- Modify: `src/renderer/components/ResearchTasksTable.vue:132–152`
- Modify: `src/renderer/components/GroupsTable.vue:60`

- [ ] **Step 1: Fix PersonNamesTable**

Find the styles block. Replace:
- `var(--color-bg-muted)` → `var(--surface-bg)`
- `var(--color-text-muted)` → `var(--text-muted)`

(There are two values; replace both.)

- [ ] **Step 2: Fix ResearchTasksTable status + priority badges**

The current scoped block has hardcoded hex for four priority levels and four status states. Replace with semantic tokens. Open the file, locate the `.priority-low`, `.priority-medium`, `.priority-high`, `.priority-critical`, `.status-todo`, `.status-in-progress`, `.status-blocked`, `.status-done` (or similar) selectors, and replace as follows:

```css
/* Priority */
.priority-low      { background: var(--surface-hover); color: var(--text-muted); }
.priority-medium   { background: var(--info-bg);    color: var(--info-text); }
.priority-high     { background: var(--warning-bg); color: var(--warning-text); }
.priority-critical { background: var(--error-bg);   color: var(--error-text); }

/* Status */
.status-todo        { background: var(--surface-hover); color: var(--text-muted); }
.status-in-progress { background: var(--info-bg);    color: var(--info-text); }
.status-blocked     { background: var(--warning-bg); color: var(--warning-text); }
.status-done        { background: var(--success-bg); color: var(--success-text); }
```

(Adapt class names to whatever ResearchTasksTable actually uses — read the file first.)

- [ ] **Step 3: Fix GroupsTable**

Replace `color: #777;` with `color: var(--text-muted);`.

- [ ] **Step 4: WCAG check**

```bash
npx vitest run tests/unit/wcag
```

Expected: PASS in all themes / appearances. The badges in research tasks now read from theme-aware tokens, so high-contrast will adjust them.

- [ ] **Step 5: Visual smoke-check**

`npm start`, open `/research-tasks`, toggle through Light → Dark → High Contrast in Settings. Priority and status badges remain readable in every theme.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PersonNamesTable.vue src/renderer/components/ResearchTasksTable.vue src/renderer/components/GroupsTable.vue
git commit -m "fix(panels): use design tokens instead of hex colors and invented token names"
```

---

### Task 5: Remove Identifiers section from PersonPanel

**Files:**
- Delete: `src/renderer/components/PersonIdentifiersSection.vue`
- Modify: `src/renderer/components/PersonPanel.vue` (lines 104–110, 470, 482, and the import at the top)
- Modify: `src/renderer/i18n/sv.ts` (drop UI strings under `personDetail.identifiers` if they are not used elsewhere)
- Modify: `src/renderer/i18n/en.ts` (mirror)
- Modify: `docs/UX_INVENTORY.md` (drop Identifiers row, add round-trip-only note)
- Modify: `docs/DATA_MODEL.md` (add a one-line note that external identifiers exist on persons but are populated/consumed by import/export only)

- [ ] **Step 1: Confirm identifier data layer is independent**

```bash
grep -rn "addIdentifier\|getIdentifiers\|deleteIdentifier" src/api/ src/main/ipc/ src/mcp/
```

Expected: API + IPC + MCP layers reference the identifier methods. Renderer is the only place that surfaces them in UI. Removing the renderer section does not break import/export.

- [ ] **Step 2: Delete the section component**

```bash
git rm src/renderer/components/PersonIdentifiersSection.vue
```

- [ ] **Step 3: Remove the section from PersonPanel.vue**

Open `src/renderer/components/PersonPanel.vue`. Remove:
- The `<section>` block at lines 104–110 (the identifiers section in the template)
- The `import PersonIdentifiersSection from './PersonIdentifiersSection.vue';` import
- The `identifiers: false,` line in the `usePanelSections` defaults (around line 470)
- `'identifiers'` from the section-order array (around line 482)
- Any `triggerAddIdentifier` ref / handler / `defineExpose` related to it

Search to confirm:
```bash
grep -n "Identifier\|identifiers" src/renderer/components/PersonPanel.vue
```

Expected: 0 matches after the edit.

- [ ] **Step 4: Drop unused i18n keys**

In both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`, remove keys under the `identifiers` namespace that are only used for the deleted section UI (e.g. `identifiers.add`, `identifiers.removeConfirmTitle`, `identifiers.removeConfirmMessage`, `empty.identifiers`, etc.). Keep keys that survive in modal copy or error toasts (search before deleting).

For each candidate key:
```bash
grep -rn "identifiers.<keyName>" src/renderer/ src/static/ tests/
```
Expected: 0 hits → safe to remove. Any hit → leave the key in place.

- [ ] **Step 5: Update UX_INVENTORY.md**

Find the PersonPanel section table. Remove the Identifiers row. Add to the Cross-cutting notes section: "External identifiers (FamilySearch ID, Geni ID, etc.) are not surfaced in any panel. They round-trip through GEDCOM/Holger/Genney import and export only."

- [ ] **Step 6: Update DATA_MODEL.md**

Add to the persons section a one-line note:
> External identifiers (`person_identifiers` table) are populated and consumed by import/export paths only — they have no panel UI. The API, IPC, and MCP layers expose them for round-trip integrity.

- [ ] **Step 7: Verify**

```bash
npm run lint
npx vitest run
npm start
```

Expected:
- Lint clean.
- Tests pass.
- Open `/persons`, select any person — no External identifiers section appears.

- [ ] **Step 8: GEDCOM round-trip smoke-check**

```bash
npm start
```

Import a `.ged` file containing `_FSID`, `_GENI`, or similar identifier tags (use the project's test fixtures if they exist; otherwise a minimal hand-crafted `.ged`). Export the database back to GEDCOM. Diff the round-tripped IDs:
- The person's `person_identifiers` rows survive (`SELECT * FROM person_identifiers WHERE person_id = '...'` from the SQLite shell or via MCP `get_person_summary`).
- The exported GEDCOM still emits the corresponding tags.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(panels): remove External identifiers section from PersonPanel (round-trip-only)"
```

---

### Task 6: Relation row click → opens RelationshipModal

**Files:**
- Modify: `src/renderer/components/RelationshipsList.vue`
- Possibly Modify: `src/renderer/components/PersonRelationshipsSection.vue` (to mount RelationshipModal if it isn't already)

- [ ] **Step 1: Add row click in RelationshipsList**

Read the file. Add a `cursor: pointer` style + `class="clickable-row"` to the row, and an emit:

```vue
<tr
  v-for="row in rows"
  :key="row.id"
  class="clickable-row"
  @click="$emit('open', row.id)"
>
```

In the script setup, declare:
```ts
const emit = defineEmits<{
  (e: 'open', id: string): void;
  // existing emits stay
}>();
```

The unlink button must use `@click.stop="..."` to prevent bubbling to the row click.

- [ ] **Step 2: Wire RelationshipModal in the parent**

Read `src/renderer/components/PersonRelationshipsSection.vue` (or wherever `RelationshipsList` is used in a panel context). Import `RelationshipModal`:

```ts
import RelationshipModal from './modals/RelationshipModal.vue';
```

Add a ref for the open relationship id:
```ts
const editingRelationshipId = ref<string | null>(null);
```

In template, mount the modal:
```vue
<RelationshipModal
  v-if="editingRelationshipId"
  :relationship-id="editingRelationshipId"
  mode="standalone"
  @close="editingRelationshipId = null"
  @saved="editingRelationshipId = null"
/>
```

(If `RelationshipModal` props differ — read the file first to confirm shape — adapt prop names.)

Wire the row click:
```vue
<RelationshipsList :rows="relationships" @open="editingRelationshipId = $event" ... />
```

- [ ] **Step 3: Smoke-check**

`npm start`, open PersonPanel relations section, click a relationship row → RelationshipModal opens in edit mode → change subtype → save → row reflects the new subtype without a route change.

- [ ] **Step 4: Lint + commit**

```bash
npm run lint
git add src/renderer/components/RelationshipsList.vue src/renderer/components/PersonRelationshipsSection.vue
git commit -m "feat(panels): clicking a relationship row opens RelationshipModal in edit mode"
```

---

### Task 7: Add-relative UI clarity

**Files:**
- Modify: `src/renderer/components/modals/PersonModal.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add i18n helper text**

In `en.ts`, under `addRelated:`:
```ts
modeHelper: 'Already in your tree? Find them. Otherwise, add a new person.',
```

In `sv.ts`:
```ts
modeHelper: 'Finns hen redan i ditt träd? Hitta personen. Annars lägg till en ny.',
```

- [ ] **Step 2: Reorder + redefault the entry-mode toggle**

In `src/renderer/components/modals/PersonModal.vue`, find the block at lines 11–29. Replace with:

```vue
<!-- Entry-mode helper + toggle -->
<div v-if="addRelatedTo" class="ep-fields">
  <div class="ep-field">
    <p class="entry-mode-helper">{{ $t('addRelated.modeHelper') }}</p>
    <div class="ep-seg">
      <button
        type="button"
        class="ep-seg-opt"
        :class="{ 'ep-seg-opt--on': entryMode === 'existing' }"
        @click="entryMode = 'existing'"
      >{{ $t('addRelated.existingPerson') }}</button>
      <button
        type="button"
        class="ep-seg-opt"
        :class="{ 'ep-seg-opt--on': entryMode === 'new' }"
        @click="entryMode = 'new'; existingPersonId = null"
      >{{ $t('addRelated.newPerson') }}</button>
    </div>
  </div>
</div>
```

(Order swapped: Existing first, New second.)

- [ ] **Step 3: Default `entryMode` to `'existing'` when other persons exist**

In the script setup, find the existing `entryMode` declaration. Replace its default with a computed initial:

```ts
const entryMode = ref<'new' | 'existing'>('new'); // changed below in onMounted
onMounted(async () => {
  if (props.addRelatedTo && window.api) {
    const { total } = await window.api.persons.findPage(1, 0);
    if (total > 1) entryMode.value = 'existing';
  }
});
```

(If `persons.findPage` is named differently in this codebase, read `src/api/persons.ts` to confirm.)

- [ ] **Step 4: Style the helper line**

In the same file's `<style scoped>`, add:

```css
.entry-mode-helper {
  margin: 0 0 var(--space-sm) 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
}
```

(Use the project tokens — never hardcode.)

- [ ] **Step 5: Smoke-check**

`npm start`. Add a database with > 1 person (use any existing test DB or import one).
- Click `+ Add father` on a person → modal opens with **Existing person** highlighted, helper text visible.
- Type a name → matches list → pick → save → no new person created.
- Click `+ Add mother`, switch to New person → fill name → save → exactly one new person added.

DB count check via SQLite or MCP `search_persons`: existing-path increments by 0, new-path by 1.

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add src/renderer/components/modals/PersonModal.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat(modals): default Add-relative to Existing person + helper text + reordered toggle"
```

---

### Task 8: Section ordering — Quality is always last

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`
- Audit: every other `*Panel.vue` for the same violation

- [ ] **Step 1: Audit all panels**

```bash
for f in src/renderer/components/*Panel.vue; do
  echo "=== $f ==="
  grep -n "section-name\|<section\|Quality\|usePanelSections" "$f" | head -30
done
```

Identify any panel where Quality is not the last section (excluding Danger zone). Expect to find at least PlacePanel.

- [ ] **Step 2: Fix PlacePanel ordering**

Open `src/renderer/components/PlacePanel.vue`. Move the Address and Hierarchy `<section>` blocks before the Quality section. Update the section-order array in `usePanelSections` to match: Place fields → Notes → Citations → Persons → Address → Hierarchy → Media → Quality → (Danger zone if any).

- [ ] **Step 3: Fix any other panel violations found in Step 1**

For each, move sections so Quality is last. Update the section-order array.

- [ ] **Step 4: Smoke-check**

`npm start`. Visit `/places`, `/sources`, `/relationships`, `/groups`, `/research-tasks`, `/media`, the report panels — scroll the right panel in each. Quality is the last section before Danger zone (or the very last) in every panel.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add src/renderer/components/*Panel.vue
git commit -m "fix(panels): Quality section is consistently last across all panels"
```

---

### Task 9: P2 polish — Names default-expand + tooltips + birth-name disabled trash

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue` (~line 474)
- Modify: `src/renderer/components/PersonDetailsSection.vue` (~lines 13–15)
- Modify: `src/renderer/components/PersonNamesTable.vue` (~line 51)
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Default-expand Names**

In `PersonPanel.vue`, find the section defaults object (around line 470). Change `names: false` to `names: true`.

- [ ] **Step 2: Add living/deceased tooltip i18n**

In `en.ts` under `persons`:
```ts
livingTooltip: 'Living/deceased is set automatically by the death event. To change it, add or remove a death event.',
birthNameNotDeletable: 'A birth name cannot be removed — edit it instead.',
```

In `sv.ts`:
```ts
livingTooltip: 'Levande/avliden bestäms automatiskt av dödshändelsen. Lägg till eller ta bort en dödshändelse för att ändra.',
birthNameNotDeletable: 'Födelsenamn kan inte tas bort — redigera det istället.',
```

- [ ] **Step 3: Tooltip on living chip**

In `PersonDetailsSection.vue`, find the living/deceased chip (around lines 13–15). Add `:title="$t('persons.livingTooltip')"` to the element.

- [ ] **Step 4: Show disabled trash on birth-name rows with tooltip**

In `PersonNamesTable.vue` around line 51, the current `v-if="row.name_type !== 'birth'"` hides the icon entirely. Replace with: render the trash icon always, but disable + tooltip when birth.

```vue
<button
  class="..."
  :disabled="row.name_type === 'birth'"
  :title="row.name_type === 'birth' ? $t('persons.birthNameNotDeletable') : $t('common.deleteTooltip')"
  :aria-label="row.name_type === 'birth' ? $t('persons.birthNameNotDeletable') : $t('common.delete')"
  @click.stop="row.name_type !== 'birth' && askDelete(row.id)"
>
  <IconTrash :size="14" />
</button>
```

Add a CSS rule in scoped styles to dim the disabled state:
```css
button[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Smoke-check**

`npm start`. Open PersonPanel:
- Names section is open by default.
- The living/deceased chip shows the tooltip on hover.
- Birth name shows a dimmed trash icon with tooltip; clicking does nothing.

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add src/renderer/components/PersonPanel.vue src/renderer/components/PersonDetailsSection.vue src/renderer/components/PersonNamesTable.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat(panels): default-expand Names + tooltips for living chip and birth-name lock"
```

---

### Task 10: Audit PersonChecksSection's 1.5s debounce

**Files:**
- Modify: `src/renderer/components/PersonChecksSection.vue` (around line 62)

- [ ] **Step 1: Read the section, identify the debounce reason**

Open the file and read the entire script setup. Look for:
- A comment explaining the 1500ms timing
- Any expensive sync work in the loader that justifies it

- [ ] **Step 2: Decide**

If `useEntityData(idRef, loader)` already debounces (read `src/renderer/composables/useEntityData.ts` to confirm — likely 150–200ms per renderer.md), and the loader for checks is not measurably slow (run a `console.time`/`console.timeEnd` around the loader call in dev), **remove** the hand-rolled debounce and feed the raw `personId` ref into `useEntityData`. The composable's debounce takes over.

If the loader IS slow enough to need a longer debounce, **keep** the debounce but add a code comment:
```ts
// Custom 1500ms debounce: quality checks are O(events × rules) and recompute
// on every save. The 200ms default in useEntityData would re-run on every
// keystroke during inline name edits. Tune cautiously.
```

- [ ] **Step 3: Lint + (optional) commit**

If you changed the file:
```bash
npm run lint
git add src/renderer/components/PersonChecksSection.vue
git commit -m "refactor(panels): {remove hand-rolled debounce | document rationale} in PersonChecksSection"
```

If you didn't change the file (the debounce is fine), no commit.

---

### Task 11: Update UX_INVENTORY.md

**Files:**
- Modify: `docs/UX_INVENTORY.md`

- [ ] **Step 1: Read the current state**

```bash
cat docs/UX_INVENTORY.md
```

Identify the PersonPanel section. Find the rows still marked TBD and any reference to the Identifiers section.

- [ ] **Step 2: Fill in the TBD entries**

Use the audit findings from this session (the agent report). For each PersonPanel section, write:
- Purpose (one sentence in user language)
- CTAs present
- Notes / quirks

Sections to fill: Header, Person, Names, Timeline, Life Map, Media, Media Timeline, Quality, Danger zone.

- [ ] **Step 3: Drop the Identifiers row**

Remove the Identifiers section row entirely. In the cross-cutting notes section add:
> External identifiers (FamilySearch ID, Geni ID, etc.) are not surfaced in any panel. They round-trip through GEDCOM/Holger/Genney import/export only.

- [ ] **Step 4: Document the new icon convention**

Add a "Cross-cutting conventions: row icons" section:
> - **Trash icon** (`IconTrash`) means the action **destroys an entity permanently**. Tooltip: "Delete permanently". Used for: Names, Events, Research tasks, Citations.
> - **Unlink icon** (`IconUnlink`) means the action **removes a connection; both entities are preserved**. Tooltip: "Unlink — both entities are kept". Used for: Relationships, Group memberships, Linked media, Linked persons, Linked places.
> - The `✕` glyph is reserved for **modal close** only.
> - `QualityIssuesTable` is an open exception: it uses `✕` for "ignore this issue" — neither destroy nor unlink. A follow-up plan should give it its own icon.

- [ ] **Step 5: Mark cross-cutting findings #1 and #2 as resolved**

If the doc has a list of cross-cutting findings, mark #1 (✕ overload) and #2 (Add-relative duplicates) as resolved with a reference to this plan's filename.

- [ ] **Step 6: Commit**

```bash
git add docs/UX_INVENTORY.md
git commit -m "docs(ux): fill PersonPanel surfaces, document icon convention, mark resolved findings"
```

---

### Task 12: Final wrap — version bump + CHANGELOG + plan archive

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Move: `docs/plans/2026-05-02-panel-action-clarity.md` → `docs/plans/archive/`

- [ ] **Step 1: Bump version**

Edit `package.json`. Change `"version": "0.193.3"` to `"version": "0.194.0"`. Minor bump because this ships a UI surface removal + new behavior (per memory rule: every feature = minor).

- [ ] **Step 2: Add CHANGELOG entry**

Prepend to `CHANGELOG.md` (after the title, before the most recent version block):

```markdown
## v0.194.0 — Right-panel action clarity

- feat(panels): row actions now use distinct icons — trash for "delete entity permanently", unlink for "remove this connection". Tooltips spell out the blast radius. Replaces overloaded `✕`.
- feat(panels): "Add father / mother / spouse / son / daughter" defaults to Find Existing Person when the database has more than one person, with helper text above the toggle. Prevents accidental duplicates.
- feat(panels): clicking a relationship row in PersonPanel opens RelationshipModal in edit mode (consistent with names and events).
- feat(panels): External identifiers section removed from PersonPanel (round-trip-only data, surfaced via import/export).
- fix(panels): replace hex colors and invented design-token names with real tokens in Names table, Research Tasks table, and Groups table. High-contrast and dark themes now adjust these correctly.
- fix(panels): Quality section is consistently the last section (before any Danger zone) across all panels.
- fix(panels): Names section is open by default in PersonPanel.
- fix(panels): birth name shows a disabled trash icon with explanatory tooltip instead of disappearing.
- chore(docs): UX_INVENTORY filled out for PersonPanel surfaces; icon convention documented.
```

- [ ] **Step 3: Tick all checkboxes in the plan file**

Open `docs/plans/2026-05-02-panel-action-clarity.md` and change every `- [ ]` to `- [x]`.

- [ ] **Step 4: Move plan to archive**

```bash
git mv docs/plans/2026-05-02-panel-action-clarity.md docs/plans/archive/
```

- [ ] **Step 5: Final lint + tests**

```bash
npm run lint
npx vitest run
```

Expected: 0 lint errors. All tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json CHANGELOG.md docs/plans/archive/2026-05-02-panel-action-clarity.md
git commit -m "chore: archive panel-action-clarity + bump 0.194.0"
```

- [ ] **Step 7: Hand back to the controller for merge**

Use `superpowers:finishing-a-development-branch` Option 1 (merge → main, delete branch, remove worktree).

---

## Self-review checklist

- [ ] Every section in **Scope** has a corresponding Task.
- [ ] No "TBD" or "implement later" placeholders.
- [ ] Every code step contains the actual code, not a description.
- [ ] Section ordering is enumerated in Section F and verified in Task 8.
- [ ] All 11 `✕` row-icon sites are listed in Section A and migrated in Tasks 2 + 3.
- [ ] i18n keys added in en.ts + sv.ts in the same task that introduces them.
- [ ] Every visual change has a smoke-check step in addition to lint/test.
- [ ] Verification section names user-observable outcomes, not lint+vitest only.
- [ ] Plan file lives at `docs/plans/`, not `docs/superpowers/specs/` or `.claude/plans/`.
