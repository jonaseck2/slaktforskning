/**
 * Additional unit tests for src/renderer/utils/chart-layout/descendant.ts
 *
 * chartLayout.test.ts already covers the basic computeDescendantLayout happy path
 * (single root, 1-2 generation trees, curved paths). This file targets the
 * remaining uncovered branches:
 *
 *   - Line 41:   collapse pruning (collapsed.has(`id:down`))
 *   - Line 145:  hasMoreDown button (isLoadMore branch)
 *   - Lines 56+: selectedPersonId outline-extents block (findPersonInTree coverage)
 *   - Lines 180+: post-layout selectedPersonId pass (selBox lookup, unplacedSpouses/
 *                 parents/children evaluation)
 *   - Lines 326-343: findParentOf / findPersonInTree internal helpers
 *   - Position invariants for multi-generation and multi-child trees
 */

import { describe, it, expect } from 'vitest';
import { computeDescendantLayout, PLACEHOLDER_PREFIX } from '../../src/renderer/utils/chart-layout';
import type { DescendantNode, PersonNode } from '../../src/renderer/utils/chart-layout';
import { BOX_W, MIN_BOX_H, V_GAP, GEN_GAP, PAD } from '../../src/renderer/utils/chart-layout/constants';

// ─── helpers ─────────────────────────────────────────────────────────────────

function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
  return {
    id,
    givenName: 'Test',
    surname: 'Person',
    preferredName: null,
    nickname: null,
    sex: 'U',
    living: true,
    birthDate: null,
    deathDate: null,
    birthPlace: null,
    deathPlace: null,
    photoUrl: null,
    ...overrides,
  };
}

/** Build a DescendantNode tree from a simple spec. */
function dn(person: PersonNode, children: DescendantNode[] = [], opts: Partial<DescendantNode> = {}): DescendantNode {
  return { person, children, ...opts };
}

/** Assert that no two boxes overlap. */
function assertNoOverlaps(boxes: { person: PersonNode; x: number; y: number; w: number; h: number }[]): void {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap =
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
      if (overlap) {
        throw new Error(
          `Overlap: ${a.person.id} (${a.x},${a.y} ${a.w}x${a.h}) ` +
          `and ${b.person.id} (${b.x},${b.y} ${b.w}x${b.h})`,
        );
      }
    }
  }
}

/** Assert all boxes fit within the SVG bounds. */
function assertWithinBounds(
  boxes: { x: number; y: number; w: number; h: number }[],
  svgWidth: number,
  svgHeight: number,
): void {
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(svgWidth + 1); // +1 for float rounding
    expect(b.y + b.h).toBeLessThanOrEqual(svgHeight + 1);
  }
}

// ─── basic single-person layout ──────────────────────────────────────────────

describe('computeDescendantLayout — single root, no children', () => {
  it('returns exactly one box for a lone root', () => {
    const root = dn(p('focal'));
    const { boxes } = computeDescendantLayout(root, 2);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].isFocal).toBe(true);
    expect(boxes[0].w).toBe(BOX_W);
    expect(boxes[0].h).toBeGreaterThanOrEqual(MIN_BOX_H);
  });

  it('root is placed at PAD from left edge', () => {
    const root = dn(p('focal'));
    const { boxes } = computeDescendantLayout(root, 2);
    // rootCX = PAD + leftExt, x = rootCX - BOX_W/2
    // leftExt = BOX_W/2 for a leaf → x = PAD + 0 = PAD
    expect(boxes[0].x).toBe(PAD);
  });

  it('produces no connector paths for a lone root', () => {
    const { paths } = computeDescendantLayout(dn(p('focal')), 2);
    expect(paths).toHaveLength(0);
  });

  it('svgWidth is at least BOX_W + 2*PAD', () => {
    const { svgWidth } = computeDescendantLayout(dn(p('focal')), 2);
    expect(svgWidth).toBeGreaterThanOrEqual(BOX_W + 2 * PAD);
  });

  it('viewBoxMinY is 0 for a plain root', () => {
    const { viewBoxMinY } = computeDescendantLayout(dn(p('focal')), 2);
    expect(viewBoxMinY).toBe(0);
  });
});

// ─── two-generation tree ─────────────────────────────────────────────────────

