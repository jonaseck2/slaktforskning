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

## Project-specific consistency checks

### The `+` check

This app's gold-standard Add pattern is the inline combobox: `GroupPicker.vue` and `SourcePicker.vue` (used inside `CitationModal.vue`). One field, one keystroke flow, resolves to *link existing* or *create new* based on whether the typed string matches.

- New `+ Add` affordances should match this pattern when authoring the entity is shared with another view (groups, sources, places).
- Force a modal only when create needs more fields than a name (research tasks, persons with parents, citations with confidence/page).
- If a new section uses `+ Add X` and forces a modal where a combobox would resolve, push back.

### The `✕` check

Known violation in current code: the same `✕` button means *unlink* in `GroupsTable` but *delete* in `ResearchTasksTable`. Same icon, opposite blast radius. Genealogists fear data loss; this is exactly the surprise to prevent.

- New surfaces must either align (✕ always = unlink; entity-level delete lives only on the entity's own panel) or differentiate visibly (✕ for unlink + 🗑 for destroy; "Remove from this person" vs "Delete task").
- The ConfirmModal copy must say what's being kept and what's being lost in concrete entity words. `PersonRelationshipsSection.vue` is the canonical example: *"the persons are kept"* is in the confirmation message.

### The label-hides-the-model check

`PlacePanel.vue` → Persons section's `+ Add person` doesn't add a person to a place — it creates a person *and* an event at the place. The label says one thing; the primitive does another.

- A Purpose sentence with the word "wait" or a parenthetical ("…actually it's an event") in it = this anti-pattern.
- Either rename the affordance to the actual primitive (`+ Event with a person at this place`) or build the implied verb (a real "link existing person to this place" path that creates an event under the hood). Don't propagate the shape.

### The "no read across" check

A user wanting to audit *all* citations on a person has no surface — citations are nested two clicks deep per event. Compute-on-render derived sections (read-only, no Add/Edit) are cheap and often missing. If the model supports a roll-up the user can't see, flag it.

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
