# Plan: Detail View UX Consistency

**Date:** 2026-04-03
**Status:** Pending

## Audit findings

`SourceDetailView` is the reference implementation. The others deviate:

| View | Issue |
|------|-------|
| **PersonDetailView** | No "Person Details" section. Sex is an inline select in the header — unique pattern used nowhere else. `living` has no edit control at all (only a dead badge). |
| **RelationshipDetailView** | Section order is wrong: Persons comes before Type, but type determines what the person-picker labels say (Parent/Child, Partner/Partner). |
| **PlaceDetailView** | All fields are inline-edit (good!), but the detail section has no heading. Also uses single-column layout while Source uses 2-column. |

**PersonDetailView — birth name editing**: The edit modal fires on click for every name row including sort_order 0 (birth name). This was broken by the `name_prefix` migration bug, which is now fixed. No code change needed here — just confirmation.

---

## Target pattern (from SourceDetailView)

```
← Back
<h2>Entity display name</h2>          ← static title, action buttons if any

[ Entity Details ]  ← FIRST section, h4 heading, 2-col field-grid
  field: inline-edit input, blur/change-to-save

[ Related entities ]  ← subsequent sections (events, names, etc.)
```

Rules:
- Header: back button + `<h2>` + optional action buttons (Cite). No edit controls in the header.
- First section is always the entity's own fields, with a heading.
- All fields: inline-edit with `@blur` (text) or `@change` (select) — no Save button.
- 2-column `field-grid` for entity fields (matches SourceDetailView).

---

## Task 1 — PersonDetailView: add Person Details section, move sex, add living edit

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

### Changes

**Header** (lines 6–22): Remove the sex `<select>` and deceased badge. Keep name `<h2>` and the Cite button. The deceased badge can stay as a passive visual indicator (read-only) since it's useful at a glance — but the sex select must come out of the header.

New header template:
```vue
<div class="detail-header">
  <button class="btn-back" @click="$router.push('/')">{{ $t('personDetail.back') }}</button>
  <div class="header-info">
    <h2>{{ primaryName }}</h2>
    <span v-if="!person.living" class="deceased-badge">{{ $t('personDetail.deceased') }}</span>
    <button type="button" class="btn-cite-header" @click="showCitePersonForm = true">{{ $t('personDetail.citePersonTitle') }}</button>
  </div>
  <div v-if="evidenceTotal > 0" class="evidence-summary">
    {{ $t('personDetail.evidenceSummary', { sourced: evidenceSourced, total: evidenceTotal }) }}
  </div>
</div>
```

**New "Person Details" section** — insert BEFORE the Names section (currently line 24):
```vue
<!-- Person Details -->
<section class="detail-section">
  <div class="section-header">
    <h4>{{ $t('personDetail.detailsTitle') }}</h4>
  </div>
  <div class="field-grid">
    <label>
      {{ $t('persons.sex') }}
      <select
        :class="'sex-select sex-' + person.sex"
        v-model="editSex"
        @change="updateSex(editSex)"
      >
        <option value="M">{{ $t('sex.M') }}</option>
        <option value="F">{{ $t('sex.F') }}</option>
        <option value="U">{{ $t('sex.U') }}</option>
      </select>
    </label>
    <label>
      {{ $t('personDetail.statusLabel') }}
      <select v-model="editLiving" @change="updateLiving(editLiving)">
        <option :value="1">{{ $t('personDetail.statusLiving') }}</option>
        <option :value="0">{{ $t('personDetail.statusDeceased') }}</option>
      </select>
    </label>
  </div>
</section>
```

**Script additions** — add reactive state and handler:
```typescript
const editSex = ref('U');
const editLiving = ref(1);

// In load(), after person.value is set:
editSex.value = person.value.sex;
editLiving.value = person.value.living;

// Replace updateSex:
async function updateSex(sex: string) {
  if (!window.api || !person.value) return;
  await window.api.persons.update(personId, { sex });
  person.value.sex = sex;
}

// New:
async function updateLiving(living: number) {
  if (!window.api || !person.value) return;
  await window.api.persons.update(personId, { living });
  person.value.living = living;
}
```

**CSS** — add `.field-grid` to PersonDetailView styles (same as SourceDetailView):
```css
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
.field-grid select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
```

**i18n** — new keys needed:
```typescript
// sv.ts — inside personDetail:
detailsTitle: 'Personuppgifter',
statusLabel: 'Status',
statusLiving: 'Levande',
statusDeceased: 'Avliden',

// en.ts — inside personDetail:
detailsTitle: 'Person Details',
statusLabel: 'Status',
statusLiving: 'Living',
statusDeceased: 'Deceased',
```

Note: `persons.sex` key likely already exists (the select labels use `sex.M`, `sex.F`, `sex.U`). Check `sv.ts` and add `persons.sex: 'Kön'` / `en: 'Sex'` if missing.

### Verify

- [ ] Run `npm test` — no unit test changes needed (UI-only change)
- [ ] Launch app, open a PersonDetailView — verify "Person Details" section appears with sex + living dropdowns
- [ ] Change sex — verify saves immediately without a save button
- [ ] Change living status — verify saves and deceased badge updates in header
- [ ] Click a name row (including birth name row) — verify edit modal opens and saves

---

## Task 2 — RelationshipDetailView: reorder sections (Type first, Persons second)

**Files:**
- Modify: `src/renderer/views/RelationshipDetailView.vue`

This is a template-only change — swap the two `<section>` elements. The Type & Subtype section (currently second, lines 36–76) moves above the Persons section (currently first, lines 11–34).