describe('computeDescendantLayout — two-generation tree', () => {
  it('places children below the focal box', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { boxes } = computeDescendantLayout(root, 2);
    const focal = boxes.find(b => b.person.id === 'f')!;
    const children = boxes.filter(b => b.person.id !== 'f');
    expect(children).toHaveLength(2);
    children.forEach(c => expect(c.y).toBeGreaterThan(focal.y + focal.h));
  });

  it('children share the same y coordinate (same generation row)', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2')), dn(p('c3'))]);
    const { boxes } = computeDescendantLayout(root, 2);
    const children = boxes.filter(b => b.person.id !== 'f');
    expect(new Set(children.map(c => c.y)).size).toBe(1);
  });

  it('siblings are ordered left-to-right (x increases with index)', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2')), dn(p('c3'))]);
    const { boxes } = computeDescendantLayout(root, 2);
    const children = boxes.filter(b => b.person.id !== 'f');
    children.sort((a, b) => a.x - b.x);
    // Just ensure they're ordered and have non-negative gap
    for (let i = 1; i < children.length; i++) {
      expect(children[i].x).toBeGreaterThanOrEqual(children[i - 1].x + BOX_W + V_GAP - 1);
    }
  });

  it('no overlaps in a two-generation tree', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2')), dn(p('c3'))]);
    const { boxes, svgWidth, svgHeight } = computeDescendantLayout(root, 2);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('generates connector paths for each child', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { paths } = computeDescendantLayout(root, 2);
    // One curved-elbow path per child
    const realPaths = paths.filter(d => !d.startsWith('D:'));
    expect(realPaths).toHaveLength(2);
    realPaths.forEach(d => expect(d).toMatch(/^M /));
  });

  it('returns a collapseButton for root when it has children', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    const { collapseButtons } = computeDescendantLayout(root, 2);
    const btn = collapseButtons.find(b => b.personId === 'f');
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('down');
    expect(btn!.isExpanded).toBe(true);
    expect(btn!.isLoadMore).toBe(false);
  });

  it('svgHeight grows when a child generation is added', () => {
    const h1 = computeDescendantLayout(dn(p('f')), 2).svgHeight;
    const h2 = computeDescendantLayout(dn(p('f'), [dn(p('c1'))]), 2).svgHeight;
    expect(h2).toBeGreaterThan(h1);
  });
});

// ─── multi-generation deep tree ──────────────────────────────────────────────

describe('computeDescendantLayout — three-generation tree', () => {
  function makeThreeGen(): DescendantNode {
    return dn(p('f'), [
      dn(p('c1'), [dn(p('gc1')), dn(p('gc2'))]),
      dn(p('c2'), [dn(p('gc3'))]),
    ]);
  }

  it('grandchildren are placed below children', () => {
    const { boxes } = computeDescendantLayout(makeThreeGen(), 3);
    const c1 = boxes.find(b => b.person.id === 'c1')!;
    const gc1 = boxes.find(b => b.person.id === 'gc1')!;
    expect(gc1.y).toBeGreaterThan(c1.y + c1.h);
  });

  it('no overlaps in a three-generation branching tree', () => {
    const { boxes, svgWidth, svgHeight } = computeDescendantLayout(makeThreeGen(), 3);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('generations respect maxGenerations cap — gen 2 (grandchildren) is clipped when max is 1', () => {
    // maxGenerations=1: focal at depth 0, children at depth 1 — no deeper placement
    // (depth < maxGenerations check in place() is 1 < 1 = false)
    const { boxes } = computeDescendantLayout(makeThreeGen(), 1);
    // grandchildren should NOT appear
    expect(boxes.find(b => b.person.id === 'gc1')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'gc2')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'gc3')).toBeUndefined();
    // but children ARE shown
    expect(boxes.find(b => b.person.id === 'c1')).toBeDefined();
    expect(boxes.find(b => b.person.id === 'c2')).toBeDefined();
  });

  it('all three rows are at strictly increasing y values', () => {
    const { boxes } = computeDescendantLayout(makeThreeGen(), 3);
    const f  = boxes.find(b => b.person.id === 'f')!;
    const c1 = boxes.find(b => b.person.id === 'c1')!;
    const gc1 = boxes.find(b => b.person.id === 'gc1')!;
    expect(c1.y).toBeGreaterThan(f.y);
    expect(gc1.y).toBeGreaterThan(c1.y);
  });

  it('sibling gap between children is at least V_GAP', () => {
    const { boxes } = computeDescendantLayout(makeThreeGen(), 3);
    const c1 = boxes.find(b => b.person.id === 'c1')!;
    const c2 = boxes.find(b => b.person.id === 'c2')!;
    const [left, right] = c1.x < c2.x ? [c1, c2] : [c2, c1];
    expect(right.x - (left.x + left.w)).toBeGreaterThanOrEqual(V_GAP - 1);
  });
});

