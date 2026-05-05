# Implementation: Tooltips on hourglass chart controls

**Date:** 2026-05-05
**Branch strategy:** main (single-file UX nit)
**Source:** Beta tester report 56 (v0.215.2)

## User goal

Hover the controls in the bottom-right of the hourglass chart and immediately understand what each does — especially the generation-count stepper, but also the zoom buttons. The user discovered the generation control by trial-and-error; the next user shouldn't have to.

The user's words (translated): *"I figure out by experimenting that this lets me control the number of generations shown. I assume the number controls generations both backward and forward in time. Wish: tooltips. Most importantly on the generation number, but a tooltip on zoom isn't wrong either. Suggested text: 'Number of generations shown' or 'Number of generations shown (forward and backward in time)'."*

## Scope

Every chart control button rendered as an icon-only or number-only affordance must carry a tooltip. The hourglass chart is the trigger; the same pattern lives on Pedigree / Descendant / Fan, so all four are in scope.

Files (audit and add `title` / `aria-label` to every control button):
- `src/renderer/components/charts/HourglassChart.vue` — zoom in/out, generation count + / −, recenter (if present), color-mode toggle
- `src/renderer/components/charts/PedigreeChart.vue`
- `src/renderer/components/charts/DescendantChart.vue`
- `src/renderer/components/charts/FanChart.vue`
- Any shared chart toolbar component (audit during impl — if one exists, fix once)

### Scope deviations

None. Every icon-only / number-only chart control gets a tooltip. If a control already has a tooltip, leave it alone. No partial migration.

## Tooltip mechanism

Use the native HTML `title` attribute (renders the OS tooltip on hover, ~500 ms delay) PLUS a parallel `aria-label` for screen-reader / TTS. These are separate concerns — `title` is hover-discoverable; `aria-label` is what `v-narrate` reads. Both must be set, both come from `$t()`.

Existing pattern reference: the foster-edge `<title>` child element in `HourglassChart.vue` line 35 (`{{ $t('chart.tooltip.fosterRelationship') }}`) — same i18n namespace.

## i18n keys (both `sv.ts` and `en.ts`)

In `chart.tooltip` namespace:

```ts
generationCount: 'Antal visade generationer (framåt och bakåt i tiden)' / 'Generations shown (ancestors and descendants)'
generationIncrease: 'Visa fler generationer' / 'Show more generations'
generationDecrease: 'Visa färre generationer' / 'Show fewer generations'
zoomIn: 'Zooma in' / 'Zoom in'
zoomOut: 'Zooma ut' / 'Zoom out'
zoomReset: 'Återställ zoom' / 'Reset zoom'  (if a reset button exists)
recenter: 'Centrera om diagrammet' / 'Recenter chart'  (if recenter exists)
```

Audit which buttons actually exist before adding keys. Don't add keys for controls that don't ship.

## Tasks

- [ ] **Audit** the four chart components for icon-only / number-only buttons. Produce a list of (file, button, i18n key needed) before editing.
- [ ] **Add i18n keys** to `sv.ts` and `en.ts` in the `chart.tooltip` namespace for every audited button.
- [ ] **Wire `title` + `aria-label`** on every audited button. Do NOT add Vue tooltip components — native `title` is enough and matches the existing dashed-edge pattern.
- [ ] **Component test:** mount HourglassChart, assert every `<button>` and number-stepper has a non-empty `title` attribute. Lock the contract so future controls can't ship without one.
- [ ] **Manual smoke check:** hover every control in the running app, both Swedish and English locales, confirm tooltip text is what the i18n key says.
- [ ] **Patch bump** (this is a UX fix, not a feature) + CHANGELOG: `- fix: chart controls now show tooltips on hover`.

## Verification (user-observable)

1. Open any chart (Hourglass first). Hover the generation-count number. After ~500 ms, OS tooltip reads "Antal visade generationer (framåt och bakåt i tiden)".
2. Hover zoom +. Tooltip reads "Zooma in".
3. Hover zoom −. Tooltip reads "Zooma ut".
4. Switch UI to English. Hover the generation count. Tooltip reads "Generations shown (ancestors and descendants)".
5. Repeat #1–4 on Pedigree, Descendant, Fan charts. Every icon-only / number-only control has a tooltip.

## Failure modes / RCA reference

- **Tooltip on the wrong element.** If the click target is `<svg>` and the visible icon is its child, the `title` must go on the click target — that's where the cursor hovers. Verify with `dom-first-debugging` skill.
- **Vue tooltip lib drift.** The project deliberately uses native `title` (matches the existing foster-edge `<title>` SVG-child pattern). Adding a Vue tooltip library here would be scope creep.
- **Aria-label without title.** A screen-reader-only label that's invisible to mouse hover defeats the user's goal. Both attributes mandatory.
