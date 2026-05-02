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

---

## Cross-cutting conventions: row icons

These conventions are enforced across every panel section that lists child entities. New sections must follow this split — picking the wrong icon is a data-fidelity hazard, not a cosmetic one.

- **Trash icon** (`IconTrash`) means the action **destroys an entity permanently**. Tooltip: "Delete permanently" (`common.deleteTooltip`). Used for: Names, Events, Research tasks, Citations.
- **Unlink icon** (`IconUnlink`) means the action **removes a connection; both entities are preserved**. Tooltip: "Unlink — both entities are kept" (`common.unlinkTooltip`). Used for: Relationships, Group memberships, Linked media, Linked persons, Linked places, Source repositories.
- The `✕` glyph is reserved for **modal close** only.
- `QualityIssuesTable` is an open exception: it uses `✕` for "ignore this issue" — neither destroy nor unlink. A follow-up plan should give it its own icon.

---

## Surface index

Verification status as of the dates listed. Italicised entries are **TBD** (not yet audited).

### Persons view (`PersonsView` + `PersonPanel`)

| Surface | Verified |
|---|---|
| PersonPanel — Header & add-relative shortcuts | 2026-05-02 |
| PersonPanel — Person section (sex/status/notes) | 2026-05-02 |
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
| PlacePanel — Place section | _TBD_ |
| PlacePanel — Persons section | 2026-05-02 |
| PlacePanel — Events section | _TBD_ |
| PlacePanel — Citations section | _TBD_ |
| PlacePanel — Media section | _TBD_ |
| PlacePanel — Media Timeline section | _TBD_ |
| PlacePanel — Quality section | _TBD_ |
| PlacePanel — Address section | _TBD_ |
| PlacePanel — Hierarchy section | _TBD_ |

### Sources view (`SourcesView` + `SourcePanel`)

| Surface | Verified |
|---|---|
| SourcePanel — Source section | _TBD_ |
| SourcePanel — Citations section | _TBD_ |
| SourcePanel — Repositories section | _TBD_ |
| SourcePanel — Media section | _TBD_ |
| SourcePanel — Quality section | _TBD_ |

### Other panels

| Surface | Verified |
|---|---|
| RelationshipPanel | _TBD_ |
| GroupPanel | _TBD_ |
| ResearchTaskPanel | _TBD_ |
| MediaPanel | _TBD_ |
| ReportPanel | _TBD_ |
| WebsitePanel | _TBD_ |
| ExportOptionsPanel | _TBD_ |

### Modals (live in `src/renderer/components/modals/`)

| Surface | Verified |
|---|---|
| EventModal | 2026-05-02 |
| CitationModal | 2026-05-02 |
| SourceModal | 2026-05-02 |
| PersonModal | _TBD_ |
| PersonNameModal | _TBD_ |
| PlaceModal | _TBD_ |
| PlaceTreePickerModal | _TBD_ |
| RelationshipModal | _TBD_ |
| GroupModal | _TBD_ |
| ResearchTaskModal | _TBD_ |
| MergePersonsModal | _TBD_ |
| LinkRuleModal | _TBD_ |
| ConfirmModal (generic destructive confirm) | _TBD_ |

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

## TBD surfaces

The remaining ~30 surfaces in the index above haven't been audited under this lens yet. As you touch them, fill in their entries here following the format of the verified ones, and bump their entry in the index above.

When in doubt about format, use the **Format reference card** at the bottom of `.claude/skills/ux-intent-mapping/SKILL.md`.

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