// ─── wide tree: five children at depth 1 ─────────────────────────────────────

describe('computeDescendantLayout — wide tree', () => {
  it('no overlaps: five children each with two grandchildren', () => {
    const children = Array.from({ length: 5 }, (_, i) =>
      dn(p(`c${i}`), [dn(p(`gc${i}a`)), dn(p(`gc${i}b`))]),
    );
    const root = dn(p('f'), children);
    const { boxes, svgWidth, svgHeight } = computeDescendantLayout(root, 3);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('svgWidth grows as more children are added', () => {
    const w1 = computeDescendantLayout(dn(p('f'), [dn(p('c1'))]), 2).svgWidth;
    const w3 = computeDescendantLayout(dn(p('f'), [dn(p('c1')), dn(p('c2')), dn(p('c3'))]), 2).svgWidth;
    expect(w3).toBeGreaterThan(w1);
  });

  it('returns one collapse button per person with children', () => {
    const root = dn(p('f'), [
      dn(p('c1'), [dn(p('gc1'))]),
      dn(p('c2'), [dn(p('gc2'))]),
    ]);
    const { collapseButtons } = computeDescendantLayout(root, 3);
    const downBtns = collapseButtons.filter(b => b.direction === 'down');
    // f, c1, c2 all have children
    expect(downBtns.length).toBeGreaterThanOrEqual(3);
  });

  it('collapse button is placed just below the box (cy = y + h + 10)', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    const { boxes, collapseButtons } = computeDescendantLayout(root, 2);
    const focalBox = boxes.find(b => b.person.id === 'f')!;
    const btn = collapseButtons.find(b => b.personId === 'f')!;
    expect(btn.cy).toBe(focalBox.y + focalBox.h + 10);
  });
});

// ─── collapse (line 41: node.children pruning) ───────────────────────────────

describe('computeDescendantLayout — collapse:down', () => {
  it('collapsing root:down hides all real children', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { boxes } = computeDescendantLayout(root, 2, new Set(['f:down']));
    expect(boxes.find(b => b.person.id === 'c1')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'c2')).toBeUndefined();
    // Focal still present
    expect(boxes.find(b => b.person.id === 'f')).toBeDefined();
  });

  it('collapsing root:down still shows a collapse button (isExpanded=false)', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    const { collapseButtons } = computeDescendantLayout(root, 2, new Set(['f:down']));
    const btn = collapseButtons.find(b => b.personId === 'f' && b.direction === 'down');
    expect(btn).toBeDefined();
    expect(btn!.isExpanded).toBe(false);
  });

  it('collapsing a mid-tree child hides its subtree but not siblings', () => {
    const root = dn(p('f'), [
      dn(p('c1'), [dn(p('gc1')), dn(p('gc2'))]),
      dn(p('c2'), [dn(p('gc3'))]),
    ]);
    const { boxes } = computeDescendantLayout(root, 3, new Set(['c1:down']));
    expect(boxes.find(b => b.person.id === 'gc1')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'gc2')).toBeUndefined();
    // c2 and its subtree still present
    expect(boxes.find(b => b.person.id === 'c2')).toBeDefined();
    expect(boxes.find(b => b.person.id === 'gc3')).toBeDefined();
  });

  it('no overlaps after collapsing one branch', () => {
    const root = dn(p('f'), [
      dn(p('c1'), [dn(p('gc1')), dn(p('gc2'))]),
      dn(p('c2'), [dn(p('gc3'))]),
    ]);
    const { boxes, svgWidth, svgHeight } = computeDescendantLayout(root, 3, new Set(['c1:down']));
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('svgWidth is narrower after collapsing a wide subtree', () => {
    const root = dn(p('f'), [
      dn(p('c1'), [dn(p('gc1')), dn(p('gc2')), dn(p('gc3'))]),
      dn(p('c2'), []),
    ]);
    const expanded = computeDescendantLayout(root, 3);
    const collapsed = computeDescendantLayout(root, 3, new Set(['c1:down']));
    expect(collapsed.svgWidth).toBeLessThan(expanded.svgWidth);
  });
});