Result:
```
1. Type & Subtype (+ Notes)  ← now first
2. Persons (PersonPicker)    ← now second
3. Events
```

This makes semantic sense: "this is a parent-child relationship" → then "here are the parent and child".

### Verify

- [ ] `npm test`
- [ ] Open a relationship — confirm Type section appears before Persons section
- [ ] Change type from "couple" to "parent_child" — confirm person picker labels update correctly (they depend on `relationship.type` which is reactive)

---

## Task 3 — PlaceDetailView: add section heading + 2-column layout

**Files:**
- Modify: `src/renderer/views/PlaceDetailView.vue`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

**Template** — wrap the field-grid in a proper section with heading:
```vue
<section class="detail-section">
  <div class="section-header">
    <h4>{{ $t('places.detailsTitle') }}</h4>
  </div>
  <div class="field-grid">
    <!-- existing fields unchanged -->
  </div>
</section>
```

**CSS** — change field-grid from single-column to 2-column (matching SourceDetailView):
```css
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
```

Name + type fit naturally side-by-side. Parent place spans full width (it's a picker, needs space):
```vue
<label class="full-width">{{ $t('places.parentPlace') }}
  <PlacePicker ... />
</label>
```
```css
.full-width { grid-column: 1 / -1; }
```

Lat + lon fit side-by-side naturally.

**i18n** — new keys:
```typescript
// sv.ts — inside places:
detailsTitle: 'Platsuppgifter',

// en.ts:
detailsTitle: 'Place Details',
```

Also add `.section-header` and `.section-header h4` styles to PlaceDetailView (currently missing — the existing `detail-section h4` rule is global, not via `.section-header`):
```css
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-header h4 { margin: 0; font-size: 15px; }
```

### Verify

- [ ] `npm test`
- [ ] Open a place — confirm "Place Details" heading appears, fields in 2-column layout
- [ ] Edit name field, blur — confirm saves
- [ ] Lat/lon fields should sit side by side, Parent place full width

---

## Task 4 — Update vue-ui-builder agent template with UX conventions

**Files:**
- Modify: `.claude/agents/vue-ui-builder.md`

Replace the vague "Detail view pattern" section with the specific UX conventions:

```markdown
## Detail view UX conventions

These rules apply to all detail views (PersonDetailView, SourceDetailView, etc.).
New detail views must follow this pattern. Existing views must not deviate from it.

### Layout

```
← Back button
<h2>Entity display name</h2>   action buttons (Cite, etc.) inline
[ evidence/status line if applicable ]

─── Entity Details ────────────────
  2-column field-grid
  Each field: label + inline-edit input or select
  Text fields: save on @blur
  Selects: save on @change
  No Save button — every change auto-saves

─── Related entity section ────────
  section-header with h4 + optional Add button
  table or list of related items

─── (more sections) ───────────────
```

### Rules

1. **Entity Details section is always first** — before events, names, relationships, etc.
2. **2-column field-grid** for entity fields — same CSS as SourceDetailView
3. **No edit controls in the header** — `<h2>` is read-only, action buttons only
4. **Auto-save, no Save button** — `@blur` for text, `@change` for selects
5. **All core entity fields must be editable** — if a field exists in the DB, it must have an edit control on the detail view
```

---

## Task 5 — Add ux-reviewer agent template

**Files:**
- Create: `.claude/agents/ux-reviewer.md`

This agent is invoked by the orchestrator after a vue-ui-builder pass to verify consistency.

```markdown
# UX Reviewer Agent

You are reviewing **Vue 3 detail views and list views** in the Släktforskning genealogy app for UX consistency. You do NOT write new code — you report issues and required fixes.

## Your task

{{TASK}}

## What to check

### Detail views (PersonDetailView, SourceDetailView, RelationshipDetailView, PlaceDetailView, etc.)

Check each detail view against the canonical pattern:

1. **Entity Details section is first** — the view's own editable fields appear before any related-entity sections (events, names, etc.)
2. **No edit controls in the header** — header contains only: back button, `<h2>` display name, optional action buttons (Cite, etc.)
3. **All core entity fields are editable** — every column on the entity's DB table has an edit control in the "Entity Details" section
4. **Auto-save pattern** — text fields save on `@blur`, selects save on `@change`; no Save button
5. **Section headings** — every `<section>` has a `<div class="section-header"><h4>...</h4></div>`
6. **2-column field-grid** — entity detail fields use `display: grid; grid-template-columns: 1fr 1fr`
7. **Consistent font sizes** — inputs 14px, table rows 13px, section headings 15px

### List views

1. **Add button** opens a modal (not a navigation)
2. **Table rows** are clickable → navigate to detail view
3. **Delete button** uses `@click.stop` to prevent row navigation

## Output format

For each issue found:
- **File**: `src/renderer/views/XDetailView.vue`
- **Issue**: what is wrong
- **Fix**: what change is needed (specific — name the element or line)

If no issues: "All views consistent with the pattern."

## Status

Report: **CONSISTENT**, **ISSUES_FOUND** (list them), or **NEEDS_MORE_CONTEXT**
```

---

## Commit plan

- Task 1 + 2 + 3 in one commit: `fix(ui): detail view consistency — person details section, relationship type order, place heading`
- Task 4 + 5 in one commit: `docs: ux-reviewer agent template and vue-ui-builder conventions`

---

## What is NOT in scope

- Redesigning the names table in PersonDetailView (edit modal works correctly)
- Adding new data fields to any entity (no schema changes)
- Changing the EventList component or CitationForm
- Updating RelationshipsView or PersonsView list views (they are consistent)
