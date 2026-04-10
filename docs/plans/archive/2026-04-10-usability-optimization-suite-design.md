# Design Spec: Usability Optimization Suite (A+C+D+E+F+G)

## Goal

Reduce total actions needed to build a fully-sourced family tree by ~50%, from ~792 to ~393 actions for a 10-person, 2-generation tree with full citations.

## Implementation Priority

Order follows dependency graph and impact-per-effort ratio:

1. **Feature A: Enhanced Quick Add Related Person** (Medium effort, High impact - 12%)
2. **Feature C: Inline Birth in Person Creation** (Small effort, High impact - 13%)
3. **Feature E: Quick Cite from Event List** (Small effort, High impact - 13%)
4. **Feature D: Source Session Memory** (Small effort, Low impact - 2%)
5. **Feature F: Tree-Based Entry Shortcuts** (Medium effort, Medium impact - 7%)
6. **Feature G: Batch Event Entry** (Medium effort, Low impact - 3%)

Features A and C share a composable. Feature D feeds pre-fill data into A, C, E, and G.

---

## Feature A: Enhanced Quick Add Related Person

### Current State
- `AddRelatedPersonModal.vue` exists with name + sex + living + subtype fields
- Creates person + relationship in one save
- Buttons already in PersonDetailView and PersonPanel
- No birth event fields, no surname pre-fill, no sex auto-inference

### Changes

**AddRelatedPersonModal.vue - form enhancements:**
- **Surname pre-fill:** When mode is `child`, on mount fetch current person's primary name and pre-fill `form.surname`.
- **Sex auto-inference:** When mode is `father`/`mother`, set sex to M/F accordingly. When mode is `spouse`, infer opposite sex of current person. Requires knowing current person's sex - add `personSex` prop.
- **Mode split:** Change mode from `parent` to `father` | `mother` to enable sex auto-set. Update PersonDetailView and PersonPanel button handlers.
- **Birth fields (optional section):**
  - Date input (type="date", single field, default date_type="exact")
  - Original date text field
  - PlacePicker for birth place
  - Checkbox: "Add source" -> source dropdown + page field (same pattern as EventForm)
- **Save flow:** create person -> create birth event (if date or place filled) -> add event_participant(role=primary) -> create citation (if source checked) -> create relationship -> emit saved

**New composable: `src/renderer/composables/useBirthEventCreation.ts`**

Provides `createBirthEvent(personId, { date_value?, date_original?, place_id?, source_id?, page? })` that returns event ID or null if no birth data provided. Creates event + participant + optional citation in sequence.

**Updated props:**
- `personId: string`
- `personSex?: 'M' | 'F' | 'U'` (NEW: for sex inference)
- `personSurname?: string` (NEW: for surname pre-fill)
- `mode: 'father' | 'mother' | 'spouse' | 'child'` (CHANGED: split parent into father/mother)

**i18n keys needed:**
- `addRelated.birthDate`, `addRelated.birthPlace`, `addRelated.originalDate`
- `addRelated.addFatherTitle`, `addRelated.addMotherTitle`
- `personDetail.addFather`, `personDetail.addMother` (button labels)

### Files Modified
- `src/renderer/components/AddRelatedPersonModal.vue`
- `src/renderer/views/PersonDetailView.vue` (split parent button into father/mother)
- `src/renderer/components/PersonPanel.vue` (split parent button into father/mother)
- `src/renderer/i18n/sv.ts`, `en.ts`

### New Files
- `src/renderer/composables/useBirthEventCreation.ts`

---

## Feature C: Inline Birth in Person Creation

### Current State
- PersonsView "Add Person" modal has: given_name, surname, sex (radio), notes
- No event creation during person creation

### Changes

**PersonsView.vue - modal form enhancement:**
- Add collapsible "Birth" section below notes:
  - Birth date (input type="date")
  - Original date (text input)
  - Birth place (PlacePicker)
  - Checkbox: "Add source" -> source dropdown + page field
- On submit: create person (existing flow) -> call `useBirthEventCreation().createBirthEvent()` if any birth field is filled -> reload list
- Birth fields are optional - leaving them blank creates person without birth event (preserving current behavior)

### Files Modified
- `src/renderer/views/PersonsView.vue`

---

## Feature E: Quick Cite from Event List

### Current State
- EventList rows show: type, date, place, description, edit button, delete button
- To add a citation, must open full EventForm in edit mode, scroll to citations, use checkbox
- CitationForm already accepts `eventId` prop

### Changes