// ─── hasMoreChildren → isLoadMore button (line 145) ──────────────────────────

describe('computeDescendantLayout — hasMoreChildren', () => {
  it('leaf with hasMoreChildren=true produces a load-more button', () => {
    const root = dn(p('f'), [dn(p('c1'), [], { hasMoreChildren: true })]);
    const { collapseButtons } = computeDescendantLayout(root, 2);
    const btn = collapseButtons.find(b => b.personId === 'c1');
    expect(btn).toBeDefined();
    expect(btn!.isLoadMore).toBe(true);
    expect(btn!.isExpanded).toBe(false);
    expect(btn!.direction).toBe('down');
  });

  it('leaf with hasMoreChildren=false produces no button', () => {
    const root = dn(p('f'), [dn(p('c1'), [], { hasMoreChildren: false })]);
    const { collapseButtons } = computeDescendantLayout(root, 2);
    const btn = collapseButtons.find(b => b.personId === 'c1');
    expect(btn).toBeUndefined();
  });

  it('root with hasMoreChildren=true and no real children produces load-more button', () => {
    const root = dn(p('f'), [], { hasMoreChildren: true });
    const { collapseButtons } = computeDescendantLayout(root, 2);
    const btn = collapseButtons.find(b => b.personId === 'f' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('down');
    expect(btn!.isExpanded).toBe(false);
  });

  it('node with real children AND hasMoreChildren=true: loaded children take priority over load-more', () => {
    // originalChildCount > 0 → collapse button (not load-more)
    const root = dn(p('f'), [dn(p('c1'))], { hasMoreChildren: true });
    const { collapseButtons } = computeDescendantLayout(root, 2);
    const btn = collapseButtons.find(b => b.personId === 'f');
    expect(btn).toBeDefined();
    // Has real children → isLoadMore should be false (collapse, not load-more)
    expect(btn!.isLoadMore).toBe(false);
  });
});

// ─── selectedPersonId post-layout pass (lines 56+, 180+, findPersonInTree) ───

describe('computeDescendantLayout — selectedPersonId', () => {
  it('passing selectedPersonId for a person in the tree does not crash', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    expect(() => computeDescendantLayout(root, 2, new Set(), 'c1')).not.toThrow();
  });

  it('selectedPersonId of the focal does not crash', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    expect(() => computeDescendantLayout(root, 2, new Set(), 'f')).not.toThrow();
  });

  it('selectedPersonId not in the tree does not crash', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    expect(() => computeDescendantLayout(root, 2, new Set(), 'nobody')).not.toThrow();
  });

  it('box count is the same regardless of selectedPersonId (no placeholder injection in descendant layout)', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const withoutSel = computeDescendantLayout(root, 2);
    const withSel = computeDescendantLayout(root, 2, new Set(), 'c1');
    // injectOutlines is voided in descendant.ts — no extra placeholder boxes
    expect(withSel.boxes.length).toBe(withoutSel.boxes.length);
  });

  it('y-positions are the same regardless of selectedPersonId', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const withoutSel = computeDescendantLayout(root, 2);
    const withSel    = computeDescendantLayout(root, 2, new Set(), 'c1');
    const c1without = withoutSel.boxes.find(b => b.person.id === 'c1')!;
    const c1with    = withSel.boxes.find(b => b.person.id === 'c1')!;
    expect(c1with.y).toBe(c1without.y);
  });

  it('selectedPersonId deep in the tree (grandchild) does not crash', () => {
    const root = dn(p('f'), [dn(p('c1'), [dn(p('gc1'))])]);
    expect(() => computeDescendantLayout(root, 3, new Set(), 'gc1')).not.toThrow();
  });

  it('selectedPersonId with collapse set — no crash and focal still present', () => {
    const root = dn(p('f'), [dn(p('c1'), [dn(p('gc1'))])]);
    const { boxes } = computeDescendantLayout(root, 3, new Set(['c1:down']), 'gc1');
    // gc1 is hidden by collapse but selectedPersonId still valid
    expect(boxes.find(b => b.person.id === 'f')).toBeDefined();
  });

  it('null selectedPersonId behaves like no selectedPersonId', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    const withNull  = computeDescendantLayout(root, 2, new Set(), null);
    const withUndef = computeDescendantLayout(root, 2);
    expect(withNull.boxes.length).toBe(withUndef.boxes.length);
    expect(withNull.svgWidth).toBe(withUndef.svgWidth);
  });
});

