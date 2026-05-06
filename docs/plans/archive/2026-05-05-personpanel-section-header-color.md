# Implementation: Visual emphasis on PersonPanel section headers

**Date:** 2026-05-05
**Branch strategy:** main (small CSS change, audit across all panels)
**Source:** Beta tester report 64 (v0.215.2)

## User goal

When scanning PersonPanel — Person, Namn, Händelse, Tidslinje, Relationer, Anteckningar, Källor, Media, Forskningsuppgifter — find each section without effort. Today the section headers are visually similar to body text; the eye has to read them word-by-word to orient. A small color cue (background tint or stronger weight) on the section-header row would make orientation instant for a low-vision user.

The user's words (translated): *"Wish: some color on the headings as a help for the eye when orienting. Headings I mean are Person, Names, Event, Timeline etc. Some color on the line where the heading is written, e.g. Just so the eye can more easily orient in the picture."*

## Scope

Section headers in **every** EntityPanel-hosted side panel — not just PersonPanel. Per renderer rules every paneled view shares the same shell shape; the fix lives in the shared `SectionHeader` component (or `shared.css` rule for `.section-header`). All ten panels benefit:

- PersonPanel
- PlacePanel
- SourcePanel
- RelationshipPanel
- GroupPanel
- ResearchTaskPanel
- MediaPanel
- ReportPanel
- WebsitePanel
- ExportOptionsPanel (if it uses SectionHeader)

The change must NOT touch list/table headers (those are sticky-headers in a separate plan), modal section dividers, or chart legend headers. Only side-panel section headers.

### Scope deviations

None. Pattern migrations are all-or-nothing; the renderer rules explicitly call this out. If a panel uses a non-`SectionHeader` shape for its sections, fix the panel first to align — don't ship half.

## Design summary

### The visual treatment

**Decision: Option A — subtle background band.**

```css
.section-header {
  background: var(--surface-hover);   /* slightly raised vs body */
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-weight: 600;
}
```

Considered alternatives (rejected):

- **B — entity-typed accent stripe** (border-left + gradient). Richer, but adds aesthetic complexity and a left-side line that competes visually with the panel's own role-label band on the left edge of EntityPanel.
- **C — top-and-bottom hairlines.** Too subtle for the user's stated low-vision need; it solves the "visual divider" problem but not the "scannable landmark" problem. The user asked for a colored line, not a thinner one.

A is the right pick: adds glanceability without aesthetic risk, all values are tokens (so light/dark/high-contrast all work for free), and it doesn't compete with the existing left-edge role-label band. If after rollout the user wants more emphasis, a follow-up plan can promote to B without rewriting consumers — they all read `.section-header`.

### Accessibility

WCAG 2.1 AAA contrast is enforced (`tests/unit/wcagContrast.test.ts`). `var(--surface-hover)` over `var(--text-primary)` already meets AAA in every theme combo. No new color authoring; just token reuse.

The change must NOT remove or weaken the existing focus-visible / hover styles on the section-header collapse button.

## Tasks

- [x] **Audit** — all panels render section headers via `<SectionHeader>` from `src/renderer/components/ui/`; no inline `class="section-header"` markup found in `*Panel.vue`. Single canonical home.
- [x] **Edit `SectionHeader.vue`** — `.section-header-bar` gets `background: var(--surface-hover); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-sm)`. The `.section-title` keeps its existing `var(--font-weight-bold)`, so no font-weight authoring needed.
- [x] **WCAG check** — `npx vitest run wcag` passes 337/337 tests; `--surface-hover` was already on the AAA-compliant palette so no contrast regression.
- [x] **Visual verification deferred to user.**
- [x] **Patch bump** to v0.215.6 + CHANGELOG entry.

## Verification (user-observable)

1. Open PersonPanel. Each section header (Person, Namn, Händelse, …) has a visibly distinct background row.
2. The visual treatment is identical across all ten paneled views.
3. Light / dark / high-contrast themes all work — the band is visible in each, the text remains AAA-contrast.
4. The user (low vision) confirms it's easier to scan.

## Failure modes / RCA reference

- **Re-defining shared classes in `<style scoped>`.** Per renderer rules: `shared.css` classes are reserved namespace. Don't re-define `.section-header` in any panel's scoped block.
- **Hardcoded hex colors.** Any color must be a token. `tokens.css` is the source.
- **AAA contrast regression in high-contrast mode.** The wcag test catches this; run it before committing.
- **Half-migration.** One panel keeping the old style breaks consistency. Verify all ten before completing.
