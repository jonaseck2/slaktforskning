# Tree Focal vs Selected Person — Design

## Problem

After merging "focal person" and "selected person" into a single concept (URL `personId`), every click in the tree view re-roots the chart. The user loses their bearings: the layout reflows from a different root, the loaded generation depth resets, expand/collapse state resets, and there's a visible loading flash. A genealogist clicking around to inspect ancestors should be able to do so without the tree shifting under them on every click.

## Decision

Un-merge the two concepts. Selection (panel + highlight) and focal (tree root) become independent state, the way Holger and FamilySearch model them. Single click selects; refocusing the tree is an explicit action.

## Concepts

- **Selected person** — the URL `personId` route param. Drives the panel, the sidebar's "current person" indicator (`focusStore`), and the highlighted/focal-styled box in the chart **if visible in the loaded tree**. Changes on every click anywhere — tree box, list row, panel relationship link, sidebar.
- **Tree focal** — the chart's structural root. Separate, sticky state. Changes only via an explicit refocus action.

The two start equal on first view of `/persons` (the tree is rooted on whoever you selected) and diverge as the user clicks around without refocusing.

## State

New Pinia store `useTreeFocalStore`:

```ts
{ personId: Ref<string | null>, set(id: string), clear() }
```

Backed by `localStorage` (key: `tree-focal-id`) so the focal survives an app reload — same expectation Holger sets. PersonsView resolves stale ids defensively: if the stored id is not found in the current DB (e.g., after database switch or import), fall back to `default_person_id`, then to URL `personId`, then to the first person in the list. No global "db switched" event needed.

The store is shared rather than view-local so ReportsView's chart-print tabs (Pedigree/Hourglass/Descendant prints) can read the same focal — switching between `/persons` and `/reports` shouldn't make the user re-pick.

## Refocus mechanism

One affordance: **"Set as tree focal" button** in `PersonPanel`'s header.

- Soft `AppButton` next to the close button.
- Visible only when `selectedId !== treeFocalId`.
- Replaced by a small "Tree focal" non-interactive badge when `selectedId === treeFocalId`, as confirmation.
- Gated by a `showTreeFocalButton` prop (only PersonsView passes `true`; static SPA / readonly contexts pass `false`).

Double-click and right-click are deliberately omitted. One discoverable affordance is better than a hidden one that creates "did I mean to do that?" moments. We can add power-user shortcuts later if requested.

## Wiring

`src/renderer/stores/treeFocal.ts` (new):

```ts
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useTreeFocalStore = defineStore('treeFocal', () => {
  const personId = ref<string | null>(localStorage.getItem('tree-focal-id'));
  watch(personId, v => {
    if (v) localStorage.setItem('tree-focal-id', v);
    else localStorage.removeItem('tree-focal-id');
  });
  function set(id: string) { personId.value = id; }
  function clear() { personId.value = null; }
  return { personId, set, clear };
});
```

`src/renderer/views/PersonsView.vue`:

- Replace `:person-id="personId"` with `:person-id="treeFocalId"` on PedigreeChart, HourglassChart, DescendantChart.
- Keep `:selected-person-id="personId"` on those three.
- FanChart and TimelineChart: keep `:person-id="personId"` (single-person summaries — click should refocus, no behavior change).
- In `load()`: after resolving the URL `personId` to a valid person, if `treeFocalStore.personId` is null OR no longer resolves to an existing person, set it to URL `personId` (or `default_person_id`).
- Wire `@refocus` from PersonPanel to `treeFocalStore.set(id)`.

`src/renderer/components/PersonPanel.vue`:

- Add `showTreeFocalButton: boolean` prop (default false).
- In header, when prop is true:
  - If `personId !== treeFocalStore.personId`: render `<AppButton variant="soft" size="sm" @click="emit('refocus', personId)">{{ $t('tree.setFocal') }}</AppButton>`
  - Else: render `<span class="tree-focal-badge">{{ $t('tree.isFocal') }}</span>`
- Add `refocus` to defineEmits.

i18n (`sv.ts`, `en.ts`):

- `tree.setFocal` — Swedish: "Visa i träd", English: "Set as tree focal"
- `tree.isFocal` — Swedish: "Trädets centrum", English: "Tree focal"

Charts (Pedigree/Hourglass/Descendant): no internal changes. They already redraw on `:person-id` change and update the highlight on `:selected-person-id` change. We're just feeding them different sources.

`CLAUDE.md`: update the chart-outlines section that says "Selected person and focal person are the same thing." It's no longer true; selected drives panel + highlight, focal drives tree root.

## Behavior

- Click any tree box: panel updates (URL changes), highlight box moves, **tree stays put**.
- Click a relationship link in the panel: panel updates, highlight moves if the target is in the tree, otherwise no highlight. Tree stays put.
- Click "Set as tree focal" button: tree refetches with the new root (existing flow, just gated behind explicit click).
- Add a relative (existing `@reload="reloadChart"` flow): refetches with current focal — unchanged.

## Edge cases

- **Selected person not in current tree**: chart shows no highlight; panel shows them; "Set as tree focal" button is the obvious next step.
- **User deletes the focal person**: existing PersonsView fallback (`default_person_id`, then first person) covers it. After fallback, `treeFocalStore.set` updates to the resolved id.
- **Database switch / GEDCOM import**: defensive resolution in `load()` handles stale focal ids — if the saved focal doesn't resolve to a person in the current DB, fall back. No global event listener needed.
- **First-ever app load (no localStorage value, no default_person_id, no persons)**: noFocalPerson state — same empty state PersonsView already renders.
- **Static SPA**: PersonPanel's `showTreeFocalButton` defaults to false, button never appears.

## Out of scope

- Double-click or right-click refocus shortcuts (defer until requested).
- "Focus another person while this is the panel target" (the inverse — pick a focal that isn't the panel target). Always select-then-promote-to-focal.
- Persisting focal **per-database** (a single global localStorage key collides across DBs but the defensive resolution handles it cleanly enough; per-DB keys are nice-to-have).
