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

### 1. The `✕` button means different things in different sections

| Section | What `✕` does | Status |
|---|---|---|
| `GroupsTable` (Person → Groups) | Unlinks the person from the group; group itself is preserved | ✅ correct |
| `PersonRelationshipsSection` | Unlinks the relationship; both persons preserved (confirmation message says so) | ✅ correct |
| `ResearchTasksTable` (Person → Research tasks) | **Deletes the task entirely** | ⚠️ inconsistent — same icon, opposite blast radius |

**Fix direction (proposed, not yet applied):** either align (`✕` always = unlink; entity-level delete lives only on the entity's own panel) or differentiate visibly (`✕` for unlink + 🗑 for destroy; copy says "Remove from this person" vs "Delete task"). Genealogists fear data loss; this needs alignment.

### 2. Some `+ Add` labels hide the actual primitive

| Section | Label says | Actually does |
|---|---|---|
| `PlacePanel` → Persons | `+ Add person` | Creates a person *and* an event at this place — there is no link-existing-person path |
| `PersonPanel` → Relations | `+ Add relationship` | Creates a brand-new person + relationship — there is no link-to-existing-person path |

**Fix direction:** either rename the affordance to the actual primitive ("+ Event with a person at this place"), or add the implied verb (a real "link existing X" path) so the label doesn't lie.

### 3. The `+ Add` UX is inconsistent across siblings

The gold-standard pattern is `GroupPicker` / `SourcePicker`: an inline combobox that resolves the same keystroke flow into either *link existing* or *create new*. Sections that match: Groups (uses `GroupPicker`), CitationModal (uses `SourcePicker`).

Sections that *don't* match and should be reviewed: Research tasks (modal-only, no link path), Relations (modal-only, no link path), Place → Persons (form-only, no link path).

### 4. No "all citations for this person" surface

Citations on a Person are nested two clicks deep (Event row → EventModal → Citations subsection). A user wanting to audit every source they've cited for a person has no entry point. The model supports it; the panel doesn't surface it. Candidate: a derived read-only Citations section under PersonPanel.

### 5. External identifiers are not surfaced in any panel

External identifiers (FamilySearch ID, Geni ID, Ancestry ID, Riksarkivet ID, personnummer, REFN, RIN, etc.) are not surfaced in any panel. They round-trip through GEDCOM/Holger/Genney import and export only. The data layer (`person_identifiers` table, `addIdentifier` / `getIdentifiers` / `deleteIdentifier` API, IPC, MCP) is fully wired so importers and exporters preserve them; nothing in the UI reads or writes them.

---

## Surface index

Verification status as of the dates listed. Italicised entries are **TBD** (not yet audited).

### Persons view (`PersonsView` + `PersonPanel`)

| Surface | Verified |
|---|---|
| PersonPanel — Header & add-relative shortcuts | _TBD_ |
| PersonPanel — Person section (name/sex/notes summary) | _TBD_ |
| PersonPanel — Names section | _TBD_ |
| PersonPanel — Events section | 2026-05-02 |
| PersonPanel — Timeline section | _TBD_ |
| PersonPanel — Life Map section | _TBD_ |
| PersonPanel — Relations section | 2026-05-02 |
| PersonPanel — Groups section | 2026-05-02 |
| PersonPanel — Media section | _TBD_ |
| PersonPanel — Media Timeline section | _TBD_ |
| PersonPanel — Research tasks section | 2026-05-02 |
| PersonPanel — Quality section | _TBD_ |
| PersonPanel — Danger zone (delete person) | _TBD_ |

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
| PersonIdentifierModal | _TBD_ |
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

### PersonPanel → Events section
**File:** `src/renderer/components/PersonPanel.vue` lines 80–86, `EventList.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* events that happened to this person (type · date · place), *add* a new event, *open* an event to edit it, and *remove* an event from this person.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| EventList rows: type · date · place · citation count badge | `+ Add event` → **opens EventModal in add mode** (standalone) | Row click → **opens EventModal with event prefilled** (standalone). No inline editing. | × on row → ConfirmModal → deletes the event entirely (citations cascade-deleted) | (Edit covers it; events have no own panel) |

**Notes:** Citations show only as a count badge here; the Citations subsection lives inside EventModal (next surface).

---

### PersonPanel → Relations section
**File:** `src/renderer/components/PersonPanel.vue` lines 112–118, `PersonRelationshipsSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* who is related to this person and how, *remove* a wrong relation (the persons are kept), and *add* a relation — currently only by creating a brand-new relative, never by linking someone already in the tree. Editing the type or subtype of an existing relation is not offered.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| RelationshipsList rows: type · subtype · other person (sex badge + name) | `+ Add relationship` → opens **AddRelativeModal** preset to spouse. **Always create-new**; no link-existing path. | **Not offered.** Subtype/date can't be changed without destroy-and-recreate. | ✕ → ConfirmModal explicitly says *"the persons are kept"* — unlinks only ✅ | Click other person's name → navigates to that Person panel |

**Cross-cutting:** Hits finding #2 (label hides primitive) and finding #3 (no combobox-link pattern).

---

### PersonPanel → Groups section
**File:** `src/renderer/components/PersonPanel.vue` lines 120–135, `GroupPicker.vue`, `GroupsTable.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* which groups this person is in, *add* this person to a group (existing or new — typed in the same field), and *remove* this person from a group (the group is kept). Editing the group itself happens on the group's own panel.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| GroupsTable rows: name · members · notes | `+ Add group` → expands inline **GroupPicker** (combobox: existing match → link; no match → "+ Create new 'X'") ⭐ gold standard | Not offered inline; navigate to group's panel | ✕ → unlinks (`groups.removeLink`); group preserved ✅ | Row click → navigates to GroupsView with that group selected |

**Notes:** Cleanest section in the audit. The GroupPicker pattern (link-or-create in one combobox) is the reference pattern for any "Authoring home: Partial" section.

---

### PersonPanel → Research tasks section
**File:** `src/renderer/components/PersonPanel.vue` lines 153–161, `ResearchTasksTable.vue`, `ResearchTaskModal.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* research tasks for this person, *cycle the status* of a task inline, *add* a new task (always created here; tasks aren't shared between people), and *delete* a task entirely. The same `✕` icon means "remove from this person" in Groups but "delete the task" here.

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| ResearchTasksTable rows: priority badge · status chip · task text | `+ Add task` → opens **ResearchTaskFormModal** (standalone). Always create-new — no link-existing path. | **Status chip is click-to-cycle inline.** All other fields require navigating to ResearchTasksView (modal there). | ✕ → ConfirmModal → **deletes task entirely** ⚠️ | Row click → navigates to ResearchTasksView with task selected |

**Cross-cutting:** Hits finding #1 (✕ ambiguity vs Groups) and finding #3 (no combobox-link pattern, but link-existing is arguably not a real user need for tasks).

---

### PlacePanel → Persons section
**File:** `src/renderer/components/PlacePanel.vue` lines 125–138, `PlacePersonsSection.vue`
**Verified:** 2026-05-02

> **Purpose:** A user would use this section to *view* persons who have at least one event at this place. The "+ Add person" button doesn't add a person to the place — it creates a new person *and* an event at this place. There is no way to add an existing person, and no way to remove a person from this list (you'd have to delete their event in the Events section).

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| Read-only table: avatar · name · sex · event-count-at-this-place. Derived from `places.getPersons()` | `+ Add person` → opens an in-panel form. **Creates person + event** at this place. No link-existing path. | Not offered (it's a derived summary) | Not offered. Removal requires deleting events in the Events section. | Row click → navigates to person's Person panel |

**Cross-cutting:** Canonical example of finding #2 (label hides primitive). The button label says "person" but the underlying primitive is "event mentioning a person".

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
