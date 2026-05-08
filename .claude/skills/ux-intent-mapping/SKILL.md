---
name: ux-intent-mapping
description: Use BEFORE writing or editing any bounded UI surface in the renderer — a panel section in `src/renderer/components/*Panel.vue`, a modal in `src/renderer/components/modals/*`, or a nested sub-modal. Forces a one-sentence Purpose statement in the user's words and a CTA inventory across View/Add/Edit/Delete/Open. Catches the app's known UX inconsistencies (✕ means unlink in one section and delete in another; `+ Add person` on Place panel hides the actual primitive). Triggers on requests like "add a section to X panel", "redesign Y", "make Z consistent", and on plans in `docs/plans/` that open with mechanism instead of user intent. Lean specialization — defers to `superpowers:brainstorming` for net-new intent and to project `frontend-design` for the implementation HOW.
---

# UX Intent Mapping (Släktforskning)

A lean intent-and-consistency check for this app's panels and modals. Vocabulary borrowed from OOUX/ORCA — see [ooux.com/what-is-ooux](https://ooux.com/what-is-ooux) and [Introducing ORCA](https://ooux.com/resources/introducing-orca-the-third-diamond-in-your-ux-process). This skill does **not** restate the framework; it specializes it for this codebase.

## The persisted output lives in `docs/UX_INVENTORY.md`

This skill is the **lens**; `docs/UX_INVENTORY.md` is the **persisted output** — every surface's Purpose sentence, CTA inventory, and consistency notes, dated. **Read the relevant entry before touching a surface.** **Update the entry after.** When the doc and the running app disagree, the app is the truth — fix the doc.

The inventory also tracks cross-cutting findings (the `✕` ambiguity, label-hides-primitive cases, missing roll-up surfaces) — when adding a new surface, check the open findings to avoid propagating them.

## Two artefacts per bounded surface

For every panel section, modal, or sub-modal you're about to change, write down:

1. **Purpose** — one sentence in the user's words:
   > *A user would use this [surface] to [verb] [concrete object] [relation to the panel entity], and to [verb] [object]…*

2. **CTA inventory** — small grid:

| View | Add | Edit | Delete | Open |
|---|---|---|---|---|
| What's on each row | Create new, link existing, or both? Inline / picker / modal? | Inline / modal / opens entity's panel / not allowed | Unlinks only / deletes / either — visible to the user? | Navigates to entity's own panel? |

A verb that crosses the surface boundary is one cell, annotated `→ opens [next surface]` or `→ navigates to [panel]`. The next surface gets its own Purpose + grid. **Never span surfaces with one Purpose** — it always loses user-orientation.

When the surface is a join (Person→Citation→Source, Person→Group-membership→Group), apply the inventory **twice in one row** — once for the join, once for the target. See `CitationModal.vue` for the canonical pattern.

## Ask the user, don't pre-fill

The user writes the Purpose sentence. Ask: *"Before we change [surface], in one sentence: what would a user use this to do?"* Wait for their wording.

If writing the sentence stutters ("a person — wait, an event"), the surface is mismodeled. The stutter IS the diagnostic; fix the model, not the sentence.

For genuinely new surfaces with no stated intent, defer to `superpowers:brainstorming` first; come back here once the user has stated intent in plain words.

## Language

Write the Purpose sentence, the inventory cells, and the inventory file entries in **English**. UI labels visible to end users are localized via i18n and may render in Swedish in the running app, but everything in `docs/`, `src/`, and conversation about them stays English. When referring to a section, use its English name even if the running UI shows a Swedish translation.

## Concrete objects (use these, never "data" or "items")

This app's user-facing objects: **person, place, source, citation, event, name, identifier, relationship, group, research task, media**. The Purpose sentence must use one of these. If a section talks about "data" or "items", it's not been thought through.

## Surface Contract — the four checks