// ─── position invariants ──────────────────────────────────────────────────────

describe('computeDescendantLayout — position invariants', () => {
  it('children row top is at PAD + MIN_BOX_H + GEN_GAP (both at min height)', () => {
    // rowTopY[0] = PAD, rowTopY[1] = PAD + MIN_BOX_H + GEN_GAP
    const root = dn(p('f'), [dn(p('c1'))]);
    const { boxes } = computeDescendantLayout(root, 2);
    const child = boxes.find(b => b.person.id === 'c1')!;
    expect(child.y).toBe(PAD + MIN_BOX_H + GEN_GAP);
  });

  it('all boxes have positive width and height', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2')), dn(p('c3'))]);
    const { boxes } = computeDescendantLayout(root, 2);
    boxes.forEach(b => {
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
    });
  });

  it('all boxes have non-negative x and y', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { boxes } = computeDescendantLayout(root, 2);
    boxes.forEach(b => {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
    });
  });

  it('svgHeight is greater than the bottom of the deepest box', () => {
    const root = dn(p('f'), [dn(p('c1'), [dn(p('gc1'))])]);
    const { boxes, svgHeight } = computeDescendantLayout(root, 3);
    const maxBottom = Math.max(...boxes.map(b => b.y + b.h));
    expect(svgHeight).toBeGreaterThanOrEqual(maxBottom);
  });

  it('focal box is marked isFocal=true', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    const { boxes } = computeDescendantLayout(root, 2);
    const focal = boxes.find(b => b.person.id === 'f')!;
    expect(focal.isFocal).toBe(true);
    const child = boxes.find(b => b.person.id === 'c1')!;
    expect(child.isFocal).toBe(false);
  });

  it('generation row y-spacing equals min_box_h + gen_gap for uniform-height trees', () => {
    const root = dn(p('f'), [dn(p('c1'), [dn(p('gc1'))])]);
    const { boxes } = computeDescendantLayout(root, 3);
    const f   = boxes.find(b => b.person.id === 'f')!;
    const c1  = boxes.find(b => b.person.id === 'c1')!;
    const gc1 = boxes.find(b => b.person.id === 'gc1')!;
    expect(c1.y  - f.y).toBe(MIN_BOX_H + GEN_GAP);
    expect(gc1.y - c1.y).toBe(MIN_BOX_H + GEN_GAP);
  });
});

// ─── connector paths ──────────────────────────────────────────────────────────

