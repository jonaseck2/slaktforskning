# Plan: Collapsible Hourglass & Pedigree Visualisation

## Goal

Add expand/collapse controls to the hourglass and pedigree chart nodes so users can interactively show or hide branches. Each person box gets small circle-chevron buttons pointing in the direction of the collapsible branch.

---

## Button placement per node

| Direction | Button | Collapses |
|-----------|--------|-----------|
| ↑ (above box) | chevron up | Parents (and all ancestor chain above them) |
| ← or → (beside box) | chevron left/right | Siblings (including spouses for focal) — chevrons point outward from each box |
| ↓ (below box) | chevron down | Children (and all descendant chain below them) |

Couples (focal + spouse boxes) are shown side by side. Their outward-facing chevrons (← for focal, → for spouse) indicate that more partners could be revealed.

---

## Data model

Collapse state lives entirely in the renderer (not persisted to DB). Store it as a `Set<string>` of node IDs whose branch is collapsed in a given direction.

```typescript
// Keyed by "personId:direction" e.g. "abc123:up", "abc123:down"
const collapsed = ref(new Set<string>());
function toggle(id: string, dir: 'up' | 'down' | 'left' | 'right') {
  const key = `${id}:${dir}`;
  if (collapsed.value.has(key)) collapsed.value.delete(key);
  else collapsed.value.add(key);
}
```

Pass `collapsed` into `computeHourglassLayout` (and `computePedigreeLayout`) as a parameter so the layout function can prune the tree before layout.

---

## Implementation steps

- [ ] **Step 1 — Layout API**
  Add `collapsed: Set<string>` optional parameter to `computeHourglassLayout` and `computePedigreeLayout`. Before building boxes/lines, prune the input tree:
  - If `"k:up"` is in collapsed for ahnentafel node k, remove k's ancestors from the ancestor Map.
  - If `"focal:down"` is in collapsed, drop all children from `descendantRoot`.
  - If `"focal:left"` is in collapsed, hide the spouse list.
  Add `collapseButtons: CollapseButton[]` to `ChartLayout` output:
  ```typescript
  interface CollapseButton {
    personId: string;
    direction: 'up' | 'down' | 'left' | 'right';
    cx: number; // center x of button circle
    cy: number; // center y of button circle
    isExpanded: boolean;
  }
  ```

- [ ] **Step 2 — Unit tests**
  In `chartLayout.test.ts`, add tests:
  - `computeHourglassLayout` with one node collapsed returns fewer boxes
  - `collapseButtons` array is populated with correct positions
  - Collapsed node still shows its own box (just not its branch)

- [ ] **Step 3 — SVG rendering (HourglassChart.vue + PedigreeChart.vue)**
  Render each `CollapseButton` as an SVG `<g>` containing:
  - A `<circle>` (r=8, fill white, stroke #aaa, hover: fill #f0f0f0)
  - A Unicode chevron `<text>` (↑ ↓ ← →, font-size 10, centered)
  Wire `@click.stop` to call `toggle(btn.personId, btn.direction)`.
  Pass `collapsed.value` to the layout compute call so it re-runs reactively.

- [ ] **Step 4 — Hourglass default state**
  On initial load, auto-collapse distant branches so the chart isn't overwhelming:
  - Ancestors beyond 2 levels start collapsed (can be expanded)
  - Descendants beyond 1 level start collapsed
  - Spouses visible by default (already shown)

- [ ] **Step 5 — Pedigree collapse**
  Pedigree chart is ancestors-only. Each node gets an ↑ button (expand/collapse its own parents). No ↓ or sibling buttons needed for pedigree.

---

## Visual design

- Button radius: 8px
- Button positioned:
  - ↑: top-center of box (`cx = box.x + BOX_W/2`, `cy = box.y - 10`)
  - ↓: bottom-center of box (`cx = box.x + BOX_W/2`, `cy = box.y + BOX_H + 10`)
  - ←: left-center of box (`cx = box.x - 10`, `cy = box.y + BOX_H/2`)
  - →: right-center of box (`cx = box.x + BOX_W + 10`, `cy = box.y + BOX_H/2`)
- Chevron: ▲▼◀▶ or ↑↓←→, centred in circle
- When collapsed: filled circle, chevron points toward the hidden branch
- When expanded: outline circle, chevron points away

---

## Files to change

- `src/renderer/utils/chartLayout.ts` — add `CollapseButton`, pruning logic, button position output
- `src/renderer/components/charts/HourglassChart.vue` — render buttons, wire toggle, pass collapsed to layout
- `src/renderer/components/charts/PedigreeChart.vue` — same for pedigree
- `tests/unit/chartLayout.test.ts` — new collapse tests