This is a hard rule from CLAUDE.md (project-defining; broken UX is recoverable, broken data isn't, but the failure mode this guards against has shipped twice while passing lint/unit tests/`panel-cta-conventions.test.ts`). Apply on every `<SectionHeader … :action-label="…" @action="…" />` in any `*Panel.vue` you touch. Do this before claiming the work is done — read the actual code, don't trust the `docs/UX_INVENTORY.md` ✅ marker.

The genealogist thinks **surface-first**: they're "on a place," "on a person," "in a source." When they're on a surface, every action they take should bring the surface's host entity with it. They should never have to re-state what they already chose by being where they are, and they should never reach a CTA whose label lies about what its handler does.

### Check 1 — Did the host entity flow in?

The panel is hosted on entity X (place, person, source, media). Whatever the action opens — modal, picker, inline form — must receive X as a default.

**Concrete check:** trace the `@action` handler to the modal it opens. Search the modal call site for `:default<X>Id="…"` (or equivalent prop). If the genealogist had to re-pick a value the surface already implied, the host was lost.

### Check 2 — Does the handler deliver the primitive named in the section title?

Two failure modes:

- **Title mismatch (label lie).** Section title says primitive X, handler creates Y. Section "Persons" with `+ Event` adds an event, not a person. Rewire the CTA to a real `+ Person` flow, or remove the CTA if this section is a derived view and the canonical Add path lives in a sibling section.
- **Duplicate-of-canonical on a derived view.** A sibling section is the canonical Add path for the primitive, and this section is just a different rendering of the same data. `MediaTimeline + Media` was this — the Media section already adds; the timeline view doesn't need its own Add. Ship the Add only on the canonical section.

**What's *not* a failure:** sibling sections that are different views of the same primitive each carrying their own `+ X` CTA (PersonPanel's Events ↔ Timeline ↔ Life Map all view the `event` table — three `+ Event` buttons is convenience, because each header truthfully describes what gets added).

### Check 3 — Can the user edit and remove (a) what each section's CTA adds, AND (b) the panel's host entity itself?

Two levels:

