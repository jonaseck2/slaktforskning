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

Pick **one** of these — discuss with user during impl, default A:

**Option A: subtle background band** (least invasive, most accessible)
```css
.section-header {
  background: var(--surface-hover);   /* slightly raised vs body */
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-weight: 600;
}
```

**Option B: entity-typed accent stripe** (richer, theme-aware)
```css
.section-header {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-md);
  font-weight: 600;
  background: linear-gradient(to right, var(--surface-hover) 0%, transparent 60%);
}
```

**Option C: top-and-bottom hairlines** (most subtle)
```css
.section-header {
  border-top: 1px solid var(--surface-border-subtle);
  border-bottom: 1px solid var(--surface-border-subtle);
  padding: var(--space-sm) var(--space-md);
  font-weight: 600;
}
```

A is the safe pick — adds glanceability without aesthetic risk; works in light/dark/high-contrast because all values are tokens.

### Accessibility

WCAG 2.1 AAA contrast is enforced (`tests/unit/wcagContrast.test.ts`). `var(--surface-hover)` over `var(--text-primary)` already meets AAA in every theme combo. No new color authoring; just token reuse.

The change must NOT remove or weaken the existing focus-visible / hover styles on the section-header collapse button.

## Tasks

- [ ] **Audit** every panel for the actual section-header markup. Identify: do they all use `<SectionHeader>` from `src/renderer/components/ui/`, or do some inline a `<header class="section-header">` instead? List in this plan.
- [ ] **Pick treatment** (A/B/C, default A).
- [ ] **Edit `shared.css` and/or `SectionHeader.vue`** — apply the treatment. Use `shared.css` if the markup uses a class; use the component file if it's component-scoped.
- [ ] **Verify in all panels** — open each in the running app, confirm visually identical treatment.
- [ ] **WCAG check** — `npx vitest run tests/unit/wcag*` passes.
- [ ] **Component test:** mount each panel; assert the section-header element has the expected class / computed background (sanity check, not pixel-perfect).
- [ ] **Patch bump** + CHANGELOG: `- fix: section headers in side panels are visually distinct (color band)`.

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
