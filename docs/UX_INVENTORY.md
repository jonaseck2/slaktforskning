# UI Surface Inventory — Släktforskning

A living reference of every bounded UI surface in the renderer (panels, panel sections, modals, sub-modals), each with a one-sentence **Purpose** in user-facing words and a **CTA inventory** across `View / Add / Edit / Delete / Open`.

Use this doc as the source of truth for "what is this surface for, and what verbs does it offer the user." When working on UI changes, read the relevant entry first; if it disagrees with what you observe in the running app or the source code, **the code is the truth — update this doc**.

The methodology and consistency rules are owned by `.claude/skills/ux-intent-mapping`. This file holds the *output* of that lens applied to current code.

---

## Language convention

This doc is **English-only**, like all developer docs and code in the repo. UI labels visible to end users are localized via i18n (`src/renderer/i18n/sv.ts`, `en.ts`) and may render in Swedish in the running app — but the doc, the code, and the conversations about them all use English. When referring to a section, use its English name even if the live UI shows the Swedish translation.

## How to use this doc

- **Before changing a surface**: read its entry. If the entry is missing or stale, fill it in by reading the current code (don't infer from memory).
- **After changing a surface**: update its entry. Bump its `Verified` date. If a new verb became available or a verb's semantics changed, update the inventory cell.
- **When adding a surface**: write the entry before the implementation lands. The Purpose sentence must come from the user; if it stutters, fix the model before coding.
- **When the doc and the app disagree**: the app is the truth. Update the doc.

A surface is verified if it carries `**Verified:** YYYY-MM-DD`. Surfaces marked **TBD** have not been audited yet — add them as you touch them.

---

## Glossary (this app's user-facing objects)

The Purpose sentence for any surface must use one of these concrete object names — never "data", "items", "entries":

> **person · place · source · citation · event · name · identifier · relationship · group · research task · media · website**

When the surface is a join (e.g. Person → Citation → Source), apply the inventory **twice in one row** — once for the join, once for the target.

---

## Cross-cutting findings (open)

These show up across multiple surfaces. Surface-level entries below reference these by name.

### 1. The `✕` button means different things in different sections — ✅ Resolved in `docs/plans/2026-05-02-panel-action-clarity.md`

| Section | What the icon does | Icon now | Status |
|---|---|---|---|
| `GroupsTable` (Person → Groups) | Unlinks the person from the group; group itself is preserved | `IconUnlink` | ✅ resolved |
| `PersonRelationshipsSection` | Unlinks the relationship; both persons preserved | `IconUnlink` | ✅ resolved |
| `ResearchTasksTable` (Person → Research tasks) | Deletes the task entirely | `IconTrash` | ✅ resolved |

The fix landed by splitting the verbs: destructive actions use `IconTrash` ("Delete permanently"), unlinks use `IconUnlink` ("Unlink — both entities are kept"). See **Cross-cutting conventions: row icons** below.

### 2. Some `+ Add` labels hide the actual primitive — ✅ Resolved in `docs/plans/2026-05-02-panel-action-clarity.md`

| Section | Label says | Actually does | Status |
|---|---|---|---|
| `PlacePanel` → Persons | `+ Add person` | Creates a person *and* an event at this place | ✅ relabeled |
| `PersonPanel` → Header (add-relative shortcuts) | `+ Add father / mother / spouse / child / sibling` | Creates a brand-new person and links by relationship | ✅ relabeled to be explicit; duplicate row removed |
| `PersonPanel` → Relations | `+ Add relationship` | Creates a brand-new person + relationship | ✅ relabeled / consolidated with header shortcuts |

The fix landed by removing the duplicate add-relative row from the Relations section (the header row is the single entry point) and by tightening the labels so they describe the actual primitive.

### 3. The `+ Add` UX is inconsistent across siblings

The gold-standard pattern is `GroupPicker` / `SourcePicker`: an inline combobox that resolves the same keystroke flow into either *link existing* or *create new*. Sections that match: Groups (uses `GroupPicker`), CitationModal (uses `SourcePicker`).

Sections that *don't* match and should be reviewed: Research tasks (modal-only, no link path), Relations (modal-only, no link path), Place → Persons (form-only, no link path).

### 4. No "all citations for this person" surface

Citations on a Person are nested two clicks deep (Event row → EventModal → Citations subsection). A user wanting to audit every source they've cited for a person has no entry point. The model supports it; the panel doesn't surface it. Candidate: a derived read-only Citations section under PersonPanel.

### 5. External identifiers are not surfaced in any panel

External identifiers (FamilySearch ID, Geni ID, etc.) are not surfaced in any panel. They round-trip through GEDCOM/Holger/Genney import and export only. The data layer (`person_identifiers` table + API/IPC/MCP) is fully wired so importers and exporters preserve them; nothing in the UI reads or writes them.

### 6. Place-level citations are a data-model primitive without a strong user need — UI removed

The schema supports `citation.place_id` (citing the place itself, distinct from citing events that happen at it), and the API + MCP layer still expose `citations.forPlace`. The PlacePanel surfaced this in a Citations section, but in practice genealogists cite events at a place, not the place itself. The section was removed from PlacePanel to keep the panel focused on the verbs users actually reach for. The column and API stay (existing data is preserved; bulk imports / MCP can still create such citations); only the UI affordance is gone.

### 7. Postal-address fields on places exist only for GEDCOM round-trip — UI removed

The `places.{street, postal_code, city, country}` columns exist to round-trip GEDCOM 5.5.1 event-level ADDR sub-tags (the importer ([event-importer.ts:38–60](../src/import/gedcom/event-importer.ts#L38)) lifts them onto the place; the exporter ([exporter.ts:55–60](../src/gedcom/exporter.ts#L55)) emits them under each event's PLAC). The PlacePanel surfaced these as an Address section, but a researcher authoring genealogy from scratch has no reason to type a modern postal address against a parish or farm. Same pattern as finding #5 (External identifiers) and #6 (Place-level citations): round-trip-only data, importers and exporters preserve it, the UI doesn't surface it. Section removed; columns and importer/exporter behavior preserved.

---

## Cross-cutting conventions: row icons

These conventions are enforced across every panel section that lists child entities. New sections must follow this split — picking the wrong icon is a data-fidelity hazard, not a cosmetic one.

- **Trash icon** (`IconTrash`) means the action **destroys an entity permanently**. Tooltip: "Delete permanently" (`common.deleteTooltip`). Used for: Names, Events, Research tasks, Citations.
- **Unlink icon** (`IconUnlink`) means the action **removes a connection; both entities are preserved**. Tooltip: "Unlink — both entities are kept" (`common.unlinkTooltip`). Used for: Relationships, Group memberships, Linked media, Linked persons, Linked places, Source repositories.
- The `✕` glyph is reserved for **modal close** only.
- `QualityIssuesTable` is an open exception: it uses `✕` for "ignore this issue" — neither destroy nor unlink. A follow-up plan should give it its own icon.

---

## Surface index

Verification status as of the dates listed. Entries dated 2026-05-02 with a Purpose marked _TBD — needs user-stated intent_ have their CTA inventory and code references audited but still need a one-sentence Purpose written by the user (per the [`ux-intent-mapping`](../.claude/skills/ux-intent-mapping/SKILL.md) skill, the Purpose comes from the user, not from inferred code reading).

### Persons view (`PersonsView` + `PersonPanel`)

| Surface | Verified |
|---|---|
| PersonPanel — Header & add-relative shortcuts | 2026-05-02 |
| PersonPanel — Person section (sex/notes) | 2026-05-02 |
| PersonPanel — Names section | 2026-05-02 |
| PersonPanel — Events section | 2026-05-02 |
| PersonPanel — Timeline section | 2026-05-02 |
| PersonPanel — Life Map section | 2026-05-02 |
| PersonPanel — Relations section | 2026-05-02 |
| PersonPanel — Groups section | 2026-05-02 |
| PersonPanel — Media section | 2026-05-02 |
| PersonPanel — Media Timeline section | 2026-05-02 |
| PersonPanel — Research tasks section | 2026-05-02 |
| PersonPanel — Quality section | 2026-05-02 |
| PersonPanel — Danger zone (delete person) | 2026-05-02 |

### Places view (`PlacesView` + `PlacePanel`)

| Surface | Verified |
|---|---|
| PlacePanel — Place section | 2026-05-02 |
| PlacePanel — Persons section | 2026-05-02 |
| PlacePanel — Events section | 2026-05-02 |
| PlacePanel — Timeline section | 2026-05-02 |
| PlacePanel — Media section | 2026-05-02 |
| PlacePanel — Media Timeline section | 2026-05-02 |
| PlacePanel — Quality section | 2026-05-02 |

### Sources view (`SourcesView` + `SourcePanel`)

| Surface | Verified |
|---|---|
| SourcePanel — Source section | 2026-05-02 |
| SourcePanel — Citations section | 2026-05-02 |
| SourcePanel — Repositories section | 2026-05-02 |
| SourcePanel — Media section | 2026-05-02 |
| SourcePanel — Quality section | 2026-05-02 |

### Other panels

| Surface | Verified |
|---|---|
| RelationshipPanel | 2026-05-02 |
| GroupPanel | 2026-05-02 |
| ResearchTaskPanel | 2026-05-02 |
| MediaPanel | 2026-05-02 |
| ReportPanel | 2026-05-02 |
| WebsitePanel | 2026-05-02 |
| ExportOptionsPanel | 2026-05-02 |

### Modals (live in `src/renderer/components/modals/`)

| Surface | Verified |
|---|---|
| EventModal | 2026-05-02 |
| CitationModal | 2026-05-02 |
| SourceModal | 2026-05-02 |
| PersonModal | 2026-05-02 |
| PersonNameModal | 2026-05-02 |
| PlaceModal | 2026-05-02 |
| PlaceTreePickerModal | 2026-05-02 |
| RelationshipModal | 2026-05-02 |
| GroupModal | 2026-05-02 |
| ResearchTaskModal | 2026-05-02 |
| MergePersonsModal | 2026-05-02 |
| LinkRuleModal | 2026-05-02 |
| ConfirmModal (generic destructive confirm) | 2026-05-02 |

---

## Verified surfaces

### PersonPanel → Header & add-relative shortcuts
**File:** `src/renderer/components/PersonPanel.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use the header to *see* who they are looking at (name · sex · life dates · profile photo) and to *add a relative* — father, mother, spouse, child, or sibling — in one click.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Identity card: profile photo · primary name · sex glyph · birth–death summary. Add-relative row underneath: 5 typed buttons (`+ Father`, `+ Mother`, `+ Spouse`, `+ Child`, `+ Sibling`) | Each shortcut opens **AddRelativeModal** preset to that role. Always create-new — no link-existing path here. | Header is read-only; edit lives in the Person section (notes/sex) and Names section (names). | Not offered; entity-level delete is in Danger zone. | Click profile photo → Media section. |

**Notes:** This is the single entry point for adding a relative. The Relations section no longer carries a duplicate `+ Add relationship` button — see Relations section below.

---

### PersonPanel → Person section
**File:** `src/renderer/components/PersonPanel.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *set* the person's sex, *see* whether they are recorded as living or deceased (a derived read-out from death events), and *write* free-form notes about them.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Sex selector · living/deceased status (read-only chip, derived from death events) · notes textarea | Notes / sex are direct inline inputs. Status is derived — added by recording a death event in the Events section. | Sex select + notes textarea both edit in place; saves on blur/change. | Not offered (the Person itself is deleted from Danger zone). | n/a |

**Notes:** Living/deceased is **derived**, never authored directly here — recording or removing a death event in the Events section flips the chip. This is by design (data fidelity).

---

### PersonPanel → Names section
**File:** `src/renderer/components/PersonPanel.vue`, `PersonNamesSection.vue`, `PersonNameModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* every name this person has gone by (birth name, married names, aliases), *add* a new name, *open* a name to edit it, and *delete* a name — except the birth name, which is protected.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Names table: type chip (birth / married / alias / …) · given · surname · primary marker | `+ Add name` → opens **PersonNameModal** in add mode | Row click → opens **PersonNameModal** with name prefilled | `IconTrash` on row → ConfirmModal → deletes the name entirely. **Disabled** on the birth name (each person has exactly one). | n/a — names have no own panel |

**Notes:** Trash icon (destroy verb): the row's name is gone forever. Birth name protection prevents losing the canonical identity.

---

### PersonPanel → Events section
**File:** `src/renderer/components/PersonPanel.vue`, `EventList.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* events that happened to this person (type · date · place), *add* a new event, *open* an event to edit it, and *delete* an event entirely (citations on it cascade away too).

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| EventList rows: type · date · place | `+ Add event` → **opens EventModal in add mode** (standalone) | Row click → **opens EventModal with event prefilled** (standalone). No inline editing. | `IconTrash` on row → ConfirmModal → deletes the event entirely (citations cascade-deleted) | (Edit covers it; events have no own panel) |

**Notes:** The Citations subsection lives inside EventModal. Trash here is destroy-verb — the event row is gone forever.

---

### PersonPanel → Timeline section
**File:** `src/renderer/components/PersonPanel.vue`, `PersonTimelineSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* the same events from the Events section laid out chronologically, and to *jump* to add a new event.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Read-only chronological list/strip of events sorted by date. Same data as Events section. | `+ Event` chip → routes/scrolls to the Events section's `+ Add event` flow (no second authoring path). | Not offered — authoring lives in the Events section. | Not offered — deletion lives in the Events section. | Row click → opens the same EventModal as the Events section. |

**Notes:** Default-collapsed. Cross-section coupling: this is a derived read of the Events section. Authoring deliberately lives in one place.

---

### PersonPanel → Life Map section
**File:** `src/renderer/components/PersonPanel.vue`, `PersonLifeMapSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* the places of this person's events on a map, and to *jump* to add a new event (which is how a new place ends up on the map).

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Map with pins per resolved event place. Pins computed from event places at render time (gazetteer resolution is never persisted). | `+ Event` chip → routes/scrolls to the Events section. | Not offered. | Not offered. | Pin click → focuses the event in the Events list / opens EventModal. |

**Notes:** Default-collapsed. Cross-section coupling: derived read of the Events section. Pin coordinates are render-time inferences from the place — never written back.

---

### PersonPanel → Relations section
**File:** `src/renderer/components/PersonPanel.vue`, `PersonRelationshipsSection.vue`, `RelationshipModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* who is related to this person and how, *open* a relationship to edit its type / subtype / dates, *unlink* a relation (both persons are kept), and *jump* to the related person.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| RelationshipsList rows: type · subtype · other person (sex badge + name) | Not offered here. Adding a relative is the header's add-relative shortcut row (`+ Father / Mother / Spouse / Child / Sibling`). | Row click → opens **RelationshipModal** in edit mode with type/subtype/dates editable. | `IconUnlink` on row → ConfirmModal: *"Unlink — both persons are kept"* — removes the relationship link only ✅ | Click other person's name → navigates to that Person panel |

**Notes:** Removing the duplicate `+ Add relationship` button (Task 2 of the action-clarity plan) consolidated all "add a relative" entry points into the header shortcuts. Edit is now first-class via row click (Task 6); previously subtype edits required destroy-and-recreate.

---

### PersonPanel → Groups section
**File:** `src/renderer/components/PersonPanel.vue`, `GroupPicker.vue`, `GroupsTable.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* which groups this person is in, *add* this person to a group (existing or new — typed in the same field), and *unlink* this person from a group (the group is kept). Editing the group itself happens on the group's own panel.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| GroupsTable rows: name · members · notes | `+ Add group` → expands inline **GroupPicker** (combobox: existing match → link; no match → "+ Create new 'X'") ⭐ gold standard | Not offered inline; navigate to group's panel | `IconUnlink` on row → unlinks (`groups.removeLink`); group preserved ✅ | Row click → navigates to GroupsView with that group selected |

**Notes:** Cleanest section in the audit. The GroupPicker pattern (link-or-create in one combobox) is the reference pattern for any "Authoring home: Partial" section.

---

### PersonPanel → Media section
**File:** `src/renderer/components/PersonPanel.vue`, `PersonMediaSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* photos and documents linked to this person, *attach* new media files, *mark* one as the profile photo, *reorder* the gallery, and *unlink* a media item from this person (the file is kept; it may still be linked to other persons or events).

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Thumbnail tiles or rows: thumbnail · filename · ★ profile-photo marker · drag handle for reorder | `+ Attach` → opens OS file picker → file is copied into `<dbname>-media/` and linked. | ★ toggle promotes a tile to profile photo; drag-reorder updates `sort_order`. Click tile → opens MediaPanel for full-size + caption editing. | `IconUnlink` on tile → unlinks the media from this person; the file and media row are preserved. | Tile click → MediaPanel for that media. |

**Notes:** Unlink-verb (not destroy): media outlives any one person link. Profile photo is just a per-person flag, not a separate entity.

---

### PersonPanel → Media Timeline section
**File:** `src/renderer/components/PersonPanel.vue`, `PersonMediaTimelineSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* the same media chronologically (by media date or linked event date) — useful when scanning a life story.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Read-only chronological strip of the same media as the Media section. | Not offered — attach lives in the Media section. | Not offered — edit lives in MediaPanel. | Not offered — unlink lives in the Media section. | Tile click → MediaPanel. |

**Notes:** Default-collapsed. Cross-section coupling: derived read of the Media section.

---

### PersonPanel → Research tasks section
**File:** `src/renderer/components/PersonPanel.vue`, `ResearchTasksTable.vue`, `ResearchTaskModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* research tasks for this person, *cycle the status* of a task inline, *add* a new task (tasks aren't shared between people), and *delete* a task entirely.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| ResearchTasksTable rows: priority badge · status chip · task text | `+ Add task` → opens **ResearchTaskFormModal** (standalone). Always create-new. | **Status chip is click-to-cycle inline.** All other fields require navigating to ResearchTasksView (modal there). | `IconTrash` on row → ConfirmModal → deletes task entirely ✅ | Row click → navigates to ResearchTasksView with task selected |

**Notes:** Trash icon (destroy verb) is correct here: tasks are owned by the person, never shared, so "remove from this person" and "delete the task" are the same action. Finding #1 ambiguity is resolved by using `IconTrash` here vs `IconUnlink` for Groups.

---

### PersonPanel → Quality section
**File:** `src/renderer/components/PersonPanel.vue`, `QualityIssuesTable.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *see* derived quality checks for this person (missing parents, contradictory dates, unsourced events, etc.) and to *jump straight* to the section that owns the issue.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| QualityIssuesTable rows: severity badge · issue label · short context. Computed at render time from the current data — never persisted. | Not offered — issues are derived. | Not offered — fix the underlying data in the section the issue points to. | `✕` per row → marks the issue as ignored for this person/issue-key (open exception, see Cross-cutting conventions). | Row click on an actionable issue → routes/expands the matching section (Names, Events, Relations, …). |

**Notes:** Default-collapsed. The `✕` here is neither destroy nor unlink — it's "ignore this issue." Flagged in **Cross-cutting conventions: row icons** as an open exception pending its own icon.

---

### PersonPanel → Danger zone (delete person)
**File:** `src/renderer/components/PersonPanel.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *delete* this person from the database when the record is wrong or duplicate. This is the only place the person itself can be deleted.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Single destructive button under a clearly labeled "Danger zone" header. | n/a | n/a | `Delete person` button → ConfirmModal listing what will cascade (events, names, citations, relationship rows). On confirm: person deleted. | n/a |

**Notes:** Always at the bottom, default-collapsed. Trash-verb cascade: the person and its owned children (names, citations, identifiers, person-attached events with no other participants) are gone for good. Linked entities (places, sources, groups) are preserved.

---

### PlacePanel → Persons section
**File:** `src/renderer/components/PlacePanel.vue` lines 125–138, `PlacePersonsSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* persons who have at least one event at this place. The "+ Add person" button doesn't add a person to the place — it creates a new person *and* an event at this place. There is no way to add an existing person, and no way to remove a person from this list (you'd have to delete their event in the Events section).

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Read-only table: avatar · name · sex · event-count-at-this-place. Derived from `places.getPersons()` | `+ Add person` → opens an in-panel form. **Creates person + event** at this place. No link-existing path. | Not offered (it's a derived summary) | Not offered. Removal requires deleting events in the Events section. | Row click → navigates to person's Person panel |

**Cross-cutting:** Was the canonical example of finding #2 (label hides primitive). Label was tightened in `docs/plans/2026-05-02-panel-action-clarity.md`; the underlying primitive (creates a person *and* an event) is unchanged.

---

### EventModal
**File:** `src/renderer/components/modals/EventModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this modal to *fill in* the details of an event (type, date, place, participants, baptism extras), *cite* sources for the event, *remove* citations, and *save* the result back into the panel's Events section.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| All event fields + a Citations subsection listing existing citations (confidence badge · page · source title) | Event fields are direct inline inputs. Citations: `+ Add citation` → **opens CitationModal as side-by-side subpanel** | Event fields edit in place. Citation row click → **reopens CitationModal with values prefilled** | × on a citation row → ConfirmModal → removes citation (source kept). Event itself is deleted from PersonPanel → Events, not from here. | "Add spouse" affordance for marriage events → opens nested PersonModal subpanel |

**Notes:** Subpanel pattern (`mode="subpanel"`) renders side-by-side rather than stacking. Add-citation deferred-mode is used when the event has no id yet — citations are buffered in component state and persisted after the event is saved.

---

### CitationModal
**File:** `src/renderer/components/modals/CitationModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this modal to *cite* a source for the host fact (event / name / identifier / relationship / place), *picking* an existing source or *creating* a new one in the same flow, *recording* page / confidence / transcription / notes / date accessed, and *editing* either the citation fields or the source itself without leaving the modal.

**Two-row inventory (join + target):**

| Citation (the join) | View | Add | Edit | Delete | Open |
|---|---|---|---|---|---|
| | Two-phase: Phase A (SourcePicker) → Phase B (citation fields + Source sub-header) | Citation always create-new in this modal (saving emits to host). Source within: link-or-create resolved by SourcePicker keystroke flow ⭐ | Citation fields edit in place. Source can be **changed** via "Change source" button (resets to Phase A) | Not offered here (lives at host modal level) | n/a — citations have no own panel |

| Source (the target) | View | Add | Edit | Delete | Open |
|---|---|---|---|---|---|
| | Phase A: SourcePicker dropdown (title + type). Phase B: 📚 sub-header with picked title | "+ Create new 'X'" in SourcePicker → **opens SourceModal as third-level subpanel** | ✎ in source sub-header → **opens SourceModal as third-level subpanel** with source prefilled. Edits commit back without losing in-progress citation fields | **Correctly absent** (would orphan citations) | **Gap.** No "Open in Sources view" link for cross-checking. |

**Notes:** This is the canonical example of a join-entity surface. Three levels of modal nesting (Event → Citation → Source) work without losing in-progress state. The "cite" verb hides the link/create distinction in a way users actually want.

---

### SourceModal
**File:** `src/renderer/components/modals/SourceModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this modal to *create* or *edit* a source — title, type, citation template, repository, notes — and save the result back to whichever modal opened it (or to SourcePanel if opened standalone).

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| All source fields | Direct inline inputs | Direct inline inputs | Not offered (lives on SourcePanel only) | (No further nesting) |

**Notes:** End of the chain in the Person → Citation → Source surface stack.

---

## Surfaces with CTA inventory but no user-stated Purpose

These surfaces have had their code read and their CTA inventory + cross-cutting findings filled in, but their **Purpose** sentence is still pending — it must come from the user (per the `ux-intent-mapping` skill: *"Ask the user, don't pre-fill"*). Fill in Purpose as you touch each surface. Order roughly matches the index above.


### PlacePanel → Place section
**File:** `src/renderer/components/PlacePanel.vue` Place section template
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to see and update how a place is geographically placed — where it sits in the place hierarchy (parent place), whether placement was inferred from a gazetteer (and at what quality), and to override the inferred coordinates with a researched value when needed.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Inline editable fields: name (via PlacePicker merge) · type dropdown · parent-place picker · **lat + long on a single row with a 📍 map-pick button** · resolved gazetteer match (badge + gazetteer + path) · notes textarea with monospace toggle. Type / Parent place / Coordinates each show an extra "Resolved" badge with the gazetteer's value beneath the input when the user hasn't authored a value of their own. | Not applicable (place is the host entity) | All fields edit inline on blur (`saveField` → `places.update`). Name field uses PlacePicker to **merge** another place's name (copies its coords, type, parent_place_id into the current place). The 📍 button toggles a pick-mode banner over the map; the next click anywhere on the map writes lat+long to *this* place. Esc cancels. | Not offered (lives in Danger zone, not yet audited). | Parent-place picker → opens **PlaceTreePickerModal** as subpanel. |

**Notes:** All resolved displays (the badged path AND the per-field "Resolved" hints) are read-only and informational — recomputed every render from current gazetteers, never persisted (Prime Directive). The previous separate Hierarchy section was removed; ancestor and child navigation belongs in PlaceTreePickerModal, reachable from the Parent-place picker.

---

### PlacePanel → Events section
**File:** `src/renderer/components/PlacePanel.vue` lines 140–146, `EventList.vue`, `EventModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *see* every recorded event at this place — births, deaths, marriages, censuses — with the people involved, and to *add* new events here when they discover one in a record.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| EventList rows: event type · date · place · person names (with `showPersons=true` here) · description · cause · citation count badge | `+ Add event` → opens **EventModal in standalone add mode** | Row click → **opens EventModal with event prefilled** (standalone). | ✕ → ConfirmModal → deletes event entirely (citations cascade-deleted). | Place-name link in row → navigates to PlacesView. (Event has no own panel.) |

**Notes:** EventList is reusable; `showPersons` adds person names here vs omitted in PersonPanel.

---

### PlacePanel → Timeline section
**File:** `src/renderer/components/PlacePanel.vue`, `PlaceTimeline.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* the same events from the Events section laid out chronologically — to see clusters, gaps, and the rhythm of what happened at this place over time — and to *jump* to add a new event.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Read-only chronological list of events sorted by date, with dot-per-event-type, dashed dots for approximate dates, gap markers on >20-year jumps, and a separate undated bucket. Same data as the Events section. | `+ Event` chip → routes to the Events section's `+ Add event` flow (no second authoring path). | Not offered — authoring lives in the Events section. | Not offered — deletion lives in the Events section. | Row click → opens the same EventModal as the Events section. |

**Notes:** Default-collapsed. Cross-section coupling: derived read of the Events section. Authoring deliberately lives in one place. Mirror of `PersonPanel → Timeline section` with the person ↔ place axis swapped (person-only concepts dropped: age column, family-tier rendering, birth-first sort priority).

---

### PlacePanel → Media section
**File:** `src/renderer/components/PlacePanel.vue` lines 156–162, `EntityMediaSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *attach* photos and documents that depict this place — a building, a parish church, a farm — and to *order* them so the picture they want as the place's "face" leads, mirroring how each person carries a profile photo.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| EntityMediaSection table: thumbnail · reorder buttons (↑/↓) · title · format · open & delete actions. First media shows "profile" badge. | `+ Attach` → OS file picker (`media.attach`). Link-only. | Reorder only (↑/↓). Title/format don't edit here. | ✕ → ConfirmModal → `removeLink` (media kept; link deleted) ✅ | "Open" button → `media.openFile` (external app). Row click → `/media?open={id}`. |

---

### PlacePanel → Media Timeline section
**File:** `src/renderer/components/PlacePanel.vue` lines 164–170, `MediaTimeline.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *see* the media attached to this place laid out on a timeline — a parish church photographed in 1890 vs 1950, a farm before and after rebuilding — so visual change at the place is legible at a glance, separate from the unordered Media gallery above.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Horizontal scrolling timeline: dated cards with year/year-range · thumbnail · event-type label; undated section below separator. Approximate dates show `~year` and dashed border; range dates show year span and thick border. | `+ Attach` → OS file picker (same as Media section). | Not offered (read-only). | Not offered (delete lives in Media section). | Card click → `/media?open={id}`. |

**Cross-cutting:** Same duplicate `+ Attach` pattern as PersonPanel — finding #3 candidate.

---

### PlacePanel → Quality section
**File:** `src/renderer/components/PlacePanel.vue` lines 172–178, `PlaceChecksSection.vue`, `QualityIssuesTable.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *see* what's missing or inconsistent about this place's record — no coordinates, no parent place, ambiguous gazetteer match — so they know where to direct their next bit of cleanup work.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| QualityIssuesTable: check code · severity · description, derived from `checks.forPlace`. | Not offered. | Not offered. | Not offered. | Issues may emit fix actions to host (none currently wired up for place — verify). |

**Notes:** Section debounces 1.5 s on place change.

---

### SourcePanel → Source section
**File:** `src/renderer/components/SourcePanel.vue` lines 18–107
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Inline form: title · author · type · publication_info · repository · url · call_number · abstract | Not offered (sources are added in CitationModal or standalone via SourceModal). | All fields edit in place with @blur save via `useEditableFields`. Type field saves on @change. | Not offered (lives on Danger zone, not yet audited). | Not offered |

---

### SourcePanel → Citations section
**File:** `src/renderer/components/SourcePanel.vue` lines 109–150, `CitationModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Table: host entity (person / event / relationship / place — clickable when extant) · confidence badge · actions. Empty message if no citations. | `+ Add citation` → **opens CitationModal in standalone mode** (creates a new citation against this source, host entity picked inside). | Row click → **opens CitationModal with citation prefilled** (standalone). | ✕ → ConfirmModal → deletes citation (source kept). | Host-entity link → routes to that entity's panel. |

**Notes:** This is the inverse roll-up of finding #4 — a derived "all citations for this source" surface.

---

### SourcePanel → Repositories section
**File:** `src/renderer/components/SourcePanel.vue` lines 152–189
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Table (when rows exist): repository name. Empty message otherwise. Derived from `repositories.forSource()`. | `+ Add repository` → expands an inline select dropdown of unlinked repositories (filtered set: all repos minus already-linked). Three-button UX: select + Add + Cancel. | Not offered (repository edit happens on its own panel, when one exists). | ✕ → unlinks repository (`repositories.unlinkSource`); repository preserved ✅ | Not offered |

**Cross-cutting:** Three-button select pattern is the only place in the app that does Add this way — not the gold-standard combobox. Finding #3 candidate.

---

### SourcePanel → Media section
**File:** `src/renderer/components/SourcePanel.vue` lines 191–203, `EntityMediaSection.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| EntityMediaSection table: thumbnail · reorder buttons · title · format. First row shows "profile" badge. | `+ Attach` → OS file picker. Link-only. | Reorder only via ↑/↓. | ✕ → unlinks media (media kept). | Row click → MediaPanel. |

---

### SourcePanel → Quality section
**File:** `src/renderer/components/SourcePanel.vue` lines 205–211
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| SectionEmpty placeholder: "No checks configured" (i18n: `sourcePanel.noChecks`). | Not offered. | Not offered. | Not offered. | Not offered. |

**Notes:** Stub. No source-level checks are defined yet.

---

### RelationshipPanel
**File:** `src/renderer/components/RelationshipPanel.vue` lines 1–380, `EventList.vue`, `CitationModal.vue`, `EntityMediaSection.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

**Subsections (expand into their own entries when touched):** Relationship details · Events · Citations · Media.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Relationship details (type · subtype · person 1 · person 2 · notes); EventList; CitationModal-fed citations table; EntityMediaSection. | Events: `+ Add event` → EventModal. Citations: `+ Add citation` → CitationModal (standalone). Media: `+ Attach` → file picker. | Inline blur-to-save on relationship fields; events and citations edit via their modals. | Events: ✕ → ConfirmModal → delete. Citations: ✕ → ConfirmModal → delete (source kept). Media: ✕ → unlinks. | Source title in citation row → SourcesView. (Person 1 / Person 2 links — verify.) |

**Notes:** Mirrors PersonPanel structure (details + events + citations + media). Subsection entries should be split out individually next time someone edits this surface.

---

### GroupPanel
**File:** `src/renderer/components/GroupPanel.vue` lines 1–304, `LinkedPersonsSection.vue`, `LinkedPlacesSection.vue`, `LinkedMediaSection.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

**Subsections:** Group info · Persons · Places · Media.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Info: name · notes. Persons: avatar · name · sex badge. Places: place name. Media: title/type. | Info: not applicable. Persons/Places/Media: `+ Add` → expands picker (link-existing only? — verify combobox vs select pattern per section). | Info: inline blur-to-save. Linked sections: not offered (managed on the linked entity's own panel). | Linked sections: ✕ → unlinks (group kept) ✅. | Persons row → PersonPanel. Places row → PlacesView. Media: not offered. |

**Notes:** Persons subsection uses GroupPicker as its peer (PersonPanel → Groups uses GroupPicker; here the inverse — verify whether the picker pattern is symmetric).

---

### ResearchTaskPanel
**File:** `src/renderer/components/ResearchTaskPanel.vue` lines 1–357, `LinkedPersonsSection.vue`, `LinkedPlacesSection.vue`, `LinkedMediaSection.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

**Subsections:** Task · Persons · Places · Media.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Task (text · status chip · priority · notes · result); Linked Persons / Places / Media as in GroupPanel. | Task fields: not applicable. Linked sections: `+ Add` → expands picker. | Task fields: inline blur-to-save (status via select). Linked sections: not offered. | Linked sections: ✕ → unlinks (entity kept) ✅. | Persons row → PersonPanel. Places row → PlacesView. |

**Notes:** Status field has full select here vs click-to-cycle on PersonPanel → Research tasks.

---

### MediaPanel
**File:** `src/renderer/components/MediaPanel.vue` lines 1–822, `EntityMediaSection.vue`, `MediaChecksSection.vue`, `PersonPicker.vue`, `PlacePicker.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

**Subsections:** Notes · Linked Persons · Face Tags · Linked Places · Linked Events · Quality.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Notes textarea (monospace toggle); Linked Persons (avatar · name); Face Tags (region avatar · person · star button for profile); Linked Places (name); Linked Events (type · date); Quality (MediaChecksSection). | Notes: not applicable. Persons: `+ Link person` → PersonPicker combobox. Face Tags: `+ Draw tag` toggles region editor in viewer. Places: `+ Link place` → PlacePicker combobox. Events: not offered (derived). | Notes: inline blur-to-save. Persons/Places: not offered. Face Tags: click name → PersonPicker in row. | Persons: ✕ → unlinks (person kept; profile pic cache invalidated). Face Tags: ✕ → ConfirmModal → deletes region & assignment. Places: ✕ → unlinks. Events: ✕ → unlinks. | Persons row → PersonPanel. Places row → PlacesView. |

**Notes:** Largest panel. Tagging a person on a region adds a person link if missing. Profile-pic store invalidates on link/unlink/tag changes. Title edits via header inline input.

---

### ReportPanel
**File:** `src/renderer/components/ReportPanel.vue` lines 1–473, `PersonPicker.vue`, `PlacePicker.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

**Subsections:** Subject · Header/Footer · Options · Appearance · sticky actions.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Subject (PersonPicker / couple select / PlacePicker / year input — depends on report type). Header/Footer toggles. Options checkboxes (life map, photos, sources, redact living, etc.). Appearance: orientation · density · generations sliders · per-page select. | Configuration only — not applicable. | All inputs update Pinia store reactively. | Not applicable. | Sticky bar: primary `Print` (emits `print`) and secondary `Export PDF` / `Save SVG` / `Save chart PDF` (emits `export-pdf` / `save-svg` / `save-chart-pdf`). |

**Notes:** Configuration-only panel. Subject UI depends on `activeTab`. Appearance section is context-sensitive (chart vs keepsake).

---

### WebsitePanel
**File:** `src/renderer/components/WebsitePanel.vue` lines 1–218, `PersonPicker.vue`, `PlacePicker.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

**Subsections:** Subject · Scope · Privacy · Include · Site · sticky actions.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Subject: PersonPicker (focus person). Scope: focus / everyone radios + ancestors (1–10) / descendants (1–6) when focus. Privacy: exclude living · redact living · media person-only checkboxes. Include: include media checkbox. Site: site title input. | Configuration only — not applicable. | Inputs update v-models reactively. | Not applicable. | Sticky `Export` button (emits `export`); disabled if `focusPersonId` is null. Surfaces `lastOutput` path on success or `bundleMissing` error hint. |

**Notes:** Configuration-only panel.

---

### ExportOptionsPanel
**File:** `src/renderer/components/ExportOptionsPanel.vue` lines 1–194 (embedded form, **not** an EntityPanel)
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Title field · checkboxes (exclude living · include notes · include sources · include media) · expandable branch filter (PersonPicker + direction radios + generations number). | Configuration only. | Inputs update `opts` and emit `update:options`. | Not applicable. | No CTA here; parent (`GedcomExportSection` on Settings → Export) owns the export button. |

**Notes:** Embedded form, not a side panel — uses unique class `.export-options-panel` (not in `shared.css`). Branch filter is an optional `<details>` collapsible.

---

### PersonModal
**File:** `src/renderer/components/modals/PersonModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Entry-mode toggle (new/existing) · optional other-parent picker · new-person fields (sex · given/surname) · post-save Events & Relationships sections. | Direct inline inputs when creating new; existing-person path uses PersonPicker + subtype picker. Child mode prompts for sex first. | Edit mode (after first save): sex field + sections below. Relationships/events created in nested EventModal subpanel. | Event/relationship deletes happen in nested context; person-level delete lives on PersonPanel → Danger zone. | Opens **EventModal as subpanel** for event add/edit when `savedPersonId` exists. |

**Cross-cutting:** Implements the link-existing pattern via the entry-mode toggle (new vs existing) — a sibling to the GroupPicker / SourcePicker combobox approach.

---

### PersonNameModal
**File:** `src/renderer/components/modals/PersonNameModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Given/surname (required) · name type (birth/married/alias/aka) · conditional date fields (married/name_change) · preferred-name flag (birth only) · nickname · advanced rare fields (qualifier, patronymic base, prefix, suffix, date range — collapsed in `<details>`). | Direct inline inputs; switching to married/name_change on an empty add form prefills given/surname from current displayed name. | Direct inline inputs (same form). | Not offered (deletion lives in PersonPanel → Names section). | (No further nesting) |

**Notes:** Asterisk notation in given_name triggers preferred-name parsing.

---

### PlaceModal
**File:** `src/renderer/components/modals/PlaceModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Name (required) · type dropdown · parent-place picker · latitude/longitude (decimal inputs) · notes textarea. | Direct inline inputs. Parent-place resolved via PlacePicker (link-or-create). | Direct inline inputs (same form, prefilled from `editingPlace`). | Not offered (PlacePanel owns delete). | Parent-place picker → opens **PlaceTreePickerModal** as subpanel. |

---

### PlaceTreePickerModal
**File:** `src/renderer/components/modals/PlaceTreePickerModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Search filter input + dual-mode body: browse-tree (lazy-expand TreeNode components) or flat search-results list (when filter ≥ 1 char). Selected place highlighted. Count label "Showing X of Y". | Browse mode: inline "Add child" form on a parent node (creates + stages). Search mode: no inline-add at root level. | Not offered (picker is read-only selection). | Not offered. | Opens PlaceModal as subpanel for the inline new-place creation. |

**Notes:** Picker, not editor — its CTA is "OK" (confirm selection), not "Save". Teleports into parent BaseSubPanel when nested in another modal, else standalone overlay. Server-paged search with sentinel; selection is staged and only emitted on OK.

---

### RelationshipModal
**File:** `src/renderer/components/modals/RelationshipModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Type segmented (couple / parent_child / sibling / godparent / other) · conditional subtype dropdown · person 1 picker (label depends on type) · person 2 picker · notes textarea · post-save Events section. | Direct inline inputs; person pickers resolve link-or-create via PersonPicker. | Direct inline inputs (same form). | Event deletes in nested EventModal; relationship-level delete lives on RelationshipPanel. | Opens **EventModal as subpanel** for event add/edit when `savedRelationshipId` exists. |

**Notes:** Type selector auto-resets subtype when switching type. Events section only visible after first save.

---

### GroupModal
**File:** `src/renderer/components/modals/GroupModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Name field · notes textarea · post-save Members section: search input (dropdown shows "Add new person" + filtered existing persons, excluding already-added members) + member rows with ✕ remove. | Direct inline inputs (name, notes). Members: search-dropdown combobox — "Add new" at top, existing matches below ⭐ (gold-standard pattern). | Direct inline inputs (name, notes). | ✕ on member row → unlinks (person preserved) ✅ | "Add new person" in members dropdown → opens **PersonModal as subpanel**. |

**Cross-cutting:** Exemplifies the gold-standard combobox add pattern (finding #3 reference).

---

### ResearchTaskModal
**File:** `src/renderer/components/modals/ResearchTaskModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Task (required textarea) · priority segmented (1/2/3) · status segmented (open / in_progress / done / stopped) · notes textarea · result textarea (only when status = done or stopped). | Direct inline inputs. | Direct inline inputs (same form, prefilled from `editingTask`). | Not offered (deletion lives in ResearchTasksTable rows on host panel). | (No further nesting) |

**Notes:** When created from a PersonPanel, auto-links via `researchTasks.addLink(id, 'person', personId)`.

---

### MergePersonsModal
**File:** `src/renderer/components/MergePersonsModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Target (keep) and source (merge) person cards side-by-side: names, birth dates, ID snippets, merge explanation + reasons list, warning text. Read-only preview. | Not offered (merge direction is predetermined: target ← source). | Not offered (preview only). | OK button performs the merge — destructive. Source person is deleted; all its data moves to target; both persons may be renumbered. Save button label flips to "Merging…" during the async call. | (No further nesting) |

**Notes:** Emits `merged` on success, `close` on cancel.

---

### LinkRuleModal
**File:** `src/renderer/components/modals/LinkRuleModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Name · pattern (regex, mono) with inline error · `urlTemplate` (mono) · example input · live preview (✓ Example matches / ✗ No match / ✗ Bad regex) + generated URL · priority. View mode is fully readonly. | Direct inline inputs in `add` mode; live regex validation + URL preview. | Not offered — link rules are managed at SettingsView level with view/add/delete only. | Not offered (delete at SettingsView). | (No further nesting) |

**Notes:** Two modes: `add` (interactive) and `view` (readonly; save button no-ops).

---

### ConfirmModal (generic destructive confirm)
**File:** `src/renderer/components/ConfirmModal.vue`
**Verified:** 2026-05-02

> **Purpose:** _TBD — needs user-stated intent_

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Title + optional icon · message (single paragraph) or messages array (multi-paragraph rendered as `<p>` per item) · tone-styled button (danger=red / warning=yellow / info=blue). Confirm-button label customisable via `confirmLabel`. | Not applicable. | Not applicable. | Confirm button emits `confirm` to host; modal itself doesn't mutate data — host owns the API call. | (No further nesting) |

**Notes:** Generic destruction-confirm modal, reused across most delete paths (EventModal citation rows, PersonPanel event rows, ResearchTasksTable rows, etc.). Visibility controlled by `visible` prop. Tone defaults to `danger` but accepts `info` / `warning` / `danger`.
**Cross-cutting:** Shared across all deletion confirmations; the wording each host passes in is what makes finding #1 (✕ ambiguity) visible — alignment lives in the host's `messages` array, not here.

---

## Format reference card (paste into a new entry)

```markdown
### [Panel] → [Section] section
**File:** [path:line] [, support files]
**Verified:** YYYY-MM-DD

> **Purpose:** A user would use this [surface] to *[verb]* [object] [relation], and to *[verb]* [object]…

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| | | | | |

**Notes:** [optional — anything not captured above]
**Cross-cutting:** [optional — references to findings #1–#4]
```

For join surfaces, expand to two rows in the inventory and label which row is the join and which is the target.

---

## Reference

- `.claude/skills/ux-intent-mapping/SKILL.md` — methodology + consistency rules + triggers
- `.claude/rules/plans.md` — plan format that this inventory enforces against UI plans
- [What is OOUX](https://ooux.com/what-is-ooux), [Introducing ORCA](https://ooux.com/resources/introducing-orca-the-third-diamond-in-your-ux-process) — vocabulary lineage
