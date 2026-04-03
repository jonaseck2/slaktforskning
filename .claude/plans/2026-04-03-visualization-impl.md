# v0.4.1 Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SVG-based pedigree, hourglass, and timeline chart views to Släktforskning, making the visualization the primary navigation surface.

**Architecture:** All layout logic lives in pure-TS utility `chartLayout.ts` (unit-testable). Data fetching from IPC lives in `chartData.ts`. Three Vue SVG chart components share these utilities. `VisualizationView` is the top-level route component with tab switching and focal person persistence.

**Tech stack:** Vue 3 Composition API, `<script setup>`, inline SVG, Vitest unit + component tests, @vue/test-utils, no new dependencies.

**Design spec:** `.claude/plans/2026-04-03-visualization.md`
**Brainstorm mockups:** `.claude/plans/brainstorm/2026-04-03-visualization/viz-mockup.html`

---

## File Map

### Create
| File | Responsibility |
|------|---------------|
| `src/renderer/utils/chartLayout.ts` | Pure layout algorithms — pedigree, hourglass, timeline. No IPC, no DOM, unit-tested. |
| `src/renderer/utils/chartData.ts` | IPC data fetching — builds tree structures from `window.api`. |
| `src/renderer/views/VisualizationView.vue` | Route component: tab switcher, focal person header, PersonPicker for empty state. |
| `src/renderer/components/charts/PedigreeChart.vue` | Ancestors SVG, 3 generations, click-to-navigate. |
| `src/renderer/components/charts/HourglassChart.vue` | Ancestors + descendants SVG with couple connectors. |
| `src/renderer/components/charts/TimelineChart.vue` | Lifespans on a time axis, auto-scaling. |
| `tests/unit/chartLayout.test.ts` | Unit tests for pure layout functions. |
| `tests/components/VisualizationView.test.ts` | Component test for view routing/tab behavior. |
| `tests/components/PedigreeChart.test.ts` | Component test: SVG renders with focal person box. |

### Modify
| File | Change |
|------|--------|
| `src/renderer/router.ts` | Add `/visualisering` and `/visualisering/:personId` routes. |
| `src/renderer/App.vue` | Add Visualisering nav link at top of sidebar; add `nav.visualization` i18n key. |
| `src/renderer/views/PersonDetailView.vue` | Add "Visa i träd →" button in header. |
| `src/renderer/i18n/sv.ts` | Add `visualization`, `nav.visualization`, `personDetail.viewInTree` keys. |
| `src/renderer/i18n/en.ts` | Same keys in English. |

---

## Task 1: i18n strings

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add Swedish visualization strings**

  In `src/renderer/i18n/sv.ts`, before the closing `};`, append:

  ```typescript
    visualization: {
      title: 'Visualisering',
      selectPerson: 'Välj en person för att visa deras träd.',
      empty: 'Lägg till en person för att börja visualisera.',
      viewDetail: 'Visa detaljer',
      tab: {
        pedigree: 'Stamtavla',
        hourglass: 'Timglas',
        timeline: 'Tidslinje',
      },
      generation: {
        grandparents: 'Morföräldrar / Farföräldrar',
        parents: 'Föräldrar',
        focal: 'Fokusperson',
        children: 'Barn',
      },
      legend: {
        male: 'Man',
        female: 'Kvinna',
        unknown: 'Okänt kön',
        deceased: 'Avliden',
        focal: 'Fokusperson',
        today: 'Idag',
      },
    },
  ```

  Also add `visualization: 'Visualisering'` to the `nav` block.

  Also add `viewInTree: 'Visa i träd →'` to the `personDetail` block.

- [ ] **Step 2: Add English visualization strings**

  In `src/renderer/i18n/en.ts`, before the closing `};`, append:

  ```typescript
    visualization: {
      title: 'Visualization',
      selectPerson: 'Select a person to view their tree.',
      empty: 'Add a person to start visualizing.',
      viewDetail: 'View details',
      tab: {
        pedigree: 'Pedigree',
        hourglass: 'Hourglass',
        timeline: 'Timeline',
      },
      generation: {
        grandparents: 'Grandparents',
        parents: 'Parents',
        focal: 'Focal person',
        children: 'Children',
      },
      legend: {
        male: 'Male',
        female: 'Female',
        unknown: 'Unknown sex',
        deceased: 'Deceased',
        focal: 'Focal person',
        today: 'Today',
      },
    },
  ```

  Also add `visualization: 'Visualization'` to the `nav` block.

  Also add `viewInTree: 'View in tree →'` to the `personDetail` block.

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors about missing translation keys.

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): add i18n strings for visualization views"
  ```

---

## Task 2: Chart layout utilities (TDD)

**Files:**
- Create: `src/renderer/utils/chartLayout.ts`
- Create: `tests/unit/chartLayout.test.ts`

### Key constants and formulas

```
Pedigree (left-to-right, focal at left):
  BOX_W=155, BOX_H=44, V_GAP=20, H_GAP=50, PAD=10
  ROW_H = BOX_H + V_GAP = 64

  genX[0] = PAD = 10                      (focal)
  genX[1] = PAD + BOX_W + H_GAP = 215     (parents)
  genX[2] = PAD + 2*(BOX_W + H_GAP) = 420 (grandparents)

  GP slot y[i] = PAD + i * ROW_H          (i = 0..3)
  GP slot cy[i] = y[i] + BOX_H / 2
  parentCY[p] = (gpCY[p*2] + gpCY[p*2+1]) / 2
  focalCY = (parentCY[0] + parentCY[1]) / 2

  svgWidth  = genX[2] + BOX_W + PAD = 585
  svgHeight = PAD + 4 * ROW_H - V_GAP + PAD = 256

Hourglass (top-to-bottom, focal at center):
  GP_INNER_GAP = 10, FAMILY_GAP = 60, GEN_GAP = 60
  svgWidth = 4 * BOX_W + 2 * GP_INNER_GAP + FAMILY_GAP + 2 * PAD = 720

  gpX[0] = PAD = 10
  gpX[1] = PAD + BOX_W + GP_INNER_GAP = 175
  gpX[2] = PAD + 2*BOX_W + GP_INNER_GAP + FAMILY_GAP = 390
  gpX[3] = PAD + 3*BOX_W + 2*GP_INNER_GAP + FAMILY_GAP = 555

  parentCX[p] = (gpCX[p*2] + gpCX[p*2+1]) / 2
  focalCX = svgWidth / 2 = 360

  gpRowY      = PAD = 10
  parentRowY  = PAD + BOX_H + GEN_GAP = 114
  focalRowY   = PAD + 2*(BOX_H + GEN_GAP) = 218
  childRowY   = PAD + 3*(BOX_H + GEN_GAP) = 322

  forkY_gp_parent    = gpRowY + BOX_H + GEN_GAP / 2 = 84
  forkY_parent_focal = parentRowY + BOX_H + GEN_GAP / 2 = 188
  forkY_focal_child  = focalRowY + BOX_H + GEN_GAP / 2 = 292

Timeline (horizontal):
  TL_LEFT_MARGIN=164, TL_RIGHT_MARGIN=30, TL_TOP_PAD=20
  TL_BAR_H=22, TL_ROW_H=36, svgWidth=800 (fixed, scales via viewBox)
  scale = (svgWidth - TL_LEFT_MARGIN - TL_RIGHT_MARGIN) / (maxYear - minYear)
  xOfYear(y) = TL_LEFT_MARGIN + (y - minYear) * scale