describe('computeDescendantLayout — connector paths', () => {
  it('all real paths start with "M" (curved elbow)', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { paths } = computeDescendantLayout(root, 2);
    const realPaths = paths.filter(d => !d.startsWith('D:'));
    realPaths.forEach(d => expect(d).toMatch(/^M /));
  });

  it('curved paths contain a Q control point', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { paths } = computeDescendantLayout(root, 2);
    const realPaths = paths.filter(d => !d.startsWith('D:'));
    realPaths.forEach(d => expect(d).toContain('Q '));
  });

  it('number of connector paths equals total parent→child edges', () => {
    // f→c1, f→c2, c1→gc1, c1→gc2
    const root = dn(p('f'), [
      dn(p('c1'), [dn(p('gc1')), dn(p('gc2'))]),
      dn(p('c2'), []),
    ]);
    const { paths } = computeDescendantLayout(root, 3);
    const realPaths = paths.filter(d => !d.startsWith('D:'));
    expect(realPaths).toHaveLength(4); // 2 from f + 2 from c1
  });

  it('connectors from same depth share midY (alignment test)', () => {
    // Use a tall c1 and short c2 so fromY differs between the two.
    // This mirrors the pattern in chartLayout.test.ts "route alignment" tests.
    const tallC1: PersonNode = p('c1', {
      givenName: 'Aaaaaaaaa Bbbbbbbb Ccccccc Ddddddd',
      surname: 'Eeeeeeeeeee Ffffffffff',
    });
    const root = dn(p('f'), [
      dn(tallC1, [dn(p('gc1')), dn(p('gc2'))]),
      dn(p('c2'), [dn(p('gc3')), dn(p('gc4'))]),
    ]);
    const { boxes, paths } = computeDescendantLayout(root, 3);

    const c1box = boxes.find(b => b.person.id === 'c1')!;
    const c2box = boxes.find(b => b.person.id === 'c2')!;
    // Precondition: tall box must be taller
    expect(c1box.h).toBeGreaterThan(c2box.h);

    const fromC1Y = c1box.y + c1box.h;
    const fromC2Y = c2box.y + c2box.h;
    // Different fromY due to different heights
    expect(fromC1Y).not.toBeCloseTo(fromC2Y, 1);

    const realPaths = paths.filter(d => !d.startsWith('D:'));

    function parseMidY(path: string): number | null {
      const q = path.match(/Q ([\d.-]+),([\d.-]+)/);
      if (q) return parseFloat(q[2]);
      const v = path.match(/V ([\d.-]+) H/);
      if (v) return parseFloat(v[1]);
      return null;
    }

    function parseFromY(path: string): number {
      const m = path.match(/^M [\d.-]+,([\d.-]+)/);
      return m ? parseFloat(m[1]) : NaN;
    }

    const fromC1 = realPaths.filter(d => Math.abs(parseFromY(d) - fromC1Y) < 0.5);
    const fromC2 = realPaths.filter(d => Math.abs(parseFromY(d) - fromC2Y) < 0.5);
    expect(fromC1).toHaveLength(2);
    expect(fromC2).toHaveLength(2);

    const midYs = [...fromC1, ...fromC2].map(parseMidY).filter((y): y is number => y !== null);
    expect(midYs).toHaveLength(4);
    // All four depth-1→depth-2 connectors must share the same midY
    for (const y of midYs) expect(y).toBeCloseTo(midYs[0], 3);
  });
});

// ─── CollapseButton position ──────────────────────────────────────────────────

describe('computeDescendantLayout — collapseButton cx matches box center', () => {
  it('cx of the collapse button matches the center of the person\'s box', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { boxes, collapseButtons } = computeDescendantLayout(root, 2);
    for (const btn of collapseButtons) {
      const box = boxes.find(b => b.person.id === btn.personId);
      if (!box) continue; // collapsed nodes may have no box
      const expectedCX = box.x + box.w / 2;
      expect(btn.cx).toBeCloseTo(expectedCX, 1);
    }
  });
});

// ─── placeholders array is empty without injectOutlines ─────────────────────

describe('computeDescendantLayout — placeholders', () => {
  it('returns empty placeholders and placeholderLines arrays (injectOutlines is voided)', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { placeholders, placeholderLines } = computeDescendantLayout(root, 2);
    expect(placeholders).toHaveLength(0);
    expect(placeholderLines).toHaveLength(0);
  });

  it('no D: paths without placeholder children', () => {
    const root = dn(p('f'), [dn(p('c1'))]);
    const { paths } = computeDescendantLayout(root, 2);
    const dPaths = paths.filter(d => d.startsWith('D:'));
    expect(dPaths).toHaveLength(0);
  });
});

// ─── lines array is always empty (descendant layout uses paths only) ─────────

describe('computeDescendantLayout — lines', () => {
  it('lines array is always empty (descendant chart uses curved paths only)', () => {
    const root = dn(p('f'), [dn(p('c1')), dn(p('c2'))]);
    const { lines } = computeDescendantLayout(root, 2);
    expect(lines).toHaveLength(0);
  });
});

// ─── large branching tree — no overlaps ──────────────────────────────────────

describe('computeDescendantLayout — large branching tree', () => {
  it('no overlaps: 4 generations with branching factor 3', () => {
    function makeTree(depth: number, prefix: string): DescendantNode {
      if (depth === 0) return dn(p(prefix));
      return dn(p(prefix), [
        makeTree(depth - 1, prefix + 'a'),
        makeTree(depth - 1, prefix + 'b'),
        makeTree(depth - 1, prefix + 'c'),
      ]);
    }
    const root = makeTree(3, 'n');
    const { boxes, svgWidth, svgHeight } = computeDescendantLayout(root, 4);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: 3 generations with single-chain depth', () => {
    const root = dn(p('f'), [dn(p('c1'), [dn(p('gc1'), [dn(p('ggc1'))])])]);
    const { boxes, svgWidth, svgHeight } = computeDescendantLayout(root, 4);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });
});

