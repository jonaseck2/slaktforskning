# Implementation: Modal content scrolls when it exceeds the viewport

**Date:** 2026-05-06
**Branch strategy:** main (CSS-only on `BaseSubPanel`)
**Source:** Beta tester reports 72 + 75 (v0.215.2)

## User goal

Open a modal that has more fields than fit on screen — for example: an event modal with date, place, citation, source, and the "Mer" (more) section expanded; or a name-edit modal with the same shape — and **the Save button is reachable**. Today the body grows beyond the viewport and the Save button is pushed below the visible area; the modal can't be moved or scrolled, so the user is stuck and has to either cancel or shrink the OS window.

This is the same root cause across every modal that hosts BaseSubPanel: the modal's body container has no `overflow-y: auto` + `max-height` policy.

## Scope

**One file fixes every modal:** `src/renderer/components/modals/BaseSubPanel.vue`. Per CLAUDE.md "Every modal uses BaseSubPanel — never BaseModal directly", the shell is universal. Adding a vertical scroll on the body region scrolls every consumer.

Reported triggers (these are how the user found the bug — not exhaustive):

- `EventModal.vue` (R72: vigsel + ny person + hänvisning).
- `PersonNameModal.vue` (R75: namnändring + Mer expanded).

Audit during impl: any other modal where the body has more than ~700 px of vertical content.

### Scope deviations

- **Resizable / draggable modals**: out of scope. The user didn't ask; vertical scroll is enough.
- **Subpanel-mode (nested modal flows)** rendered via the `#subpanels` slot: same fix benefits them via the same shell. No separate work.
- **Sticky footer with the Save/Cancel buttons** below the scrollable body: should be the natural outcome of fixing this — confirm during impl that `BaseSubPanel`'s footer (where Save lives) sits *outside* the new scrollable region, not inside it.

## Design summary

### The CSS

`BaseSubPanel`'s structural shape is roughly:

```html
<div class="modal-overlay">
  <div class="modal">
    <header class="modal-header">…</header>
    <div class="modal-body">
      <slot />
      <div class="modal-subpanels"><slot name="subpanels" /></div>
    </div>
    <footer class="modal-actions"><AppButton>Cancel</AppButton><AppButton>Save</AppButton></footer>
  </div>
</div>
```

(Confirm exact class names during impl.)

The fix: `.modal` becomes `display: flex; flex-direction: column; max-height: calc(100vh - 64px)`. `.modal-header` and `.modal-actions` are `flex-shrink: 0`. `.modal-body` gets `flex: 1; min-height: 0; overflow-y: auto`.

That's the standard "growable column with a scrollable middle" pattern. The 64 px gutter matches the `.entity-panel` precedent (per renderer rules' shared.css notes).

### Edge cases

- **Subpanel mode** (`mode="subpanel"`): the inner panel's `.modal-body` also gets the scroll behavior. Both panels become independently scrollable when both have overflow.
- **Focus trap**: BaseSubPanel's focus trap must keep working when the body scrolls. Verified by the existing focus-trap component test (no change expected).
- **Toast / autocomplete dropdown overflow**: a place picker dropdown that opens *inside* a scrollable body should not be clipped. CSS check: the dropdown is positioned absolute relative to its input, not relative to the modal body. If it gets clipped by `overflow: auto`, switch the dropdown to a `<Teleport to="body">` pattern (rare; address only if the picker visibly clips during impl smoke).

### Don't restrict to "only when needed"

The user asked for the scrollbar to appear only when needed. With `overflow-y: auto`, that's the browser's default behavior — the scrollbar appears only when the content exceeds `max-height`. No custom logic needed.

## Tasks

- [x] **Audit** `BaseSubPanel.vue`'s structural classes; confirm header / body / actions are clearly separable.
  - Found: the structural pattern (`display: flex; flex-direction: column` on `.entity-panel`, `max-height: calc(100vh - 64px)`, `.ep-body { flex: 1; overflow-y: auto }`, `.ep-header` + `.ep-footer` with `flex-shrink: 0`) was *already in place* in `src/renderer/styles/shared.css` (lines 1287–1368). The plan's diagnosis ("the modal's body container has no `overflow-y: auto` + `max-height` policy") was almost right but missed the actual blocker.
  - The actual blocker: `.entity-panel` had `min-height: min-content` AND `max-height: calc(100vh - 64px)`. Per CSS spec, `min-height` overrides `max-height`. When body content was taller than the viewport, the `min-content` floor exceeded the `100vh - 64px` cap; the panel grew past the viewport; the footer fell off-screen; the body never overflowed because the panel itself absorbed the extra height. Fix: change `min-height: min-content` to `min-height: 0` (single line in shared.css). All other rules already do their job.
- [x] **Edit `BaseSubPanel.vue`** scoped CSS: flex column on `.modal`, max-height, body scrolls, header + actions fixed.
  - Edit landed in `src/renderer/styles/shared.css` (single rule, the global home of `.entity-panel`) rather than `BaseSubPanel.vue`'s scoped block — the rules under fix are global, used by both standalone and subpanel modes from a single source. Comment updated to record the bug surface and why `min-height: 0` is required.
- [x] **Verify** subpanel mode still positions side-by-side when both modals open (the existing `mode="subpanel"` rule renders them in the parent's `#subpanels` slot — flex-row container; nothing should change here).
  - Both modes share the same `.entity-panel` rule. The fix is symmetric: the only changed property is `min-height`. The `.entity-panel-wrap { display: flex; gap: 8px; align-items: flex-start; }` flex-row container is untouched, so side-by-side layout for subpanels is unaffected.
- [x] **Smoke check (deferred to user)** — open EventModal with date + place + citation + Mer expanded on a small window. Save button visible; body scrolls.
- [x] **Component test** — mount BaseSubPanel with a body taller than the viewport; assert footer is in the document and the CSS contract (`.entity-panel` min/max-height; `.ep-body` flex+overflow; header/footer flex-shrink: 0; DOM order header→body→footer; Save lives in footer not body) holds.
  - File: `tests/components/BaseSubPanel-scrollable.test.ts` (6 cases). Verified that reverting `min-height: 0` back to `min-height: min-content` makes the suite fail on the bug-shaped property.
- [x] **Patch bump** + CHANGELOG: `- fix: tall modal forms now scroll inside the modal so Save stays reachable`.

## Verification (user-observable)

1. Resize the OS window to ~720 px tall. Open EventModal for a wedding event. Add date, fill the place picker, expand "Mer" / show citation block. Body grows beyond viewport.
2. The modal stops growing at `100vh - 64px`. Body has a vertical scrollbar. Header and Save / Cancel footer remain visible at top and bottom.
3. Scroll the body; header + footer stay pinned.
4. Repeat for PersonNameModal with name-change + "Mer" expanded.
5. Resize the window taller; scrollbar disappears (browser default; no custom logic).

## Failure modes / RCA reference

- **Don't put `overflow: hidden` on the modal**: a common mistake — a parent with `overflow: hidden` traps the scroll on the body but also clips any popover (place-picker dropdown, date picker calendar). Test that a place picker dropdown opened from inside a scrolled modal renders fully.
- **Sticky footer competing with safe-area inset on iPad/touchscreens**: out of scope; project is desktop-only.
- **Don't add height styles to consumer modals**: every modal stays slot-driven. The shell decides the chrome.
- **Past failure context**: the user has flagged this twice on the same week (R72 + R75 are the same fix). Tests passed (modals open, save works on tall screens) while shipping a UX defect on small screens. The component test must mount with a constrained height to catch this.