```

- [ ] **Step 1: Write the failing unit tests**

  Create `tests/unit/chartLayout.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import {
    computePedigreeLayout,
    computeHourglassLayout,
    computeTimelineLayout,
    BOX_W,
    BOX_H,
  } from '../../src/renderer/utils/chartLayout';
  import type { PersonNode, PedigreeTree, HourglassTree } from '../../src/renderer/utils/chartLayout';

  function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
    return { id, givenName: 'Test', surname: 'Person', sex: 'U', living: true, birthYear: null, deathYear: null, ...overrides };
  }

  describe('computePedigreeLayout', () => {
    it('returns one focal box when tree has no ancestors', () => {
      const tree: PedigreeTree = { focal: p('f'), parents: [null, null], grandparents: [null, null, null, null] };
      const { boxes } = computePedigreeLayout(tree);
      expect(boxes).toHaveLength(1);
      expect(boxes[0].isFocal).toBe(true);
      expect(boxes[0].w).toBe(BOX_W);
      expect(boxes[0].h).toBe(BOX_H);
    });

    it('places focal box at leftmost x (PAD=10)', () => {
      const tree: PedigreeTree = { focal: p('f'), parents: [null, null], grandparents: [null, null, null, null] };
      const { boxes } = computePedigreeLayout(tree);
      expect(boxes[0].x).toBe(10);
    });

    it('generates no connector lines when no ancestors', () => {
      const tree: PedigreeTree = { focal: p('f'), parents: [null, null], grandparents: [null, null, null, null] };
      expect(computePedigreeLayout(tree).lines).toHaveLength(0);
    });

    it('adds both parent boxes at genX[1]=215', () => {
      const tree: PedigreeTree = {
        focal: p('f'),
        parents: [p('p0'), p('p1')],
        grandparents: [null, null, null, null],
      };
      const { boxes } = computePedigreeLayout(tree);
      const parentBoxes = boxes.filter(b => !b.isFocal);
      expect(parentBoxes).toHaveLength(2);
      parentBoxes.forEach(b => expect(b.x).toBe(215));
    });

    it('places parents[0] above parents[1]', () => {
      const tree: PedigreeTree = {
        focal: p('f'),
        parents: [p('p0'), p('p1')],
        grandparents: [null, null, null, null],
      };
      const { boxes } = computePedigreeLayout(tree);
      const p0 = boxes.find(b => b.person.id === 'p0')!;
      const p1 = boxes.find(b => b.person.id === 'p1')!;
      expect(p0.y).toBeLessThan(p1.y);
    });

    it('generates connector lines when at least one parent exists', () => {
      const tree: PedigreeTree = {
        focal: p('f'),
        parents: [p('p0'), null],
        grandparents: [null, null, null, null],
      };
      expect(computePedigreeLayout(tree).lines.length).toBeGreaterThan(0);
    });

    it('returns 7 boxes for a full 3-generation tree', () => {
      const tree: PedigreeTree = {
        focal: p('f'),
        parents: [p('p0'), p('p1')],
        grandparents: [p('gp0'), p('gp1'), p('gp2'), p('gp3')],
      };
      expect(computePedigreeLayout(tree).boxes).toHaveLength(7);
    });

    it('places grandparent boxes at genX[2]=420', () => {
      const tree: PedigreeTree = {
        focal: p('f'),
        parents: [p('p0'), p('p1')],
        grandparents: [p('gp0'), null, p('gp2'), null],
      };
      const { boxes } = computePedigreeLayout(tree);
      const gpBoxes = boxes.filter(b => b.person.id === 'gp0' || b.person.id === 'gp2');
      gpBoxes.forEach(b => expect(b.x).toBe(420));
    });

    it('focal is vertically centered between parents', () => {
      const tree: PedigreeTree = {
        focal: p('f'),
        parents: [p('p0'), p('p1')],
        grandparents: [null, null, null, null],
      };
      const { boxes } = computePedigreeLayout(tree);
      const focal = boxes.find(b => b.isFocal)!;
      const p0 = boxes.find(b => b.person.id === 'p0')!;
      const p1 = boxes.find(b => b.person.id === 'p1')!;
      const focalCY = focal.y + BOX_H / 2;
      const p0cy = p0.y + BOX_H / 2;
      const p1cy = p1.y + BOX_H / 2;
      expect(focalCY).toBeCloseTo((p0cy + p1cy) / 2, 1);
    });
  });

  describe('computeHourglassLayout', () => {
    it('places focal at horizontal center', () => {
      const tree: HourglassTree = {
        focal: p('f'), parents: [null, null], grandparents: [null, null, null, null], children: [],
      };
      const { boxes, svgWidth } = computeHourglassLayout(tree);
      const focal = boxes.find(b => b.isFocal)!;
      expect(focal.x).toBeCloseTo(svgWidth / 2 - BOX_W / 2, 0);
    });

    it('places child boxes below the focal box', () => {
      const tree: HourglassTree = {
        focal: p('f'), parents: [null, null], grandparents: [null, null, null, null],
        children: [p('c1'), p('c2')],
      };
      const { boxes } = computeHourglassLayout(tree);
      const focal = boxes.find(b => b.isFocal)!;
      const children = boxes.filter(b => b.person.id === 'c1' || b.person.id === 'c2');
      expect(children).toHaveLength(2);
      children.forEach(c => expect(c.y).toBeGreaterThan(focal.y + BOX_H));
    });

    it('generates no child connector lines when no children', () => {
      const tree: HourglassTree = {
        focal: p('f'), parents: [null, null], grandparents: [null, null, null, null], children: [],
      };
      // With no parents and no children, no lines at all
      expect(computeHourglassLayout(tree).lines).toHaveLength(0);
    });

    it('svgHeight grows when children are added', () => {
      const noChildren: HourglassTree = {
        focal: p('f'), parents: [null, null], grandparents: [null, null, null, null], children: [],
      };
      const withChildren: HourglassTree = { ...noChildren, children: [p('c1')] };
      const h1 = computeHourglassLayout(noChildren).svgHeight;
      const h2 = computeHourglassLayout(withChildren).svgHeight;
      expect(h2).toBeGreaterThan(h1);
    });
  });

  describe('computeTimelineLayout', () => {
    it('returns one bar per entry', () => {
      const entries = [
        { person: p('f', { birthYear: 1978 }), isFocal: true },
        { person: p('x', { birthYear: 1950, deathYear: 2010 }), isFocal: false },
      ];
      expect(computeTimelineLayout(entries, 2024).bars).toHaveLength(2);
    });

    it('marks persons with no death year as open (living bar)', () => {
      const entries = [{ person: p('f', { birthYear: 1978 }), isFocal: true }];
      expect(computeTimelineLayout(entries, 2024).bars[0].isOpen).toBe(true);
    });

    it('marks persons with a death year as closed', () => {
      const entries = [{ person: p('x', { birthYear: 1900, deathYear: 1980 }), isFocal: false }];
      expect(computeTimelineLayout(entries, 2024).bars[0].isOpen).toBe(false);
    });

    it('sorts oldest birth year to top (first in array)', () => {
      const entries = [
        { person: p('young', { birthYear: 1980 }), isFocal: false },
        { person: p('old', { birthYear: 1920 }), isFocal: false },
      ];
      const { bars } = computeTimelineLayout(entries, 2024);
      expect(bars[0].person.id).toBe('old');
      expect(bars[1].person.id).toBe('young');
    });

    it('generates decade tick marks', () => {
      const entries = [{ person: p('f', { birthYear: 1950 }), isFocal: true }];
      const { ticks } = computeTimelineLayout(entries, 2000);
      expect(ticks.length).toBeGreaterThan(0);
      ticks.forEach(t => expect(t.year % 10).toBe(0));
    });

    it('includes a todayX value', () => {
      const entries = [{ person: p('f', { birthYear: 1950 }), isFocal: true }];
      const { todayX } = computeTimelineLayout(entries, 2000);
      expect(todayX).toBeGreaterThan(0);
    });

    it('marks person with no birth year as hasNoDate', () => {
      const entries = [{ person: p('x'), isFocal: false }];
      expect(computeTimelineLayout(entries, 2024).bars[0].hasNoDate).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run tests — verify they fail**

  Run: `npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|chartLayout"`
  Expected: All chartLayout tests fail with "Cannot find module".

- [ ] **Step 3: Create `src/renderer/utils/chartLayout.ts`**

  ```typescript
  // src/renderer/utils/chartLayout.ts

  export interface PersonNode {
    id: string;
    givenName: string | null;
    surname: string | null;
    sex: 'M' | 'F' | 'U';
    living: boolean;
    birthYear: number | null;
    deathYear: number | null;
  }

  export interface BoxLayout {
    person: PersonNode;
    isFocal: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
  }

  export interface Line {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export interface ChartLayout {
    boxes: BoxLayout[];
    lines: Line[];
    svgWidth: number;
    svgHeight: number;
  }

  export interface PedigreeTree {
    focal: PersonNode;
    // parents[0] and parents[1] (either may be null)
    parents: [PersonNode | null, PersonNode | null];
    // grandparents[0,1] = parents[0]'s parents; grandparents[2,3] = parents[1]'s parents
    grandparents: [PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null];
  }

  export interface HourglassTree extends PedigreeTree {
    children: PersonNode[];
  }

  export interface BarLayout {
    person: PersonNode;
    isFocal: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
    isOpen: boolean;
    hasNoDate: boolean;
  }

  export interface TickMark {
    x: number;
    year: number;
  }

  export interface TimelineLayout {
    bars: BarLayout[];
    ticks: TickMark[];
    todayX: number;
    svgWidth: number;
    svgHeight: number;
    axisY: number;
  }

  export interface TimelineEntry {
    person: PersonNode;
    isFocal: boolean;
  }

  // ─── Constants ────────────────────────────────────────────────────────────────

  export const BOX_W = 155;
  export const BOX_H = 44;
  export const V_GAP = 20;   // vertical gap between sibling boxes
  export const H_GAP = 50;   // horizontal gap between pedigree generations
  export const GEN_GAP = 60; // vertical gap between hourglass generations
  const PAD = 10;
  const ROW_H = BOX_H + V_GAP; // 64

  // ─── Pedigree ─────────────────────────────────────────────────────────────────

  export function computePedigreeLayout(tree: PedigreeTree): ChartLayout {
    const boxes: BoxLayout[] = [];
    const lines: Line[] = [];

    const genX = [PAD, PAD + BOX_W + H_GAP, PAD + 2 * (BOX_W + H_GAP)];
    // genX = [10, 215, 420]

    const gpSlotY = [0, 1, 2, 3].map(i => PAD + i * ROW_H);
    const gpSlotCY = gpSlotY.map(y => y + BOX_H / 2);
    // gpSlotCY = [32, 96, 160, 224]

    const parentSlotCY = [
      (gpSlotCY[0] + gpSlotCY[1]) / 2, // 64
      (gpSlotCY[2] + gpSlotCY[3]) / 2, // 192
    ];

    const focalCY = (parentSlotCY[0] + parentSlotCY[1]) / 2; // 128

    const svgWidth = genX[2] + BOX_W + PAD;   // 585
    const svgHeight = PAD + 4 * ROW_H - V_GAP + PAD; // 256

    boxes.push({ person: tree.focal, isFocal: true, x: genX[0], y: focalCY - BOX_H / 2, w: BOX_W, h: BOX_H });

    const forkX01 = genX[0] + BOX_W + H_GAP / 2; // 190

    const activePCYs = tree.parents
      .map((p, i) => (p ? parentSlotCY[i] : null))
      .filter((cy): cy is number => cy !== null);

    if (activePCYs.length > 0) {
      lines.push({ x1: genX[0] + BOX_W, y1: focalCY, x2: forkX01, y2: focalCY });
      lines.push({ x1: forkX01, y1: Math.min(...activePCYs), x2: forkX01, y2: Math.max(...activePCYs) });
    }

    for (let pi = 0; pi < 2; pi++) {
      const parent = tree.parents[pi];
      if (!parent) continue;
      const pcy = parentSlotCY[pi];
      boxes.push({ person: parent, isFocal: false, x: genX[1], y: pcy - BOX_H / 2, w: BOX_W, h: BOX_H });
      lines.push({ x1: forkX01, y1: pcy, x2: genX[1], y2: pcy });

      const forkX12 = genX[1] + BOX_W + H_GAP / 2; // 395

      const activeGPCYs = [tree.grandparents[pi * 2], tree.grandparents[pi * 2 + 1]]
        .map((gp, gi) => (gp ? gpSlotCY[pi * 2 + gi] : null))
        .filter((cy): cy is number => cy !== null);

      if (activeGPCYs.length > 0) {
        lines.push({ x1: genX[1] + BOX_W, y1: pcy, x2: forkX12, y2: pcy });
        lines.push({ x1: forkX12, y1: Math.min(...activeGPCYs), x2: forkX12, y2: Math.max(...activeGPCYs) });
      }

      for (let gi = 0; gi < 2; gi++) {
        const gp = tree.grandparents[pi * 2 + gi];
        if (!gp) continue;
        const gpIdx = pi * 2 + gi;
        lines.push({ x1: forkX12, y1: gpSlotCY[gpIdx], x2: genX[2], y2: gpSlotCY[gpIdx] });
        boxes.push({ person: gp, isFocal: false, x: genX[2], y: gpSlotY[gpIdx], w: BOX_W, h: BOX_H });
      }
    }

    return { boxes, lines, svgWidth, svgHeight };
  }

  // ─── Hourglass ────────────────────────────────────────────────────────────────

  export function computeHourglassLayout(tree: HourglassTree): ChartLayout {
    const GP_INNER_GAP = 10;
    const FAMILY_GAP = 60;
    const svgWidth = 4 * BOX_W + 2 * GP_INNER_GAP + FAMILY_GAP + 2 * PAD;
    // svgWidth = 720

    const boxes: BoxLayout[] = [];
    const lines: Line[] = [];

    // GP x positions
    const gpX = [
      PAD,
      PAD + BOX_W + GP_INNER_GAP,
      PAD + 2 * BOX_W + GP_INNER_GAP + FAMILY_GAP,
      PAD + 3 * BOX_W + 2 * GP_INNER_GAP + FAMILY_GAP,
    ]; // [10, 175, 390, 555]

    const gpCX = gpX.map(x => x + BOX_W / 2); // [87.5, 252.5, 467.5, 632.5]

    const parentCX = [
      (gpCX[0] + gpCX[1]) / 2, // 170
      (gpCX[2] + gpCX[3]) / 2, // 550
    ];

    const focalCX = svgWidth / 2; // 360

    const gpRowY      = PAD;                            // 10
    const parentRowY  = PAD + BOX_H + GEN_GAP;          // 114
    const focalRowY   = PAD + 2 * (BOX_H + GEN_GAP);   // 218
    const childRowY   = PAD + 3 * (BOX_H + GEN_GAP);   // 322

    const forkY_gp_parent    = gpRowY + BOX_H + GEN_GAP / 2;    // 84
    const forkY_parent_focal = parentRowY + BOX_H + GEN_GAP / 2; // 188
    const forkY_focal_child  = focalRowY + BOX_H + GEN_GAP / 2;  // 292

    // Grandparent boxes
    for (let i = 0; i < 4; i++) {
      const gp = tree.grandparents[i];
      if (!gp) continue;
      boxes.push({ person: gp, isFocal: false, x: gpX[i], y: gpRowY, w: BOX_W, h: BOX_H });
    }

    // Parent boxes + GP→Parent connectors
    for (let pi = 0; pi < 2; pi++) {
      const gp0 = tree.grandparents[pi * 2];
      const gp1 = tree.grandparents[pi * 2 + 1];
      const activeGPCXs = [gp0, gp1]
        .map((gp, gi) => (gp ? gpCX[pi * 2 + gi] : null))
        .filter((cx): cx is number => cx !== null);

      if (activeGPCXs.length > 0) {
        for (const cx of activeGPCXs) {
          lines.push({ x1: cx, y1: gpRowY + BOX_H, x2: cx, y2: forkY_gp_parent });
        }
        lines.push({ x1: Math.min(...activeGPCXs), y1: forkY_gp_parent, x2: Math.max(...activeGPCXs), y2: forkY_gp_parent });
        if (tree.parents[pi]) {
          lines.push({ x1: parentCX[pi], y1: forkY_gp_parent, x2: parentCX[pi], y2: parentRowY });
        }
      }

      const parent = tree.parents[pi];
      if (!parent) continue;
      boxes.push({ person: parent, isFocal: false, x: parentCX[pi] - BOX_W / 2, y: parentRowY, w: BOX_W, h: BOX_H });
    }

    // Focal box
    boxes.push({ person: tree.focal, isFocal: true, x: focalCX - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H });

    // Parent→Focal connectors
    const activeParentCXs = tree.parents
      .map((p, i) => (p ? parentCX[i] : null))
      .filter((cx): cx is number => cx !== null);

    if (activeParentCXs.length > 0) {
      for (const cx of activeParentCXs) {
        lines.push({ x1: cx, y1: parentRowY + BOX_H, x2: cx, y2: forkY_parent_focal });
      }
      lines.push({ x1: Math.min(...activeParentCXs), y1: forkY_parent_focal, x2: Math.max(...activeParentCXs), y2: forkY_parent_focal });
      lines.push({ x1: focalCX, y1: forkY_parent_focal, x2: focalCX, y2: focalRowY });
    }

    // Focal→Children connectors + child boxes
    let svgHeight = focalRowY + BOX_H + PAD;

    if (tree.children.length > 0) {
      const count = tree.children.length;
      const totalW = count * BOX_W + (count - 1) * V_GAP;
      const startX = (svgWidth - totalW) / 2;

      lines.push({ x1: focalCX, y1: focalRowY + BOX_H, x2: focalCX, y2: forkY_focal_child });
      if (count > 1) {
        const firstCX = startX + BOX_W / 2;
        const lastCX = startX + (count - 1) * (BOX_W + V_GAP) + BOX_W / 2;
        lines.push({ x1: firstCX, y1: forkY_focal_child, x2: lastCX, y2: forkY_focal_child });
      }

      for (let ci = 0; ci < count; ci++) {
        const cx = startX + ci * (BOX_W + V_GAP) + BOX_W / 2;
        lines.push({ x1: cx, y1: forkY_focal_child, x2: cx, y2: childRowY });
        boxes.push({ person: tree.children[ci], isFocal: false, x: startX + ci * (BOX_W + V_GAP), y: childRowY, w: BOX_W, h: BOX_H });
      }

      svgHeight = childRowY + BOX_H + PAD;
    }

    return { boxes, lines, svgWidth, svgHeight };
  }

  // ─── Timeline ─────────────────────────────────────────────────────────────────

  const TL_LEFT_MARGIN = 164;
  const TL_RIGHT_MARGIN = 30;
  const TL_TOP_PAD = 20;
  const TL_BAR_H = 22;
  const TL_ROW_H = 36;
  const TL_SVG_W = 800;
  const TL_AXIS_H = 30;

  export function computeTimelineLayout(entries: TimelineEntry[], currentYear: number): TimelineLayout {
    const years = entries
      .flatMap(e => [e.person.birthYear, e.person.deathYear])
      .filter((y): y is number => y !== null);

    let minYear: number;
    let maxYear: number;
    if (years.length === 0) {
      minYear = currentYear - 50;
      maxYear = currentYear;
    } else if (years.length === 1) {
      minYear = years[0] - 10;
      maxYear = Math.max(currentYear, years[0] + 10);
    } else {
      minYear = Math.min(...years) - 5;
      maxYear = Math.max(...years, currentYear) + 5;
    }

    minYear = Math.floor(minYear / 10) * 10;
    maxYear = Math.ceil(maxYear / 10) * 10;

    const sorted = [...entries].sort((a, b) => {
      const ay = a.person.birthYear ?? Infinity;
      const by = b.person.birthYear ?? Infinity;
      return ay - by;
    });

    const chartW = TL_SVG_W - TL_LEFT_MARGIN - TL_RIGHT_MARGIN;
    const scale = chartW / (maxYear - minYear);
    const xOfYear = (year: number) => TL_LEFT_MARGIN + (year - minYear) * scale;

    const bars: BarLayout[] = sorted.map((entry, i) => {
      const { birthYear, deathYear } = entry.person;
      const isOpen = deathYear === null;
      const hasNoDate = birthYear === null;
      const startYear = birthYear ?? minYear;
      const endYear = isOpen ? currentYear : (deathYear ?? currentYear);
      const x = xOfYear(startYear);
      const endX = xOfYear(endYear);
      return {
        person: entry.person,
        isFocal: entry.isFocal,
        x, y: TL_TOP_PAD + i * TL_ROW_H,
        w: Math.max(endX - x, 4),
        h: TL_BAR_H,
        isOpen,
        hasNoDate,
      };
    });

    const ticks: TickMark[] = [];
    for (let y = minYear; y <= maxYear; y += 10) {
      ticks.push({ x: xOfYear(y), year: y });
    }

    const axisY = TL_TOP_PAD + sorted.length * TL_ROW_H + 10;
    const todayX = xOfYear(currentYear);
    const svgHeight = axisY + TL_AXIS_H;

    return { bars, ticks, todayX, svgWidth: TL_SVG_W, svgHeight, axisY };
  }
  ```

- [ ] **Step 4: Run tests — verify they pass**

  Run: `npm test -- --reporter=verbose 2>&1 | grep -E "✓|✗|chartLayout"`
  Expected: All chartLayout tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): add chartLayout utility with pedigree, hourglass, timeline algorithms"
  ```

---

## Task 3: Chart data fetching utility

**Files:**
- Create: `src/renderer/utils/chartData.ts`

No unit tests — this module only makes IPC calls via `window.api`.

- [ ] **Step 1: Create `src/renderer/utils/chartData.ts`**

  ```typescript
  // src/renderer/utils/chartData.ts
  // Fetches PersonNode trees from window.api for use by chart components.

  import type { PersonNode, PedigreeTree, HourglassTree, TimelineEntry } from './chartLayout';

  declare const window: Window & {
    api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  };

  type RawPerson  = { id: string; sex: string; living: boolean };
  type RawName    = { given_name: string | null; surname: string | null; sort_order: number };
  type RawEvent   = { event_type: string; date_value: string | null };
  type RawRel     = { type: string; person1_id: string | null; person2_id: string | null };

  function extractYear(v: string | null | undefined): number | null {
    if (!v) return null;
    const m = v.match(/\d{4}/);
    return m ? parseInt(m[0], 10) : null;
  }

  export async function fetchPersonNode(id: string): Promise<PersonNode> {
    const [person, names, events] = await Promise.all([
      window.api.persons.get(id),
      window.api.persons.getNames(id),
      window.api.events.forPerson(id),
    ]) as [RawPerson | null, RawName[], RawEvent[]];

    if (!person) throw new Error(`Person not found: ${id}`);
    const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0]
      ?? { given_name: null, surname: null };

    return {
      id,
      givenName: primary.given_name,
      surname: primary.surname,
      sex: person.sex as 'M' | 'F' | 'U',
      living: Boolean(person.living),
      birthYear: extractYear(events.find(e => e.event_type === 'birth')?.date_value),
      deathYear: extractYear(events.find(e => e.event_type === 'death')?.date_value),
    };
  }

  export async function fetchPedigreeTree(focalId: string): Promise<PedigreeTree> {
    const [focal, rawRels] = await Promise.all([
      fetchPersonNode(focalId),
      window.api.relationships.getForPerson(focalId),
    ]) as [PersonNode, RawRel[]];

    // Parents: parent_child rels where focal is person2 (the child)
    const parentIds = rawRels
      .filter(r => r.type === 'parent_child' && r.person2_id === focalId)
      .map(r => r.person1_id)
      .filter((id): id is string => id !== null)
      .slice(0, 2);

    const parents = (await Promise.all([
      parentIds[0] ? fetchPersonNode(parentIds[0]) : null,
      parentIds[1] ? fetchPersonNode(parentIds[1]) : null,
    ])) as [PersonNode | null, PersonNode | null];

    const gpPairs = await Promise.all(
      parents.map(async (parent): Promise<[PersonNode | null, PersonNode | null]> => {
        if (!parent) return [null, null];
        const pRels = (await window.api.relationships.getForPerson(parent.id)) as RawRel[];
        const gpIds = pRels
          .filter(r => r.type === 'parent_child' && r.person2_id === parent.id)
          .map(r => r.person1_id)
          .filter((id): id is string => id !== null)
          .slice(0, 2);
        return [
          gpIds[0] ? await fetchPersonNode(gpIds[0]) : null,
          gpIds[1] ? await fetchPersonNode(gpIds[1]) : null,
        ];
      })
    );

    return {
      focal,
      parents,
      grandparents: [...gpPairs[0], ...gpPairs[1]] as [
        PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null,
      ],
    };
  }

  export async function fetchHourglassTree(focalId: string): Promise<HourglassTree> {
    const [pedigree, rawRels] = await Promise.all([
      fetchPedigreeTree(focalId),
      window.api.relationships.getForPerson(focalId),
    ]) as [PedigreeTree, RawRel[]];

    // Children: parent_child rels where focal is person1 (the parent)
    const childIds = rawRels
      .filter(r => r.type === 'parent_child' && r.person1_id === focalId)
      .map(r => r.person2_id)
      .filter((id): id is string => id !== null);

    const children = await Promise.all(childIds.map(fetchPersonNode));
    return { ...pedigree, children };
  }

  export async function fetchTimelineEntries(focalId: string): Promise<TimelineEntry[]> {
    const rawRels = (await window.api.relationships.getForPerson(focalId)) as RawRel[];

    const relatedIds = new Set<string>();
    rawRels.forEach(r => {
      if (r.person1_id && r.person1_id !== focalId) relatedIds.add(r.person1_id);
      if (r.person2_id && r.person2_id !== focalId) relatedIds.add(r.person2_id);
    });

    const allIds = [focalId, ...relatedIds];
    const nodes = await Promise.all(allIds.map(id => fetchPersonNode(id).catch(() => null)));

    return nodes
      .filter((n): n is PersonNode => n !== null)
      .map(person => ({ person, isFocal: person.id === focalId }));
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): add chartData utility for fetching tree data via IPC"
  ```

---

## Task 4: VisualizationView + Router

**Files:**
- Modify: `src/renderer/router.ts`
- Create: `src/renderer/views/VisualizationView.vue`
- Create: `tests/components/VisualizationView.test.ts`

- [ ] **Step 1: Write the failing component test**

  Create `tests/components/VisualizationView.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { mount, flushPromises } from '@vue/test-utils';
  import VisualizationView from '../../src/renderer/views/VisualizationView.vue';
  import { i18n } from './setup';

  vi.mock('vue-router', () => ({
    useRoute: () => ({ params: { personId: 'test-id' } }),
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
    RouterLink: { template: '<a><slot /></a>' },
  }));

  // Stub chart components so they don't make IPC calls
  vi.mock('../../src/renderer/components/charts/PedigreeChart.vue', () => ({
    default: { template: '<div class="stub-pedigree" />' },
  }));
  vi.mock('../../src/renderer/components/charts/HourglassChart.vue', () => ({
    default: { template: '<div class="stub-hourglass" />' },
  }));
  vi.mock('../../src/renderer/components/charts/TimelineChart.vue', () => ({
    default: { template: '<div class="stub-timeline" />' },
  }));
  vi.mock('../../src/renderer/components/PersonPicker.vue', () => ({
    default: { template: '<div class="stub-picker" />', props: ['modelValue'] },
  }));

  describe('VisualizationView', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      localStorage.clear();
      (window as unknown as { api: unknown }).api = {
        persons: {
          get: vi.fn().mockResolvedValue({ id: 'test-id', sex: 'M', living: true }),
          getNames: vi.fn().mockResolvedValue([{ given_name: 'Magnus', surname: 'Eriksson', sort_order: 0 }]),
          list: vi.fn().mockResolvedValue([]),
        },
      };
    });

    it('displays the focal person name after loading', async () => {
      const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
      await flushPromises();
      expect(wrapper.text()).toContain('Magnus Eriksson');
    });

    it('renders the pedigree chart tab by default', async () => {
      const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
      await flushPromises();
      expect(wrapper.find('.stub-pedigree').exists()).toBe(true);
    });

    it('switches to hourglass tab when clicked', async () => {
      const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
      await flushPromises();
      const tabs = wrapper.findAll('.tab');
      const hourglassTab = tabs.find(t => t.text().includes('Hourglass') || t.text().includes('Timglas'));
      expect(hourglassTab).toBeDefined();
      await hourglassTab!.trigger('click');
      expect(wrapper.find('.stub-hourglass').exists()).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test — verify it fails**

  Run: `npm test -- --reporter=verbose 2>&1 | grep -E "VisualizationView"`
  Expected: FAIL "Cannot find module".

- [ ] **Step 3: Add routes to `src/renderer/router.ts`**

  Add after the `/places/:id` route:

  ```typescript
  import VisualizationView from './views/VisualizationView.vue';
  ```

  And in the routes array:

  ```typescript
  { path: '/visualisering', component: VisualizationView },
  { path: '/visualisering/:personId', component: VisualizationView },
  ```

- [ ] **Step 4: Create `src/renderer/views/VisualizationView.vue`**

  ```vue
  <template>
    <div class="viz-view">
      <!-- Entry state: no personId in URL -->
      <div v-if="!personId" class="viz-empty">
        <h2>{{ $t('visualization.title') }}</h2>
        <p v-if="hasPerson" class="viz-hint">{{ $t('visualization.selectPerson') }}</p>
        <p v-else class="viz-hint">{{ $t('visualization.empty') }}</p>
        <PersonPicker v-if="hasPerson" :modelValue="null" @select="onSelectPerson" />
      </div>

      <!-- Main viz state: focal person loaded -->
      <template v-else>
        <div class="viz-header">
          <button class="btn-back" @click="$router.back()">{{ $t('common.back') }}</button>
          <h2 v-if="focalName">{{ focalName }}</h2>
          <router-link v-if="personId" :to="'/persons/' + personId" class="btn-link">
            {{ $t('visualization.viewDetail') }} →
          </router-link>
        </div>

        <div class="viz-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            :class="['tab', { active: activeTab === tab.key }]"
            @click="setTab(tab.key)"
          >{{ tab.label }}</button>
        </div>

        <div class="viz-area">
          <PedigreeChart  v-if="activeTab === 'pedigree'"  :personId="personId" />
          <HourglassChart v-if="activeTab === 'hourglass'" :personId="personId" />
          <TimelineChart  v-if="activeTab === 'timeline'"  :personId="personId" />
        </div>
      </template>
    </div>
  </template>

  <script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import PersonPicker from '../components/PersonPicker.vue';
  import PedigreeChart from '../components/charts/PedigreeChart.vue';
  import HourglassChart from '../components/charts/HourglassChart.vue';
  import TimelineChart from '../components/charts/TimelineChart.vue';

  declare const window: Window & {
    api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  };

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();

  const personId = computed(() => route.params.personId as string | undefined);
  const activeTab = ref<string>(localStorage.getItem('viz-tab') ?? 'pedigree');
  const focalName = ref<string | null>(null);
  const hasPerson = ref(false);

  const tabs = computed(() => [
    { key: 'pedigree',  label: t('visualization.tab.pedigree') },
    { key: 'hourglass', label: t('visualization.tab.hourglass') },
    { key: 'timeline',  label: t('visualization.tab.timeline') },
  ]);

  function setTab(key: string) {
    activeTab.value = key;
    localStorage.setItem('viz-tab', key);
  }

  function onSelectPerson(person: unknown) {
    router.push('/visualisering/' + (person as { id: string }).id);
  }

  async function loadFocalPerson() {
    // Check if any persons exist (for entry state)
    const list = (await window.api.persons.list()) as { id: string }[];
    hasPerson.value = list.length > 0;

    if (!personId.value) return;
    localStorage.setItem('viz-focal-person', personId.value);

    const person = (await window.api.persons.get(personId.value)) as { id: string } | null;
    if (!person) return;

    const names = (await window.api.persons.getNames(personId.value)) as
      { given_name: string | null; surname: string | null; sort_order: number }[];
    const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
    const primary = sorted[0] ?? { given_name: null, surname: null };
    focalName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ') || null;
  }

  onMounted(loadFocalPerson);
  watch(personId, loadFocalPerson);
  </script>

  <style scoped>
  .viz-view { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

  .viz-empty { padding: 40px 24px; }
  .viz-empty h2 { font-size: 20px; color: #2c3e50; margin-bottom: 12px; }
  .viz-hint { color: #888; margin-bottom: 20px; }

  .viz-header {
    background: white;
    border-bottom: 1px solid #e0e0e0;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }
  .viz-header h2 { font-size: 17px; color: #2c3e50; font-weight: 600; flex: 1; }
  .btn-back { font-size: 12px; color: #888; background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 3px; }
  .btn-back:hover { background: #f0f0f0; }
  .btn-link { font-size: 13px; color: #2c3e50; text-decoration: none; }
  .btn-link:hover { text-decoration: underline; }

  .viz-tabs {
    background: white;
    border-bottom: 1px solid #e0e0e0;
    padding: 0 24px;
    display: flex;
    flex-shrink: 0;
  }
  .tab {
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 500;
    color: #888;
    cursor: pointer;
    border: none;
    background: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-family: inherit;
  }
  .tab:hover { color: #444; }
  .tab.active { color: #2c3e50; border-bottom-color: #2c3e50; }

  .viz-area { flex: 1; padding: 24px; overflow: auto; }
  </style>
  ```

- [ ] **Step 5: Run test — verify it passes**

  Run: `npm test -- --reporter=verbose 2>&1 | grep -E "VisualizationView"`
  Expected: All 3 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): add VisualizationView, router routes, and component test"
  ```

---

## Task 5: PedigreeChart

**Files:**
- Create: `src/renderer/components/charts/PedigreeChart.vue`
- Create: `tests/components/PedigreeChart.test.ts`

- [ ] **Step 1: Write the failing component test**

  Create `tests/components/PedigreeChart.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { mount, flushPromises } from '@vue/test-utils';
  import PedigreeChart from '../../src/renderer/components/charts/PedigreeChart.vue';
  import { i18n } from './setup';

  vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
  }));

  describe('PedigreeChart', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (window as unknown as { api: unknown }).api = {
        persons: {
          get: vi.fn().mockResolvedValue({ id: 'p1', sex: 'M', living: true }),
          getNames: vi.fn().mockResolvedValue([{ given_name: 'Magnus', surname: 'Eriksson', sort_order: 0 }]),
        },
        events: { forPerson: vi.fn().mockResolvedValue([]) },
        relationships: { getForPerson: vi.fn().mockResolvedValue([]) },
      };
    });

    it('renders an SVG after data loads', async () => {
      const wrapper = mount(PedigreeChart, {
        global: { plugins: [i18n] },
        props: { personId: 'p1' },
      });
      await flushPromises();
      expect(wrapper.find('svg').exists()).toBe(true);
    });

    it('renders at least one rect for the focal person box', async () => {
      const wrapper = mount(PedigreeChart, {
        global: { plugins: [i18n] },
        props: { personId: 'p1' },
      });
      await flushPromises();
      expect(wrapper.findAll('rect').length).toBeGreaterThan(0);
    });

    it('shows the focal person name', async () => {
      const wrapper = mount(PedigreeChart, {
        global: { plugins: [i18n] },
        props: { personId: 'p1' },
      });
      await flushPromises();
      expect(wrapper.text()).toContain('Magnus Eriksson');
    });
  });
  ```

- [ ] **Step 2: Run test — verify it fails**

  Run: `npm test -- --reporter=verbose 2>&1 | grep -E "PedigreeChart"`
  Expected: FAIL "Cannot find module".

- [ ] **Step 3: Create `src/renderer/components/charts/PedigreeChart.vue`**

  ```vue
  <template>
    <div class="chart-wrap">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <template v-else>
        <svg
          :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
          width="100%"
          :style="{ maxWidth: layout.svgWidth + 'px' }"
        >
          <line
            v-for="(ln, i) in layout.lines"
            :key="'l' + i"
            :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
            stroke="#ccc" stroke-width="1.5"
          />
          <g
            v-for="box in layout.boxes"
            :key="box.person.id"
            :class="['person-box', { clickable: !box.isFocal }]"
            @click="!box.isFocal && navigate(box.person.id)"
          >
            <rect
              :x="box.x" :y="box.y" :width="box.w" :height="box.h"
              rx="4"
              :fill="boxFill(box)"
              :stroke="box.isFocal ? '#1a2a3a' : '#ddd'"
              stroke-width="1"
            />
            <rect
              :x="box.x" :y="box.y"
              width="4" :height="box.h"
              rx="2"
              :fill="sexColor(box.person.sex)"
            />
            <text
              :x="box.x + 12" :y="box.y + 17"
              font-size="12"
              font-weight="600"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              :fill="box.isFocal ? 'white' : '#333'"
            >{{ personName(box.person) }}</text>
            <text
              :x="box.x + 12" :y="box.y + 32"
              font-size="10"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              :fill="box.isFocal ? 'rgba(255,255,255,0.65)' : '#888'"
            >{{ personDates(box.person) }}</text>
          </g>
        </svg>
        <div class="legend">
          <span class="leg-item"><span class="swatch" style="background:#7eb8f7" />{{ $t('visualization.legend.male') }}</span>
          <span class="leg-item"><span class="swatch" style="background:#f7a5c0" />{{ $t('visualization.legend.female') }}</span>
          <span class="leg-item"><span class="swatch" style="background:#ccc" />{{ $t('visualization.legend.unknown') }}</span>
        </div>
      </template>
    </div>
  </template>

  <script setup lang="ts">
  import { ref, onMounted, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { computePedigreeLayout } from '../../utils/chartLayout';
  import type { ChartLayout, BoxLayout, PersonNode } from '../../utils/chartLayout';
  import { fetchPedigreeTree } from '../../utils/chartData';

  const props = defineProps<{ personId: string }>();
  const router = useRouter();
  const loading = ref(true);
  const layout = ref<ChartLayout>({ boxes: [], lines: [], svgWidth: 400, svgHeight: 200 });

  function boxFill(box: BoxLayout): string {
    if (box.isFocal) return '#2c3e50';
    if (!box.person.living) return '#f8f8f8';
    return 'white';
  }

  function sexColor(sex: string): string {
    if (sex === 'M') return '#7eb8f7';
    if (sex === 'F') return '#f7a5c0';
    return '#ccc';
  }

  function personName(person: PersonNode): string {
    return [person.givenName, person.surname].filter(Boolean).join(' ') || '(okänd)';
  }

  function personDates(person: PersonNode): string {
    if (person.birthYear && person.deathYear) return `${person.birthYear}–${person.deathYear}`;
    if (person.birthYear) return `f. ${person.birthYear}`;
    return '';
  }

  function navigate(id: string) {
    router.push('/visualisering/' + id);
  }

  async function load() {
    loading.value = true;
    try {
      const tree = await fetchPedigreeTree(props.personId);
      layout.value = computePedigreeLayout(tree);
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);
  watch(() => props.personId, load);
  </script>

  <style scoped>
  .chart-wrap { background: white; border-radius: 6px; border: 1px solid #e0e0e0; padding: 20px; overflow: auto; }
  .chart-loading { color: #888; padding: 40px; text-align: center; }
  .person-box.clickable { cursor: pointer; }
  .person-box.clickable:hover rect:first-child { stroke-width: 2; stroke: #2c3e50; }
  .legend { display: flex; gap: 16px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #f0f0f0; font-size: 12px; color: #888; }
  .leg-item { display: flex; align-items: center; gap: 6px; }
  .swatch { display: inline-block; width: 14px; height: 12px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.1); }
  </style>
  ```

- [ ] **Step 4: Run test — verify it passes**

  Run: `npm test -- --reporter=verbose 2>&1 | grep -E "PedigreeChart"`
  Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): add PedigreeChart SVG component"
  ```

---

## Task 6: HourglassChart

**Files:**
- Create: `src/renderer/components/charts/HourglassChart.vue`

No separate component test for hourglass — it shares identical IPC/rendering structure with PedigreeChart and is covered by the layout unit tests.

- [ ] **Step 1: Create `src/renderer/components/charts/HourglassChart.vue`**

  ```vue
  <template>
    <div class="chart-wrap">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <template v-else>
        <div class="gen-labels">
          <div v-if="hasGrandparents" class="gen-label" :style="{ top: gpLabelY + 'px' }">
            {{ $t('visualization.generation.grandparents') }}
          </div>
          <div v-if="hasParents" class="gen-label" :style="{ top: parentLabelY + 'px' }">
            {{ $t('visualization.generation.parents') }}
          </div>
          <div class="gen-label focal-label" :style="{ top: focalLabelY + 'px' }">
            {{ $t('visualization.generation.focal') }}
          </div>
          <div v-if="hasChildren" class="gen-label" :style="{ top: childLabelY + 'px' }">
            {{ $t('visualization.generation.children') }}
          </div>
        </div>
        <svg
          :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
          width="100%"
          :style="{ maxWidth: layout.svgWidth + 'px' }"
        >
          <line
            v-for="(ln, i) in layout.lines"
            :key="'l' + i"
            :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
            stroke="#ccc" stroke-width="1.5"
          />
          <g
            v-for="box in layout.boxes"
            :key="box.person.id"
            :class="['person-box', { clickable: !box.isFocal }]"
            @click="!box.isFocal && navigate(box.person.id)"
          >
            <rect
              :x="box.x" :y="box.y" :width="box.w" :height="box.h"
              rx="4"
              :fill="boxFill(box)"
              :stroke="box.isFocal ? '#1a2a3a' : '#ddd'"
              stroke-width="1"
            />
            <rect :x="box.x" :y="box.y" width="4" :height="box.h" rx="2" :fill="sexColor(box.person.sex)" />
            <text :x="box.x + 12" :y="box.y + 17" font-size="12" font-weight="600"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              :fill="box.isFocal ? 'white' : '#333'">{{ personName(box.person) }}</text>
            <text :x="box.x + 12" :y="box.y + 32" font-size="10"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              :fill="box.isFocal ? 'rgba(255,255,255,0.65)' : '#888'">{{ personDates(box.person) }}</text>
          </g>
        </svg>
      </template>
    </div>
  </template>

  <script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { computeHourglassLayout, BOX_H, GEN_GAP } from '../../utils/chartLayout';
  import type { ChartLayout, BoxLayout, PersonNode, HourglassTree } from '../../utils/chartLayout';
  import { fetchHourglassTree } from '../../utils/chartData';

  const props = defineProps<{ personId: string }>();
  const router = useRouter();
  const loading = ref(true);
  const layout = ref<ChartLayout>({ boxes: [], lines: [], svgWidth: 400, svgHeight: 200 });
  const tree = ref<HourglassTree | null>(null);

  const PAD = 10;
  const gpLabelY    = computed(() => PAD);
  const parentLabelY = computed(() => PAD + BOX_H + GEN_GAP);
  const focalLabelY  = computed(() => PAD + 2 * (BOX_H + GEN_GAP));
  const childLabelY  = computed(() => PAD + 3 * (BOX_H + GEN_GAP));

  const hasGrandparents = computed(() => tree.value?.grandparents.some(Boolean) ?? false);
  const hasParents      = computed(() => tree.value?.parents.some(Boolean) ?? false);
  const hasChildren     = computed(() => (tree.value?.children.length ?? 0) > 0);

  function boxFill(box: BoxLayout): string {
    if (box.isFocal) return '#2c3e50';
    if (!box.person.living) return '#f8f8f8';
    return 'white';
  }

  function sexColor(sex: string): string {
    if (sex === 'M') return '#7eb8f7';
    if (sex === 'F') return '#f7a5c0';
    return '#ccc';
  }

  function personName(person: PersonNode): string {
    return [person.givenName, person.surname].filter(Boolean).join(' ') || '(okänd)';
  }

  function personDates(person: PersonNode): string {
    if (person.birthYear && person.deathYear) return `${person.birthYear}–${person.deathYear}`;
    if (person.birthYear) return `f. ${person.birthYear}`;
    return '';
  }

  function navigate(id: string) {
    router.push('/visualisering/' + id);
  }

  async function load() {
    loading.value = true;
    try {
      const t = await fetchHourglassTree(props.personId);
      tree.value = t;
      layout.value = computeHourglassLayout(t);
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);
  watch(() => props.personId, load);
  </script>

  <style scoped>
  .chart-wrap { position: relative; background: white; border-radius: 6px; border: 1px solid #e0e0e0; padding: 20px; overflow: auto; }
  .chart-loading { color: #888; padding: 40px; text-align: center; }
  .gen-labels { position: absolute; left: 4px; top: 20px; font-size: 10px; color: #aaa; pointer-events: none; }
  .gen-label { position: absolute; left: 0; white-space: nowrap; }
  .focal-label { color: #2c3e50; font-weight: 500; }
  .person-box.clickable { cursor: pointer; }
  .person-box.clickable:hover rect:first-child { stroke-width: 2; stroke: #2c3e50; }
  </style>
  ```

- [ ] **Step 2: Run all tests**

  Run: `npm test`
  Expected: All tests pass. No new failures.

- [ ] **Step 3: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): add HourglassChart SVG component"
  ```

---

## Task 7: TimelineChart

**Files:**
- Create: `src/renderer/components/charts/TimelineChart.vue`

- [ ] **Step 1: Create `src/renderer/components/charts/TimelineChart.vue`**

  ```vue
  <template>
    <div class="chart-wrap">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <template v-else>
        <svg
          :viewBox="`0 0 ${tl.svgWidth} ${tl.svgHeight}`"
          width="100%"
          :style="{ maxWidth: tl.svgWidth + 'px' }"
        >
          <!-- Grid lines at decade ticks -->
          <line
            v-for="tick in tl.ticks"
            :key="'grid' + tick.year"
            :x1="tick.x" y1="0" :x2="tick.x" :y2="tl.axisY"
            stroke="#f5f5f5" stroke-width="1"
          />

          <!-- Bars -->
          <g v-for="bar in tl.bars" :key="bar.person.id">
            <!-- Bar rectangle -->
            <rect
              :x="bar.x" :y="bar.y"
              :width="bar.w" :height="bar.h"
              rx="3"
              :fill="barColor(bar)"
              :opacity="bar.person.living ? 1 : 0.8"
            />
            <!-- Arrow for living persons -->
            <polygon
              v-if="bar.isOpen"
              :points="`${bar.x + bar.w},${bar.y} ${bar.x + bar.w},${bar.y + bar.h} ${bar.x + bar.w + 10},${bar.y + bar.h / 2}`"
              :fill="barColor(bar)"
            />
            <!-- "?" stub for no birth date -->
            <text
              v-if="bar.hasNoDate"
              :x="bar.x + 4" :y="bar.y + bar.h - 6"
              font-size="11"
              fill="white"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            >?</text>
            <!-- Person name label (left of bar) -->
            <text
              :x="bar.x - 4" :y="bar.y + bar.h / 2 + 4"
              font-size="11"
              :font-weight="bar.isFocal ? '600' : '400'"
              :fill="bar.isFocal ? '#2c3e50' : '#555'"
              text-anchor="end"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            >{{ personName(bar.person) }}</text>
          </g>

          <!-- Axis line -->
          <line :x1="LEFT" :y1="tl.axisY" :x2="tl.svgWidth - 20" :y2="tl.axisY" stroke="#ddd" stroke-width="1" />

          <!-- Tick marks and labels -->
          <g v-for="tick in tl.ticks" :key="'tick' + tick.year">
            <line :x1="tick.x" :y1="tl.axisY - 3" :x2="tick.x" :y2="tl.axisY + 5" stroke="#ccc" stroke-width="1" />
            <text
              :x="tick.x" :y="tl.axisY + 16"
              font-size="10" text-anchor="middle" fill="#aaa"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            >{{ tick.year }}</text>
          </g>

          <!-- Today line -->
          <line
            :x1="tl.todayX" y1="0" :x2="tl.todayX" :y2="tl.axisY"
            stroke="#e88" stroke-width="1" stroke-dasharray="4,3"
          />
          <text
            :x="tl.todayX" y="12"
            font-size="9" text-anchor="middle" fill="#e88"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          >{{ $t('visualization.legend.today') }}</text>
        </svg>
      </template>
    </div>
  </template>

  <script setup lang="ts">
  import { ref, onMounted, watch } from 'vue';
  import { computeTimelineLayout } from '../../utils/chartLayout';
  import type { TimelineLayout, BarLayout, PersonNode } from '../../utils/chartLayout';
  import { fetchTimelineEntries } from '../../utils/chartData';

  const props = defineProps<{ personId: string }>();
  const loading = ref(true);
  const tl = ref<TimelineLayout>({
    bars: [], ticks: [], todayX: 0, svgWidth: 800, svgHeight: 100, axisY: 80,
  });

  const LEFT = 164; // matches TL_LEFT_MARGIN in chartLayout.ts

  function barColor(bar: BarLayout): string {
    if (bar.isFocal) return '#2c3e50';
    const sex = bar.person.sex;
    if (sex === 'M') return '#7eb8f7';
    if (sex === 'F') return '#f7a5c0';
    return '#bbb';
  }

  function personName(person: PersonNode): string {
    return [person.givenName, person.surname].filter(Boolean).join(' ') || '(okänd)';
  }

  async function load() {
    loading.value = true;
    try {
      const entries = await fetchTimelineEntries(props.personId);
      tl.value = computeTimelineLayout(entries, new Date().getFullYear());
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);
  watch(() => props.personId, load);
  </script>

  <style scoped>
  .chart-wrap { background: white; border-radius: 6px; border: 1px solid #e0e0e0; padding: 20px; overflow: auto; }
  .chart-loading { color: #888; padding: 40px; text-align: center; }
  </style>
  ```

- [ ] **Step 2: Run all tests**

  Run: `npm test`
  Expected: All tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): add TimelineChart SVG component"
  ```

---

## Task 8: App.vue sidebar + PersonDetailView button

**Files:**
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/views/PersonDetailView.vue`

- [ ] **Step 1: Add Visualisering to sidebar in `App.vue`**

  In `src/renderer/App.vue`, in the `<nav class="sidebar">` template section, add `router-link` to Visualisering as the **first nav link** (before the Persons link), and add a search entry for Sök:

  Replace the existing nav links block:
  ```html
  <router-link to="/">{{ $t('nav.persons') }}</router-link>
  <router-link to="/relationships">{{ $t('nav.relationships') }}</router-link>
  <router-link to="/sources">{{ $t('nav.sources') }}</router-link>
  <router-link to="/places">{{ $t('places.title') }}</router-link>
  ```

  With:
  ```html
  <router-link to="/visualisering">{{ $t('nav.visualization') }}</router-link>
  <router-link to="/">{{ $t('nav.persons') }}</router-link>
  <router-link to="/relationships">{{ $t('nav.relationships') }}</router-link>
  <router-link to="/sources">{{ $t('nav.sources') }}</router-link>
  <router-link to="/places">{{ $t('places.title') }}</router-link>
  ```

- [ ] **Step 2: Add "Visa i träd →" button to PersonDetailView**

  In `src/renderer/views/PersonDetailView.vue`, find the `<div class="detail-header">` section. After the existing `<button class="btn-back">` and before the `<div class="header-info">`, add:

  ```html
  <button class="btn-viz" @click="$router.push('/visualisering/' + personId)">
    {{ $t('personDetail.viewInTree') }}
  </button>
  ```

  Then add the style:
  ```css
  .btn-viz {
    font-size: 12px;
    color: #2c3e50;
    background: none;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-viz:hover { background: #f0f0f0; }
  ```

- [ ] **Step 3: Run all tests**

  Run: `npm test`
  Expected: All 78+ tests pass (or more, with new tests added in this plan).

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "feat(viz): reorder sidebar, add view-in-tree button to PersonDetailView"
  ```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite with coverage**

  Run: `npm test -- --coverage`
  Expected: All tests pass. `src/api/` coverage stays above 80% thresholds.

- [ ] **Step 2: TypeScript clean compile**

  Run: `npx tsc --noEmit`
  Expected: No errors.

- [ ] **Step 3: Update PLAN.md checkboxes**

  In `.claude/PLAN.md`, mark all v0.4.1 tasks as done.

- [ ] **Step 4: Update package.json version to 0.4.1**

  In `package.json`, change `"version": "0.4.0"` to `"version": "0.4.1"`.

- [ ] **Step 5: Final commit**

  ```bash
  git add -A
  git commit -m "feat: v0.4.1 — visualization layer complete; bump version to 0.4.1"
  ```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Three chart types: Pedigree (Task 5), Hourglass (Task 6), Timeline (Task 7)
- ✅ Visualization as primary nav (Task 8 — Visualisering first in sidebar)
- ✅ Click-to-navigate (each chart box has `navigate(id)` call to `router.push`)
- ✅ Focal person header (Task 4 — VisualizationView)
- ✅ Tab persistence to localStorage (Task 4 — VisualizationView)
- ✅ `/visualisering` empty state with PersonPicker (Task 4)
- ✅ PersonDetailView "Visa i träd" button (Task 8)
- ✅ SVG scales to container via `viewBox + width="100%"` (all chart components)
- ✅ i18n strings for all new UI text (Task 1)
- ✅ Unit tests for layout algorithms (Task 2)
- ✅ Component tests for VisualizationView and PedigreeChart (Tasks 4, 5)
- ✅ No new schema, IPC, or MCP changes
- ✅ Version bump (Task 9)

**Type consistency check:**
- `PersonNode`, `BoxLayout`, `Line`, `ChartLayout`, `PedigreeTree`, `HourglassTree`, `TimelineEntry`, `BarLayout`, `TickMark`, `TimelineLayout` — all defined in `chartLayout.ts`, imported consistently in `chartData.ts` and chart components.
- `fetchPersonNode`, `fetchPedigreeTree`, `fetchHourglassTree`, `fetchTimelineEntries` — defined in `chartData.ts`, used in chart components.
- `computePedigreeLayout`, `computeHourglassLayout`, `computeTimelineLayout` — defined in `chartLayout.ts`, used in chart components and unit tests.
- `BOX_W`, `BOX_H`, `GEN_GAP` exported from `chartLayout.ts` and used in `HourglassChart.vue`.