- **Section-level lifecycle.** For each section that adds a primitive, the user must also see/edit/remove that primitive on the same surface (row click → edit modal, trash icon → confirm dialog). Read-only summary tables are fine when their data origin is signposted (PlacePanel's Persons section is derived from events) and the path back to the source of truth is reachable; opaque add-only sections aren't.
- **Host-level lifecycle.** The panel must offer a way to delete the entity it's hosted on — a Danger-zone button at the bottom with `IconTrash` + an entity-typed label and a `ConfirmModal` cascade summary, mirroring `PersonPanel.vue`'s `panel-danger-zone`. A panel that lets the user create or edit an entity but offers no delete from this surface strands the user.

### Check 4 — No silent degradation across state

A surface that offers something in one state must keep offering it (or signal the change explicitly) in adjacent states. If a picker shows DB rows + gazetteer suggestions when empty, filtering must still query both — typing narrows what's *displayed*, never what's *queried*. If `+ Media` works when the section is open, it works when collapsed (even if the handler must expand the section first).

**Test:** walk the user's task as a sequence of states (`empty → typed`, `open → collapsed`, `first save → reopen`); at each transition, ask whether state B still offers everything state A did. If features drop quietly between A and B, that's the bug.

### Past failures this rule was written against

These all passed lint, unit tests, and `panel-cta-conventions.test.ts`. The genealogist found each by clicking. That's the bar this section lifts.

| Failure | Check it failed |
|---|---|
| `PlacePanel + Add person` created a person with no link to the place — orphan | #1 (host place_id never flowed into the modal) |
| `MediaTimeline + Media` was a duplicate of the Media section's attach handler | #2 (derived view duplicating canonical Add) |
| Five panels (Place, Source, Media, Group, ResearchTask) had no host-level delete affordance — places had no UI delete path at all | #3 (host-level lifecycle) |
| Place picker filter excluded gazetteer suggestions when the user typed | #4 (silent scope loss between empty and typed states) |
| `+ Media` on a collapsed Media section silently no-op'd because the handler depended on a child component behind `v-if` | #4 (silent degradation between open and collapsed states) |

All five were marked ✅ resolved in `docs/UX_INVENTORY.md` while the bugs still shipped, or passed `panel-cta-conventions.test.ts` — which checks label shapes and verb glyphs but **cannot see** whether handlers wire the host entity into modals or whether collapsing a section breaks an action.

### Pre-commit checklist for any panel-touching change

Before claiming a panel change done — even one as small as adding a CTA or relabeling a section header:

1. **Walk every `<SectionHeader>` in the touched file** (and the section components it hosts). For each `@action` handler, run checks #1–#4 above.
2. **Read the modal it opens.** Search the modal's call site for `:default<HostEntity>Id`. If the prop isn't there, check #1 fails.
3. **Walk the lifecycle.** For each primitive the section adds, can the user edit it from this panel? Delete it? Is there a Danger-zone delete for the panel's own host entity?
4. **Walk the states.** Empty → typed for any picker. Open → collapsed for any section with an action. First save → reopen for any modal that creates a child entity.
5. **Update `docs/UX_INVENTORY.md`** to reflect what the *code* now does, not what you intended. The doc tracks intent; the running app is the truth. Fix the doc to match the code, not the other way around.

## Project-specific consistency checks

### The `+` check

This app's gold-standard Add pattern is the inline combobox: `GroupPicker.vue` and `SourcePicker.vue` (used inside `CitationModal.vue`). One field, one keystroke flow, resolves to *link existing* or *create new* based on whether the typed string matches.

- New `+ Add` affordances should match this pattern when authoring the entity is shared with another view (groups, sources, places).
- Force a modal only when create needs more fields than a name (research tasks, persons with parents, citations with confidence/page).
- If a new section uses `+ Add X` and forces a modal where a combobox would resolve, push back.

### The `✕` check

Closed by the `2026-05-02-panel-cta-cleanup` plan and now enforced by `tests/components/panel-cta-conventions.test.ts`: raw `&#10005;` glyphs are forbidden in `*Panel.vue` / `*Section.vue`; use `IconUnlink` / `IconTrash` per verb. The `✕` glyph is reserved for modal close affordances in `src/renderer/components/modals/`.

- New surfaces must either align (`IconUnlink` for unlink; entity-level delete lives only on the entity's own panel as `IconTrash`) or differentiate visibly (separate icons + labels: "Remove from this person" vs "Delete task").
- The ConfirmModal copy must say what's being kept and what's being lost in concrete entity words. `PersonRelationshipsSection.vue` is the canonical example: *"the persons are kept"* is in the confirmation message.

### The label-hides-the-model check

`PlacePanel.vue` → Persons section's `+ Add person` doesn't add a person to a place — it creates a person *and* an event at the place. The label says one thing; the primitive does another.

- A Purpose sentence with the word "wait" or a parenthetical ("…actually it's an event") in it = this anti-pattern.
- Either rename the affordance to the actual primitive (`+ Event with a person at this place`) or build the implied verb (a real "link existing person to this place" path that creates an event under the hood). Don't propagate the shape.

### The "no read across" check

A user wanting to audit *all* citations on a person has no surface — citations are nested two clicks deep per event. Compute-on-render derived sections (read-only, no Add/Edit) are cheap and often missing. If the model supports a roll-up the user can't see, flag it.

## CTA conventions (enforced by `tests/components/panel-cta-conventions.test.ts`)

These rules survived the `2026-05-02-panel-cta-cleanup` plan and are now regression-tested by the source-level scan in `tests/components/panel-cta-conventions.test.ts`. If you add a new pattern that this test should cover, extend the test there — don't carry the rule only in this file.

### Glyph → verb mapping (panels and sections, NOT modal close)

| Glyph / icon | Verb | Use when |
|---|---|---|
| `<IconUnlink :size="14" />` | unlink | Action severs a link/relationship; the entity stays in its own list |
| `<IconTrash :size="14" />` | delete | Action removes the row from the database |
| `<IconPencil :size="12" />` | edit/reassign | Action opens an inline editor or picker on a row |
| Raw `&#10005;` (✕) | **modal close only** | Only allowed inside `src/renderer/components/modals/` for the close affordance. Forbidden in `*Panel.vue` and `*Section.vue` (test asserts this). |

`aria-label` and `:title` must match the verb: `a11y.unlinkItem` + `common.unlinkTooltip` for unlink; `a11y.deleteItem` + `common.deleteTooltip` for delete; `a11y.editItem` + a context-specific title for edit.

### No dead clicks

If a row has `cursor: pointer`, `role="button"`, `tabindex="0"`, or `class="clickable-row"`, it must have a wired click handler that does something user-visible. Tables that emit `select` (`GroupsTable`, `ResearchTasksTable`) require a `@select=` listener at every mount site (test enforces). If you add a new select-emitting table, add it to `SELECT_EMITTING_TABLES` in the test.

### No hardcoded mode in section-header buttons

A section-header `actionLabel` of "+ Add X" must open a picker/modal for X without preset to a sub-mode. PersonPanel's old "+ Add relationship" silently picked spouse — that pattern is forbidden. If a header button needs to open a multi-mode flow, either drop the header button (rely on per-mode buttons) or open a role/type picker first.

### Confirm-modal symmetry

The same verb (e.g. unlink-from-group) uses the same confirmation flow across panels. PersonPanel, GroupPanel, and ResearchTaskPanel all route their unlinks through `useDeleteConfirm` + `<ConfirmModal>`. Asymmetric flows for the same verb are a CTA bug.

### Cross-entity navigation IS allowed; same-entity in-place editing is the rule

Per `.claude/rules/renderer.md`: clicking a related entity inside a panel routes to that entity's list view (which auto-opens its panel) — this is the canonical pattern.

But: clicking a sub-entity that lives in *the panel's own context* (e.g. a research task on a person panel, a face tag on a media panel) opens in-place — modal or inline edit — never navigates the user away. The test for "is this same-entity?": if the sub-entity is created via this panel's own "+ Add X" button, its row click must open the same modal that "+ Add X" opens, in edit mode. (See `openTaskFromRow` in PersonPanel/PlacePanel for the canonical shape.)

## Triggers

- Plans or tasks touching `src/renderer/components/*Panel.vue`, `src/renderer/components/modals/*`, or any `*Section.vue` rendered inside a panel.
- Requests: "add a section to X panel", "redesign Y", "make Z consistent", "the panel feels wrong", "users are confused about Q".
- Before invoking `add-feature` for any new entity that will get a panel section.
- When reading a plan in `docs/plans/` that names files/composables before naming user intent — fire this skill and challenge back to user-intent first (per `.claude/rules/plans.md`).

## What to do

1. Identify the bounded surface. Don't span.
2. Ask the user for the Purpose sentence. Wait for their wording.
3. Write it down verbatim. Read it back to confirm verbs and concrete objects.
4. Fill the CTA inventory by **reading the current code** (`*Section.vue`, `*Panel.vue`, modal file). Components evolve — don't rely on memory.
5. Run the `+`, `✕`, label-hides-model, and no-read-across checks against sibling surfaces.
6. Surface gaps: a verb in the Purpose with no cell, or a cell with no verb in the Purpose, is a bug — decide which to fix.
7. Hand off to project `frontend-design` for the HOW. Purpose + inventory + consistency findings are the brief.

## Anti-patterns this skill rejects

- "Let me just add the section, we'll figure out behaviour later." Behaviour IS the section.
- Pre-filling the Purpose sentence for the user.
- One Purpose spanning a section AND its modal — always recurse.
- Mechanism-first plan headlines on UI plans (per `.claude/rules/plans.md`).
- Adding a verb to one surface without auditing siblings.
- Using vitest as Purpose verification — tests can't tell whether the user can do what they came to do.

## Doesn't apply when

- Non-UI work (`src/api/`, `src/mcp/`, gazetteers, scripts, schema migrations).
- Layout / visual / "looks wrong" bugs — use `dom-first-debugging`.
- Pure renames, type-only changes, lint cleanups in an existing surface that don't change visible verbs.
- Internal refactors that preserve every CTA exactly.

## Sibling skills (compose with these)

- `superpowers:brainstorming` — explore intent for genuinely new surfaces; come back here once stated.
- `frontend-design` (project) — implementation patterns once Purpose is defined; this skill writes the brief, that one writes the components.
- `a11y` (project) — accessibility gates for any new interactive surface; always run alongside.
- `dom-first-debugging` — visual-bug sibling; different problem, same first-truth-then-reason discipline.
- `add-feature` — full vertical for a new entity; this skill should fire for the panel-section step.

## Verification

The next plan in `docs/plans/` that touches a `*Panel.vue` or modal: each affected surface gets a Purpose sentence somewhere in the plan body, in the user's words. If a plan ships opening with mechanism instead of Purpose, this skill didn't fire — re-read this file and tighten the trigger.
