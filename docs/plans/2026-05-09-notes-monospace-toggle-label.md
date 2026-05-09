# Plan: Notes monospace toggle — readable label, defer rich-text formatting

**Date:** 2026-05-09
**Status:** planned
**Source:** Beta tester report 90 (May 7 batch)
**Effort:** XS (label rename) + brainstorm follow-up (rich text)

## User goal

The button above every Notes field should tell the user, in plain language, what it does. Today the button reads `iWi` — a clever visual mnemonic for "proportional vs monospaced font" that works well for sighted users who recognise the typographic joke (`i W i` looks visibly different in proportional vs monospace) but is opaque to anyone with limited vision or anyone who doesn't recognise the typographic shorthand. After this plan, the same button reads with a clear text label alongside the visual mnemonic — `iWi  Fast teckenbredd` (or `Monospace` in EN), and the existing tooltip stays.

Rich-text formatting (bold, italic, underline, sizes, colors) on the Notes field is *not* implemented in this plan. It's a meaningful design discussion (storage format, GEDCOM round-trip implications, editor library choice, sanitization, search), and the user explicitly tagged it lower priority. A follow-up brainstorm is scheduled below.

## Scope

The four surfaces that host the `iWi` button:

- `src/renderer/components/PersonDetailsSection.vue`
- `src/renderer/components/MediaPanel.vue`
- `src/renderer/components/PlacePanel.vue`
- (any other `iWi` occurrence — sweep `grep -rn '>iWi<' src/renderer/` before implementing)

The shared monospace-toggle composable `useMonospacedNotes` (if it has its own template chunk) is also in scope.

**Scope deviations:**
- Rich-text formatting (Bengt's report 90 #2) — explicitly deferred. See the follow-up brainstorm task at the end.
- The monospace *behaviour* is unchanged — the button still toggles `font-family: var(--font-mono)`. Only the label changes.

## Behaviour spec

### Label

The button content becomes:

```html
<button class="mono-toggle" :title="$t('common.monospacedTooltip')">
  <span class="mono-toggle-t" :class="{ 'is-mono': !monospaced }" aria-hidden="true">iWi</span>
  <span class="mono-toggle-label">{{ $t('common.monospaceLabel') }}</span>
</button>
```

`mono-toggle-label`: `Fast teckenbredd` (sv) / `Monospace` (en). The `iWi` mnemonic stays — it's a useful visual differentiator for users who *do* recognise it — but it's now `aria-hidden` and supplemented by the text label.

### Visual

Button width grows. Layout consequences:

- `PersonDetailsSection.vue` — section header has plenty of room.
- `MediaPanel.vue`, `PlacePanel.vue` — verify the row doesn't wrap unpleasantly. If it does, the icon+label moves below the section title (still inline-flex, just stacked) on narrow panels.

Use the existing `mono-toggle` class structure; add `mono-toggle-label` styles to `shared.css` so all four surfaces are identical (per the all-or-nothing component-level rule in `.claude/rules/renderer.md`).

### Tooltip

Existing `common.monospacedTooltip` stays. Update the Swedish copy if it currently says "Aktivera fast teckenbredd" or similar (verify) — should explicitly tell the user what they're switching between: `'Växla mellan vanlig och fast teckenbredd för anteckningar'`.

## Tasks

### Phase 1 — Sweep

- [ ] `grep -rn '>iWi<' src/renderer/` and list every site. Confirm the four-surface scope or expand it.

### Phase 2 — i18n + shared CSS

- [ ] Add `common.monospaceLabel` to `sv.ts` (`'Fast teckenbredd'`) and `en.ts` (`'Monospace'`).
- [ ] Update `common.monospacedTooltip` if its current wording is unclear.
- [ ] Add `.mono-toggle-label` rule to `shared.css` — small, secondary text colour, `margin-inline-start: var(--space-xs)`.

### Phase 3 — Apply to all surfaces

- [ ] Update each surface's mono-toggle markup. Same shape; one diff per file.
- [ ] Verify no surface goes through a wrapping bug at narrow widths.

### Phase 4 — Rich-text follow-up

- [ ] Open a brainstorm at `docs/plans/2026-05-09-rich-text-notes-design.md` (separate plan, not this one) using `superpowers:brainstorming`. Topics to settle in the brainstorm:
  - Storage: markdown vs HTML vs structured (e.g. ProseMirror JSON)? Plain text today; round-trips through GEDCOM 5.5.1 NOTE TEXT lines verbatim.
  - GEDCOM 5.5.1 round-trip: NOTE structure has `CONT`/`CONC` for line continuations. Markdown in NOTE text is preserved as-is; HTML is foreign. Markdown wins on portability.
  - GEDCOM 7.0: same NOTE/SNOTE structure plus `MIME` substructure (`MIME` ∈ `text/plain`, `text/html`); `text/html` *is* spec-blessed in 7.0. So markdown ↔ 7.0 needs a deliberate rendering decision; HTML ↔ 7.0 is direct but ↔ 5.5.1 lossy.
  - Editor: a small custom contenteditable wrapper, or `@tiptap/vue-3` (heavier but battle-tested). Bundle size impact in static-SPA build.
  - Sanitisation: never write user-supplied HTML to the DOM without DOMPurify (or markdown-only).
  - Search: full-text search across notes today is a `LIKE` over plain text. Markdown notes still searchable; HTML notes need stripping.
  - Scope: which Notes surfaces? Person, Place, Media, Source, Repository, Group, ResearchTask, Event, Citation. All-or-nothing pattern migration.
  - Add to `gedcom_fidelity_registry.ts`: any new column needed for `notes_format` ∈ `{plain, markdown, html}`? Round-trip status under 5.5.1 + 7.0?

The brainstorm precedes any implementation. This file's only commitment to rich text is "it gets a brainstorm, scheduled."

## Verification

User goal: "I can read the button and tell what it does without leaning in."

1. **Smoke test (mandatory).** Open a person panel. Find the Notes section. Read the button label aloud — it says "iWi Fast teckenbredd" (sv) / "iWi Monospace" (en). Toggling the button changes the notes font. Tooltip on hover explains the toggle.
2. **Visual check** at narrow panel width — no wrap glitch on Place/Media panels.
3. **Component test** asserts the new label is present and the button still toggles `notes-mono` class on the textarea.
4. **A11y check:** screen-reader mode narrates the button as "Fast teckenbredd, knapp, av/på" — not "i W i, knapp."

## Failure modes / RCA reference

The `iWi` mnemonic shipped to four surfaces in roughly the same week and propagated quickly because it was visually clever; that's how visual-only affordances spread without ever being read aloud. The all-or-nothing component-level rule in `.claude/rules/renderer.md` ("Pattern migrations are all-or-nothing") catches this on the way *back* — fix all four surfaces in the same change.

The deferred rich-text scope is a Prime Directive concern in waiting: any rich-text format must round-trip through GEDCOM. The brainstorm exists so we don't ship rich text in a way that strands the user's notes inside our app. See `gedcom_fidelity_registry.ts` and the GEDCOM 7.0 NOTE/SNOTE/MIME spec.

## Notes

- The mnemonic-plus-label pattern is reusable. If/when other glyph-only buttons surface as "what does this do?" feedback (e.g. the ` `↩` undo button, or the `⋮` overflow), the answer is the same shape: `glyph aria-hidden + visible text label`.