// ─── placeholder extraction (lines 302-317) ──────────────────────────────────
//
// When a person box has a PLACEHOLDER_PREFIX ID it is extracted from `boxes`
// and moved into `placeholders` with a typed role.  This path is normally only
// reached via injectOutlines (currently voided in descendant.ts), but we can
// trigger it by including a DescendantNode whose person ID starts with the
// prefix — buildDescendantTreePerson does not set `isPlaceholder`, so it is
// treated as a real child, placed, and then extracted by the post-layout loop.

describe('computeDescendantLayout — placeholder extraction via PLACEHOLDER_PREFIX IDs', () => {
  it('father placeholder ID is extracted and role is father', () => {
    const phId = `${PLACEHOLDER_PREFIX}father_foo`;
    const root = dn(p('f'), [dn(p(phId))]);
    const { boxes, placeholders } = computeDescendantLayout(root, 2);
    expect(boxes.find(b => b.person.id === phId)).toBeUndefined();
    const ph = placeholders.find(x => x.role === 'father');
    expect(ph).toBeDefined();
    expect(ph!.childPersonId).toBe('foo');
  });

  it('mother placeholder ID is extracted and role is mother', () => {
    const phId = `${PLACEHOLDER_PREFIX}mother_bar`;
    const root = dn(p('f'), [dn(p(phId))]);
    const { boxes, placeholders } = computeDescendantLayout(root, 2);
    expect(boxes.find(b => b.person.id === phId)).toBeUndefined();
    const ph = placeholders.find(x => x.role === 'mother');
    expect(ph).toBeDefined();
    expect(ph!.childPersonId).toBe('bar');
  });

  it('spouse placeholder ID is extracted and role is spouse', () => {
    const phId = `${PLACEHOLDER_PREFIX}spouse_baz`;
    const root = dn(p('f'), [dn(p(phId))]);
    const { boxes, placeholders } = computeDescendantLayout(root, 2);
    expect(boxes.find(b => b.person.id === phId)).toBeUndefined();
    const ph = placeholders.find(x => x.role === 'spouse');
    expect(ph).toBeDefined();
    expect(ph!.childPersonId).toBe('baz');
  });

  it('son placeholder ID is extracted and role is son', () => {
    const phId = `${PLACEHOLDER_PREFIX}son_qux`;
    const root = dn(p('f'), [dn(p(phId))]);
    const { boxes, placeholders } = computeDescendantLayout(root, 2);
    expect(boxes.find(b => b.person.id === phId)).toBeUndefined();
    const ph = placeholders.find(x => x.role === 'son');
    expect(ph).toBeDefined();
    expect(ph!.childPersonId).toBe('qux');
  });

  it('daughter placeholder ID (fallthrough) is extracted and role is daughter', () => {
    const phId = `${PLACEHOLDER_PREFIX}daughter_quux`;
    const root = dn(p('f'), [dn(p(phId))]);
    const { boxes, placeholders } = computeDescendantLayout(root, 2);
    expect(boxes.find(b => b.person.id === phId)).toBeUndefined();
    const ph = placeholders.find(x => x.role === 'daughter');
    expect(ph).toBeDefined();
    expect(ph!.childPersonId).toBe('quux');
  });

  it('placeholder is removed from boxes and added to placeholders', () => {
    const realId = 'real';
    const phId = `${PLACEHOLDER_PREFIX}son_real`;
    const root = dn(p('f'), [dn(p(realId)), dn(p(phId))]);
    const { boxes, placeholders } = computeDescendantLayout(root, 2);
    // real child stays in boxes
    expect(boxes.find(b => b.person.id === realId)).toBeDefined();
    // placeholder is moved out of boxes
    expect(boxes.find(b => b.person.id === phId)).toBeUndefined();
    expect(placeholders.find(x => x.childPersonId === realId)).toBeDefined();
  });

  it('placeholder x and y are set from where the box was placed', () => {
    const phId = `${PLACEHOLDER_PREFIX}son_f`;
    const root = dn(p('f'), [dn(p(phId))]);
    const { placeholders } = computeDescendantLayout(root, 2);
    const ph = placeholders[0];
    expect(typeof ph.x).toBe('number');
    expect(typeof ph.y).toBe('number');
    expect(ph.x).toBeGreaterThanOrEqual(0);
    expect(ph.y).toBeGreaterThanOrEqual(0);
  });
});
