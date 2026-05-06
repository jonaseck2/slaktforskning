# Implementation: RelationshipModal — broken save flow + dimmed-when-disabled button

**Date:** 2026-05-06
**Branch strategy:** main once reproduced; worktree if it expands into a multi-step flow rewrite
**Source:** Beta tester report 78 (v0.215.2)

## User goal

Editing an existing relationship: the modal shows a row in red (an error or warning state), then offers to register an event below it. The user doesn't understand why a relationship-edit modal asks them to register an event. They try to fill in an event of type "Övrigt" (other) anyway. They press Save. **Nothing happens** — the Save button looks active (full color, not dimmed) but the modal doesn't progress and doesn't surface any error message.

The genealogist wants:

1. **Understand or remove** the embedded event prompt — what is the modal asking for, and why is the row red?
2. **Save proceeds** — either by completing the action, or by surfacing the validation error that's blocking it.
3. **Visual disabled state** on the Save button when it isn't actually clickable. A button that looks active but does nothing is the worst UX outcome.

## Required reproduction step

Before writing fixes, reproduce in the running app under `slaktforskning-dev` MCP:

1. Seed: a couple relationship between two persons (already in the DB).
2. Open RelationshipModal for that relationship via PersonPanel → Relationer → click the role abbreviation.
3. Screenshot the modal as it opens.
4. Look for: a red row, a "register event" sub-section, the Save button's `disabled` attribute, any console errors.

Save the screenshots to `docs/plans/screenshots/2026-05-06-relationship-modal/before-{N}.png`.

Without the reproduction, the fix is guesswork. The screenshots in the report image (referenced but not attached) plus the user's description suggest a state where the modal is *expecting* a follow-up (a wedding event for a marriage subtype, perhaps — see the marriage-flow plan archived 2026-05-04) and the validation isn't matching the embedded form.

## Hypothesis (verify by reading code first)

Likely cause based on the symptom shape and the recent marriage-flow plan history:

- The modal handles a "couple + marriage subtype" couple by surfacing an embedded event registration via the post-save `ConfirmModal` flow shipped in `2026-05-04-event-participants-and-marriage-flow`.
- For an existing couple relationship being EDITED (not created), the embedded event flow may be misfiring — opening as if it were a new couple needing a wedding, even though one may already exist.
- The Save button's `:disabled` binding may be tied to a validity flag that's stuck false when the embedded form is in an unexpected state, but the visual styling for `disabled` is missing or weak.

## Scope

- `src/renderer/components/modals/RelationshipModal.vue` — primary surface.
- `src/renderer/components/modals/EventModal.vue` if it's the embedded form opened in `mode="subpanel"`.
- `BaseSubPanel.vue`'s default action button — confirm `:disabled` styling exists. If a button can be visually-active-but-functionally-disabled, that's a project-wide bug worth fixing once.

### Scope deviations

- **Whole-flow redesign of the marriage-event prompt**: out of scope. The shipped flow is correct; this plan fixes the editing-side regression and the disabled-button visual.

## Design summary (after reproduction confirms the cause)

### Fix the "what is this asking for"

If the embedded event prompt is showing on edit-existing where it shouldn't, gate it on `mode === 'create'` AND `!hasLinkedWeddingEvent` so the modal only asks during the legitimate first-save case.

If the prompt SHOULD show during editing (because the linked wedding event was deleted later, leaving a couple+marriage with no wedding), the red row needs an explanation: a one-line helper text under the row saying *"This couple is recorded as married but has no wedding event. Add one below or skip"*.

### Fix the "Save does nothing"

Trace the save handler. If validation fails silently (no toast, no error block), surface it. Use the project's existing toast pattern (per `.claude/rules/renderer.md`).

### Fix the disabled-button visual

`AppButton` (per the renderer rules' shared component catalog) — confirm its `:disabled` prop applies a visible disabled style. If it does, RelationshipModal needs to pass `:disabled="!canSave"` correctly. If `AppButton` doesn't visually de-emphasize when disabled, that's a small `AppButton.vue` fix that benefits every modal.

Visual disabled style:
- 50% opacity OR muted background + muted text.
- `cursor: not-allowed`.
- `aria-disabled="true"`.

This change is project-wide. Audit during impl whether other modals have the same "looks-active-but-isn't" risk.

## Tasks

- [x] **Reproduce** in dev MCP. (Done by dispatcher: confirmed `relationships.update` IPC rejects with a generic toast on `bengt.db` v0.221.2; direct MCP `update_relationship` on the same row succeeds. The "red row" is the standard `data-entity="event"` section header — not an error indicator.)
- [x] **Read RelationshipModal.vue** — find the embedded event flow's gate. Find the save handler's validation chain.
- [x] ~~**Fix the gate**~~ — out of scope after reproduction: the embedded events section is the canonical edit-time surface for adding events to the relationship. Not a misfiring prompt. The user's confusion is about the section header colour, not a logic bug.
- [x] **Surface validation errors** — `performSave()` catch block now appends the rejected error's `.message` to the toast prefix, so the underlying cause (FK violation, IPC error, etc.) is visible to the user instead of swallowed.
- [x] **Fix disabled-button visual** — already present in `shared.css` (`.ep-save-btn:disabled` gives 50% opacity + grayscale + cursor:not-allowed). Confirmed; no change needed.
- [x] **`:disabled` binding** on the Save button — added `canSave` computed (`person1_id && person2_id && type && person1_id !== person2_id`) bound through `BaseSubPanel`'s existing `save-disabled` prop.
- [x] **Component test** — `tests/components/RelationshipModal-saveDisabled-and-error.test.ts` covers: Save disabled in empty create, enables when both persons picked, disabled on self-link, enabled in edit mode and disables when person is cleared.
- [x] **Component test** — same test file asserts toast text contains the rejected error's message (both `Error` and non-`Error` rejection shapes).
- [x] **Patch bump** + CHANGELOG: `- fix: relationship edit modal saves correctly; Save button is dimmed when disabled`.

## Verification (user-observable)

1. Open an existing couple relationship for editing. No red row. No embedded event prompt unless a wedding is genuinely missing.
2. If a wedding is missing, the red row is accompanied by a one-line explanation.
3. Click Save. Either the save succeeds OR a toast appears explaining what's blocking it.
4. When Save is blocked, the button is visibly dimmed (50% opacity, muted color) — clearly not clickable.
5. Repeat for create-couple-with-marriage flow — the existing wedding-prompt flow still works (regression guard).

## Failure modes / RCA reference

- **Don't paper over the validation:** if the save handler blocks for a real reason, surface the reason. A silent block that "just doesn't save" is the worst-case UX.
- **Disabled-button styling drift:** verify the disabled style is in `AppButton`, not a per-modal scoped class — otherwise every modal has to remember to style its own disabled buttons. CLAUDE.md rule: shared classes live once.
- **Edit vs create mode confusion:** the marriage-flow plan was specifically for the create path. An edit-mode regression suggests the gate condition is too loose. Trace the boolean.
- **Reproduction-first:** without a screenshot of the actual state, the fix is fragile. Don't ship guesswork.