**EventList.vue - per-row cite button:**
- Add cite button (small, icon-style) between edit and delete buttons
- Click opens CitationForm as standalone modal with `eventId` pre-filled
- Show citation count badge on each event row

**Citation count:** Add `citation_count` to event query results via SQL LEFT JOIN COUNT. Modify `getEventsForPerson()` and `getEventsForRelationship()` in `src/api/events.ts` to include citation count.

### Files Modified
- `src/renderer/components/EventList.vue`
- `src/api/events.ts` (add citation_count to query)
- `src/renderer/i18n/sv.ts`, `en.ts`

---

## Feature D: Source Session Memory

### Current State
- CitationForm and EventForm both fetch all sources on mount via `window.api.sources.list()`
- No memory of last-used source between form instances

### Changes

**New Pinia store: `src/renderer/stores/sourceSession.ts`**
- `lastSourceId: string | null` - last source used for a citation
- `lastPage: string` - last page pattern used
- `setLastUsed(sourceId, page)` - called after every citation creation
- `clear()` - reset

**Integration points:**
- CitationForm: On mount, if `lastSourceId` is set and no `sourceId` prop, pre-select it. After save, call `setLastUsed()`.
- EventForm: Same pattern for inline citation source selection. After save with citation, call `setLastUsed()`.
- AddRelatedPersonModal: Same for birth citation.
- PersonsView: Same for inline birth citation.

### New Files
- `src/renderer/stores/sourceSession.ts`

### Files Modified
- `src/renderer/components/CitationForm.vue`
- `src/renderer/components/EventForm.vue`

---

## Feature F: Tree-Based Entry Shortcuts

### Current State
- PedigreeChart renders SVG boxes only for loaded persons
- Empty ancestor positions are not shown - tree compresses
- Hover popover on existing nodes shows Add Parent/Spouse/Child (already connected to AddRelatedPersonModal)
- Uses Ahnentafel numbering: key*2 = father, key*2+1 = mother

### Changes

**chartLayout.ts - placeholder nodes:**
- In `layoutPedigree()`, after computing real nodes, add placeholder entries for missing parents of leaf nodes (up to 1 generation beyond loaded data)
- New type: `PlaceholderNode` with `{ type: 'placeholder', parentKey: number, role: 'father' | 'mother', childPersonId: string }`
- Layout algorithm includes placeholders in spacing calculations

**PedigreeChart.vue - ghost box rendering:**
- Render placeholder nodes as dashed-border boxes with "+" icon and "Add Father"/"Add Mother" text
- Smaller than regular boxes, distinct visual style (dashed border, muted color)
- Click handler opens `AddRelatedPersonModal` with appropriate mode and personId
- After save, emit `relative-added` to trigger tree reload

### Files Modified
- `src/renderer/utils/chartLayout.ts`
- `src/renderer/components/PedigreeChart.vue`

---

## Feature G: Batch Event Entry

### Current State
- EventForm creates one event, closes modal on save
- To add multiple events, user must click "+ Add Event" each time

### Changes

**EventForm.vue - "Save & Add Another" button:**
- Add second submit button: "Save & Add Another" alongside existing save button
- When clicked: save current event -> reset form fields (keep modal open) -> increment counter
- Preserve: event context (personId/relationshipId), source session memory pre-fill
- Reset: event type, date fields, place, description, cause
- Show small badge: "2 events added" near the title
- "Save" / "Done" button closes modal as before (existing behavior unchanged)

### Files Modified
- `src/renderer/components/EventForm.vue`
- `src/renderer/i18n/sv.ts`, `en.ts`

---

## Shared Dependencies

### Composable: useBirthEventCreation
Used by: Features A and C

### Pinia Store: sourceSession
Used by: Features A, C, D, E, G

### i18n Updates
All features add keys to both `sv.ts` and `en.ts`.

---

## Testing Strategy

### Unit Tests (Vitest)
- `useBirthEventCreation`: test person + event + citation creation flow
- `sourceSession` store: test set/get/clear
- `events.ts` citation count query: test with 0, 1, N citations
- Chart layout placeholder generation: test with missing parents

### Component Tests
- AddRelatedPersonModal: test surname pre-fill, sex inference, birth event creation
- PersonsView: test inline birth fields, form reset
- EventList: test cite button, citation count display
- EventForm: test "Save & Add Another" flow

### E2E Tests
- Create person with inline birth -> verify event exists
- Quick Add child from person detail -> verify person + relationship + birth event
- Quick cite from event list -> verify citation linked
- Batch add 3 events -> verify all created
