import { describe, it, expect } from 'vitest';
import {
  computePedigreeLayout,
  computeHourglassLayout,
  computeTimelineLayout,
  BOX_W,
  BOX_H,
} from '../../src/renderer/utils/chart-layout';
import type { PersonNode, PedigreeTree, HourglassTree } from '../../src/renderer/utils/chart-layout';

function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
  return {
    id, givenName: 'Test', surname: 'Person', preferredName: null,
    sex: 'U', living: true, birthDate: null, deathDate: null,
    ...overrides,
  };
}

// Build a PedigreeTree from a simple object spec for test readability.
// generations=3: focal + parents + grandparents (3-level).
function pedigree3(
  focal: PersonNode,
  parents: [PersonNode | null, PersonNode | null] = [null, null],
  grandparents: [PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null] = [null, null, null, null],
): PedigreeTree {
  const nodes = new Map<number, PersonNode>();
  nodes.set(1, focal);
  if (parents[0]) nodes.set(2, parents[0]);
  if (parents[1]) nodes.set(3, parents[1]);
  if (grandparents[0]) nodes.set(4, grandparents[0]);
  if (grandparents[1]) nodes.set(5, grandparents[1]);
  if (grandparents[2]) nodes.set(6, grandparents[2]);
  if (grandparents[3]) nodes.set(7, grandparents[3]);
  return { nodes, generations: 3 };
}

// Build a minimal HourglassTree with 2 ancestor levels (A=2: parents+gp).
function hourglass(
  focal: PersonNode,
  parents: [PersonNode | null, PersonNode | null] = [null, null],
  grandparents: [PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null] = [null, null, null, null],
  children: PersonNode[] = [],
  spouses: PersonNode[] = [],
  siblings: PersonNode[] = [],
): HourglassTree {
  return {
    ancestors: pedigree3(focal, parents, grandparents),
    descendantRoot: { person: focal, children: children.map(c => ({ person: c, children: [] })) },
    descendantGenerations: 3,
    spouses,
    siblings,
  };
}

describe('computePedigreeLayout', () => {
  it('returns one focal box when tree has no ancestors', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f')));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].isFocal).toBe(true);
    expect(boxes[0].w).toBe(BOX_W);
    expect(boxes[0].h).toBe(BOX_H);
  });

  it('places focal box at leftmost x (PAD=10)', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f')));
    expect(boxes[0].x).toBe(10);
  });

  it('generates no connector lines when no ancestors', () => {
    expect(computePedigreeLayout(pedigree3(p('f'))).lines).toHaveLength(0);
  });

  it('adds both parent boxes at genX[1]=215', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), p('p1')]));
    const parentBoxes = boxes.filter(b => !b.isFocal);
    expect(parentBoxes).toHaveLength(2);
    parentBoxes.forEach(b => expect(b.x).toBe(215));
  });

  it('places parents[0] above parents[1]', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), p('p1')]));
    const p0 = boxes.find(b => b.person.id === 'p0')!;
    const p1 = boxes.find(b => b.person.id === 'p1')!;
    expect(p0.y).toBeLessThan(p1.y);
  });

  it('generates connector lines when at least one parent exists', () => {
    const { lines } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), null]));
    expect(lines.length).toBeGreaterThan(0);
  });

  it('returns 7 boxes for a full 3-generation tree', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), p('gp2'), p('gp3')]);
    expect(computePedigreeLayout(tree).boxes).toHaveLength(7);
  });

  it('places grandparent boxes at genX[2]=420', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), null, p('gp2'), null]);
    const { boxes } = computePedigreeLayout(tree);
    const gpBoxes = boxes.filter(b => b.person.id === 'gp0' || b.person.id === 'gp2');
    gpBoxes.forEach(b => expect(b.x).toBe(420));
  });

  it('focal is vertically centered between parents', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), p('p1')]));
    const focal = boxes.find(b => b.isFocal)!;
    const p0 = boxes.find(b => b.person.id === 'p0')!;
    const p1 = boxes.find(b => b.person.id === 'p1')!;
    const focalCY = focal.y + BOX_H / 2;
    const p0cy = p0.y + BOX_H / 2;
    const p1cy = p1.y + BOX_H / 2;
    expect(focalCY).toBeCloseTo((p0cy + p1cy) / 2, 1);
  });

  it('returns 31 boxes for a full 5-generation tree', () => {
    const nodes = new Map<number, PersonNode>();
    for (let k = 1; k < 32; k++) nodes.set(k, p(`n${k}`));
    expect(computePedigreeLayout({ nodes, generations: 5 }).boxes).toHaveLength(31);
  });
});

describe('computeHourglassLayout', () => {
  it('places focal at horizontal center', () => {
    const { boxes, svgWidth } = computeHourglassLayout(hourglass(p('f')));
    const focal = boxes.find(b => b.isFocal)!;
    expect(focal.x).toBeCloseTo(svgWidth / 2 - BOX_W / 2, 0);
  });

  it('places child boxes below the focal box', () => {
    const { boxes } = computeHourglassLayout(hourglass(p('f'), [null, null], [null, null, null, null], [p('c1'), p('c2')]));
    const focal = boxes.find(b => b.isFocal)!;
    const children = boxes.filter(b => b.person.id === 'c1' || b.person.id === 'c2');
    expect(children).toHaveLength(2);
    children.forEach(c => expect(c.y).toBeGreaterThan(focal.y + BOX_H));
  });

  it('generates no lines when no parents and no children', () => {
    expect(computeHourglassLayout(hourglass(p('f'))).lines).toHaveLength(0);
  });

  it('svgHeight grows when children are added', () => {
    const h1 = computeHourglassLayout(hourglass(p('f'))).svgHeight;
    const h2 = computeHourglassLayout(hourglass(p('f'), [null, null], [null, null, null, null], [p('c1')])).svgHeight;
    expect(h2).toBeGreaterThan(h1);
  });

  it('places spouse boxes at the same row as focal, to the right', () => {
    const { boxes } = computeHourglassLayout(
      hourglass(p('f'), [null, null], [null, null, null, null], [], [p('s1'), p('s2')]),
    );
    const focal  = boxes.find(b => b.isFocal)!;
    const spouse = boxes.find(b => b.person.id === 's1')!;
    expect(spouse.y).toBe(focal.y);
    expect(spouse.x).toBeGreaterThan(focal.x + BOX_W);
  });

  it('extends svgWidth when spouses exceed ancestor section width', () => {
    const many = Array.from({ length: 6 }, (_, i) => p(`s${i}`));
    const { svgWidth } = computeHourglassLayout(
      hourglass(p('f'), [null, null], [null, null, null, null], [], many),
    );
    // With 6 spouses the right edge must exceed what ancestor/descendant section alone provides
    const withoutSpouses = computeHourglassLayout(hourglass(p('f'))).svgWidth;
    expect(svgWidth).toBeGreaterThan(withoutSpouses);
  });

  it('grandchildren appear below children', () => {
    const f = p('f');
    const c = p('c');
    const gc = p('gc');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, f]]), generations: 4 },
      descendantRoot: {
        person: f,
        children: [{ person: c, children: [{ person: gc, children: [] }] }],
      },
      descendantGenerations: 3,
    };
    const { boxes } = computeHourglassLayout(tree);
    const cBox  = boxes.find(b => b.person.id === 'c')!;
    const gcBox = boxes.find(b => b.person.id === 'gc')!;
    expect(gcBox.y).toBeGreaterThan(cBox.y + BOX_H);
  });
});

describe('collapse — computePedigreeLayout', () => {
  it('returns no collapseButtons when no one has parents', () => {
    const { collapseButtons } = computePedigreeLayout(pedigree3(p('f')));
    expect(collapseButtons).toHaveLength(0);
  });

  it('focal gets a collapse button when parents exist, direction right', () => {
    const { collapseButtons } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), null]));
    const btn = collapseButtons.find(b => b.personId === 'f');
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('right');
    expect(btn!.isExpanded).toBe(true);
    expect(btn!.isLoadMore).toBeFalsy();
  });

  it('collapsing focal:right removes parent boxes but keeps focal', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')]);
    const { boxes } = computePedigreeLayout(tree, new Set(['f:right']));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].person.id).toBe('f');
  });

  it('collapsing parent:right removes grandparent boxes', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), null, null]);
    const { boxes } = computePedigreeLayout(tree, new Set(['p0:right']));
    expect(boxes.find(b => b.person.id === 'gp0')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'gp1')).toBeUndefined();
    expect(boxes).toHaveLength(3);
  });

  it('collapsed node still shows its own box', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')]);
    const { boxes } = computePedigreeLayout(tree, new Set(['f:right']));
    expect(boxes.some(b => b.person.id === 'f')).toBe(true);
  });

  it('button isExpanded=false when branch is collapsed', () => {
    const tree = pedigree3(p('f'), [p('p0'), null]);
    const { collapseButtons } = computePedigreeLayout(tree, new Set(['f:right']));
    const btn = collapseButtons.find(b => b.personId === 'f');
    expect(btn!.isExpanded).toBe(false);
  });

  it('generates load-more button (isLoadMore=true) for leaf with hasMoreAncestors', () => {
    const tree: PedigreeTree = {
      nodes: new Map([[1, p('f')], [2, p('par')]]),
      generations: 3,
      hasMoreAncestors: new Set([2]),
    };
    const { collapseButtons } = computePedigreeLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('right');
    expect(btn!.isExpanded).toBe(false);
  });

  it('does not generate load-more when parent is already loaded (collapse takes priority)', () => {
    const tree: PedigreeTree = {
      nodes: new Map([[1, p('f')], [2, p('par')], [4, p('gp')]]),
      generations: 3,
      hasMoreAncestors: new Set([2]),
    };
    const { collapseButtons } = computePedigreeLayout(tree);
    // par has a loaded parent (gp at k=4), so gets a collapse button, not load-more
    const loadMoreBtn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(loadMoreBtn).toBeUndefined();
    const collapseBtn = collapseButtons.find(b => b.personId === 'par' && !b.isLoadMore);
    expect(collapseBtn).toBeDefined();
  });
});

describe('collapse — computeHourglassLayout', () => {
  it('returns no collapseButtons for lone focal', () => {
    const { collapseButtons } = computeHourglassLayout(hourglass(p('f')));
    expect(collapseButtons).toHaveLength(0);
  });

  it('focal gets down button when children exist', () => {
    const { collapseButtons } = computeHourglassLayout(
      hourglass(p('f'), [null, null], [null, null, null, null], [p('c1')]),
    );
    expect(collapseButtons.some(b => b.personId === 'f' && b.direction === 'down')).toBe(true);
  });

  it('focal gets right button when spouses exist', () => {
    const { collapseButtons } = computeHourglassLayout(
      hourglass(p('f'), [null, null], [null, null, null, null], [], [p('s1')]),
    );
    expect(collapseButtons.some(b => b.personId === 'f' && b.direction === 'right')).toBe(true);
  });

  it('ancestor with parents gets up button', () => {
    const { collapseButtons } = computeHourglassLayout(
      hourglass(p('f'), [p('par'), null], [p('gp'), null, null, null]),
    );
    expect(collapseButtons.some(b => b.personId === 'par' && b.direction === 'up')).toBe(true);
  });

  it('collapsing focal:down:solo hides solo children', () => {
    const tree = hourglass(p('f'), [null, null], [null, null, null, null], [p('c1'), p('c2')]);
    const { boxes } = computeHourglassLayout(tree, new Set(['f:down:solo']));
    expect(boxes.find(b => b.person.id === 'c1')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'c2')).toBeUndefined();
  });

  it('collapsing focal:right hides spouses', () => {
    const tree = hourglass(p('f'), [null, null], [null, null, null, null], [], [p('s1')]);
    const { boxes } = computeHourglassLayout(tree, new Set(['f:right']));
    expect(boxes.find(b => b.person.id === 's1')).toBeUndefined();
  });

  it('collapsing ancestor:up hides their parents', () => {
    const f = p('f');
    const par = p('par');
    const gp = p('gp');
    const tree = hourglass(f, [par, null], [gp, null, null, null]);
    const { boxes } = computeHourglassLayout(tree, new Set([`${par.id}:up`]));
    expect(boxes.find(b => b.person.id === gp.id)).toBeUndefined();
    expect(boxes.find(b => b.person.id === par.id)).toBeDefined();
  });

  it('collapsed focal still renders focal box', () => {
    const tree = hourglass(p('f'), [null, null], [null, null, null, null], [p('c1')]);
    const { boxes } = computeHourglassLayout(tree, new Set(['f:down:solo']));
    expect(boxes.some(b => b.isFocal)).toBe(true);
  });
});

describe('collapse — per-node descendant collapse', () => {
  function hourglassWithGrandchild(): HourglassTree {
    const focal = p('f');
    const child = p('c');
    const gc = p('gc');
    return {
      ancestors: { nodes: new Map([[1, focal]]), generations: 1 },
      descendantRoot: { person: focal, children: [{ person: child, children: [{ person: gc, children: [] }] }] },
      descendantGenerations: 3,
      spouses: [],
    };
  }

  it('collapseButtons includes down button for non-focal child with children', () => {
    const { collapseButtons } = computeHourglassLayout(hourglassWithGrandchild());
    expect(collapseButtons.some(b => b.personId === 'c' && b.direction === 'down')).toBe(true);
  });

  it('collapsing child:down hides grandchildren but keeps child box', () => {
    const tree = hourglassWithGrandchild();
    const { boxes } = computeHourglassLayout(tree, new Set(['c:down']));
    expect(boxes.find(b => b.person.id === 'gc')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'c')).toBeDefined();
  });

  it('child:down button isExpanded=false when collapsed', () => {
    const { collapseButtons } = computeHourglassLayout(hourglassWithGrandchild(), new Set(['c:down']));
    const btn = collapseButtons.find(b => b.personId === 'c' && b.direction === 'down');
    expect(btn!.isExpanded).toBe(false);
  });

  it('leafCount shrinks when a non-focal child is collapsed', () => {
    const focal = p('f');
    const c1 = p('c1');
    const c2 = p('c2');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, focal]]), generations: 1 },
      descendantRoot: {
        person: focal,
        children: [
          { person: c1, children: [{ person: p('gc1'), children: [] }, { person: p('gc2'), children: [] }] },
          { person: c2, children: [] },
        ],
      },
      descendantGenerations: 3,
      spouses: [],
    };
    const { svgWidth: widthExpanded } = computeHourglassLayout(tree);
    const { svgWidth: widthCollapsed } = computeHourglassLayout(tree, new Set(['c1:down']));
    expect(widthCollapsed).toBeLessThan(widthExpanded);
  });
});

describe('load-more buttons', () => {
  it('hourglass ancestor leaf with hasMoreAncestors gets a load-more up button', () => {
    const f = p('f');
    const par = p('par');
    const tree: HourglassTree = {
      ancestors: {
        nodes: new Map([[1, f], [2, par]]),
        generations: 3,
        hasMoreAncestors: new Set([2]),
      },
      descendantRoot: { person: f, children: [] },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('up');
    expect(btn!.isExpanded).toBe(false);
  });

  it('hourglass ancestor with loaded parents gets collapse button, not load-more', () => {
    const f = p('f');
    const par = p('par');
    const gp = p('gp');
    const tree: HourglassTree = {
      ancestors: {
        nodes: new Map([[1, f], [2, par], [4, gp]]),
        generations: 3,
        hasMoreAncestors: new Set([2]),
      },
      descendantRoot: { person: f, children: [] },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    const loadMoreBtn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(loadMoreBtn).toBeUndefined();
    const collapseBtn = collapseButtons.find(b => b.personId === 'par' && !b.isLoadMore);
    expect(collapseBtn).toBeDefined();
  });

  it('hourglass descendant leaf with hasMoreChildren gets a load-more down button', () => {
    const f = p('f');
    const c = p('c');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, f]]), generations: 1 },
      descendantRoot: {
        person: f,
        children: [{ person: c, children: [], hasMoreChildren: true }],
      },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'c' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('down');
  });

  it('hourglass descendant leaf without hasMoreChildren gets no button', () => {
    const f = p('f');
    const c = p('c');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, f]]), generations: 1 },
      descendantRoot: {
        person: f,
        children: [{ person: c, children: [], hasMoreChildren: false }],
      },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    expect(collapseButtons.find(b => b.personId === 'c')).toBeUndefined();
  });

  it('hourglass focal with hasMoreChildren and no loaded children gets a load-more down button', () => {
    const f = p('f');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, f]]), generations: 1 },
      descendantRoot: { person: f, children: [], hasMoreChildren: true },
      descendantGenerations: 3,
      spouses: [],
    };
    const { collapseButtons } = computeHourglassLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'f' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('down');
  });
});

describe('computeTimelineLayout', () => {
  it('returns one bar per entry', () => {
    const entries = [
      { person: p('f', { birthDate: '1978' }), isFocal: true },
      { person: p('x', { birthDate: '1950', deathDate: '2010' }), isFocal: false },
    ];
    expect(computeTimelineLayout(entries, 2024).bars).toHaveLength(2);
  });

  it('marks persons with no death date as open (living bar)', () => {
    const entries = [{ person: p('f', { birthDate: '1978' }), isFocal: true }];
    expect(computeTimelineLayout(entries, 2024).bars[0].isOpen).toBe(true);
  });

  it('marks persons with a death date as closed', () => {
    const entries = [{ person: p('x', { birthDate: '1900', deathDate: '1980' }), isFocal: false }];
    expect(computeTimelineLayout(entries, 2024).bars[0].isOpen).toBe(false);
  });

  it('sorts oldest birth date to top (first in array)', () => {
    const entries = [
      { person: p('young', { birthDate: '1980' }), isFocal: false },
      { person: p('old', { birthDate: '1920' }), isFocal: false },
    ];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].person.id).toBe('old');
    expect(bars[1].person.id).toBe('young');
  });

  it('generates decade tick marks', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const { ticks } = computeTimelineLayout(entries, 2000);
    expect(ticks.length).toBeGreaterThan(0);
    ticks.forEach(t => expect(t.year % 10).toBe(0));
  });

  it('includes a todayX value', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const { todayX } = computeTimelineLayout(entries, 2000);
    expect(todayX).toBeGreaterThan(0);
  });

  it('marks person with no birth year as hasNoDate', () => {
    const entries = [{ person: p('x'), isFocal: false }];
    expect(computeTimelineLayout(entries, 2024).bars[0].hasNoDate).toBe(true);
  });
});

// ─── Overlap detection ───────────────────────────────────────────────────────

/** Returns true if two axis-aligned rectangles overlap (share interior pixels). */
function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Assert no pair of boxes in the layout overlaps. */
function assertNoOverlaps(boxes: { person: PersonNode; x: number; y: number; w: number; h: number }[]): void {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) {
        throw new Error(
          `Overlap: ${boxes[i].person.id} (${boxes[i].x},${boxes[i].y}) and ${boxes[j].person.id} (${boxes[j].x},${boxes[j].y})`,
        );
      }
    }
  }
}

/** Assert all boxes are within the SVG bounds. */
function assertWithinBounds(
  boxes: { x: number; y: number; w: number; h: number }[],
  svgWidth: number,
  svgHeight: number,
): void {
  for (const b of boxes) {
    if (b.x < 0 || b.y < 0 || b.x + b.w > svgWidth || b.y + b.h > svgHeight) {
      throw new Error(`Box at (${b.x},${b.y}) size ${b.w}x${b.h} outside SVG ${svgWidth}x${svgHeight}`);
    }
  }
}

describe('pedigree overlap detection', () => {
  it('no overlaps: full 3-generation tree', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), p('gp2'), p('gp3')]);
    const { boxes, svgWidth, svgHeight } = computePedigreeLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: full 5-generation tree (31 boxes)', () => {
    const nodes = new Map<number, PersonNode>();
    for (let k = 1; k < 32; k++) nodes.set(k, p(`n${k}`));
    const { boxes, svgWidth, svgHeight } = computePedigreeLayout({ nodes, generations: 5 });
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: asymmetric tree — deep paternal, no maternal', () => {
    const nodes = new Map<number, PersonNode>();
    nodes.set(1, p('f'));
    nodes.set(2, p('father'));
    nodes.set(4, p('pgf'));
    nodes.set(8, p('pggf'));
    const { boxes, svgWidth, svgHeight } = computePedigreeLayout({ nodes, generations: 5 });
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: asymmetric — one parent has full grandparents, other has none', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), null, null]);
    const { boxes, svgWidth, svgHeight } = computePedigreeLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: single parent only', () => {
    const tree = pedigree3(p('f'), [p('p0'), null]);
    const { boxes, svgWidth, svgHeight } = computePedigreeLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps after collapsing one branch', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), p('gp2'), p('gp3')]);
    const { boxes, svgWidth, svgHeight } = computePedigreeLayout(tree, new Set(['p0:right']));
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });
});

describe('hourglass overlap detection', () => {
  it('no overlaps: focal only', () => {
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(hourglass(p('f')));
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: focal + 2 parents + 4 grandparents', () => {
    const tree = hourglass(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), p('gp2'), p('gp3')]);
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: focal + 1 spouse + 3 children', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }), [null, null], [null, null, null, null],
      [p('c1'), p('c2'), p('c3')], [p('s1')],
    );
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: focal + 3 spouses', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }), [null, null], [null, null, null, null],
      [], [p('s1'), p('s2'), p('s3')],
    );
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: female focal with spouses on left + parents above', () => {
    const tree = hourglass(
      p('f', { sex: 'F' }), [p('p0'), p('p1')], [null, null, null, null],
      [], [p('s1'), p('s2')],
    );
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: many children (6) from one spouse', () => {
    const children = Array.from({ length: 6 }, (_, i) => p(`c${i}`));
    const spouse = p('s1');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, p('f')]]), generations: 1 },
      descendantRoot: {
        person: p('f'),
        children: children.map(c => ({ person: c, children: [], coParentId: 's1' })),
      },
      descendantGenerations: 3,
      spouses: [spouse],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: children from 2 different spouses', () => {
    const focal = p('f', { sex: 'M' });
    const s1 = p('s1', { sex: 'F' });
    const s2 = p('s2', { sex: 'F' });
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, focal]]), generations: 1 },
      descendantRoot: {
        person: focal,
        children: [
          { person: p('c1'), children: [], coParentId: 's1' },
          { person: p('c2'), children: [], coParentId: 's1' },
          { person: p('c3'), children: [], coParentId: 's2' },
          { person: p('c4'), children: [], coParentId: 's2' },
        ],
      },
      descendantGenerations: 3,
      spouses: [s1, s2],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: children from 2 spouses + solo children', () => {
    const focal = p('f', { sex: 'M' });
    const s1 = p('s1', { sex: 'F' });
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, focal]]), generations: 1 },
      descendantRoot: {
        person: focal,
        children: [
          { person: p('c1'), children: [], coParentId: 's1' },
          { person: p('c2'), children: [], coParentId: null },
          { person: p('c3'), children: [], coParentId: null },
        ],
      },
      descendantGenerations: 3,
      spouses: [s1],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: deep descendant subtree under one child, none under other', () => {
    const focal = p('f');
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, focal]]), generations: 1 },
      descendantRoot: {
        person: focal,
        children: [
          {
            person: p('c1'),
            children: [
              { person: p('gc1'), children: [{ person: p('ggc1'), children: [] }] },
              { person: p('gc2'), children: [{ person: p('ggc2'), children: [] }] },
              { person: p('gc3'), children: [] },
            ],
          },
          { person: p('c2'), children: [] },
        ],
      },
      descendantGenerations: 3,
      spouses: [],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: female focal with left spouses + wide descendant tree', () => {
    const focal = p('f', { sex: 'F' });
    const s1 = p('s1', { sex: 'M' });
    const s2 = p('s2', { sex: 'M' });
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, focal], [2, p('father')], [3, p('mother')]]), generations: 2 },
      descendantRoot: {
        person: focal,
        children: [
          { person: p('c1'), children: [], coParentId: 's1' },
          { person: p('c2'), children: [], coParentId: 's1' },
          { person: p('c3'), children: [], coParentId: 's1' },
          { person: p('c4'), children: [], coParentId: 's2' },
          { person: p('c5'), children: [], coParentId: 's2' },
        ],
      },
      descendantGenerations: 3,
      spouses: [s1, s2],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: full tree — parents, grandparents, 2 spouses, children from each, grandchildren', () => {
    const focal = p('f', { sex: 'M' });
    const s1 = p('s1', { sex: 'F' });
    const s2 = p('s2', { sex: 'F' });
    const tree: HourglassTree = {
      ancestors: pedigree3(focal, [p('father'), p('mother')], [p('pgf'), p('pgm'), p('mgf'), p('mgm')]),
      descendantRoot: {
        person: focal,
        children: [
          {
            person: p('c1'), coParentId: 's1',
            children: [{ person: p('gc1'), children: [] }, { person: p('gc2'), children: [] }],
          },
          { person: p('c2'), children: [], coParentId: 's1' },
          {
            person: p('c3'), coParentId: 's2',
            children: [{ person: p('gc3'), children: [] }],
          },
        ],
      },
      descendantGenerations: 3,
      spouses: [s1, s2],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: spouse boxes do not overlap with ancestor boxes (wide ancestor section)', () => {
    const focal = p('f', { sex: 'M' });
    const tree: HourglassTree = {
      ancestors: pedigree3(focal, [p('father'), p('mother')], [p('pgf'), p('pgm'), p('mgf'), p('mgm')]),
      descendantRoot: { person: focal, children: [] },
      descendantGenerations: 3,
      spouses: [p('s1'), p('s2'), p('s3'), p('s4')],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: female focal — left spouses do not overlap ancestor section', () => {
    const focal = p('f', { sex: 'F' });
    const tree: HourglassTree = {
      ancestors: pedigree3(focal, [p('father'), p('mother')], [p('pgf'), p('pgm'), p('mgf'), p('mgm')]),
      descendantRoot: { person: focal, children: [] },
      descendantGenerations: 3,
      spouses: [p('s1'), p('s2'), p('s3'), p('s4')],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });
});

describe('hourglass sibling support', () => {
  it('places sibling boxes at the same row as focal', () => {
    const { boxes } = computeHourglassLayout(
      hourglass(p('f', { sex: 'M' }), [p('p0'), p('p1')], [null, null, null, null], [], [], [p('sib1'), p('sib2')]),
    );
    const focal = boxes.find(b => b.isFocal)!;
    const sib1 = boxes.find(b => b.person.id === 'sib1')!;
    const sib2 = boxes.find(b => b.person.id === 'sib2')!;
    expect(sib1.y).toBe(focal.y);
    expect(sib2.y).toBe(focal.y);
  });

  it('male focal: siblings go LEFT of focal', () => {
    const { boxes } = computeHourglassLayout(
      hourglass(p('f', { sex: 'M' }), [null, null], [null, null, null, null], [], [], [p('sib1')]),
    );
    const focal = boxes.find(b => b.isFocal)!;
    const sib1 = boxes.find(b => b.person.id === 'sib1')!;
    expect(sib1.x + sib1.w).toBeLessThan(focal.x);
  });

  it('female focal: siblings go RIGHT of focal', () => {
    const { boxes } = computeHourglassLayout(
      hourglass(p('f', { sex: 'F' }), [null, null], [null, null, null, null], [], [], [p('sib1')]),
    );
    const focal = boxes.find(b => b.isFocal)!;
    const sib1 = boxes.find(b => b.person.id === 'sib1')!;
    expect(sib1.x).toBeGreaterThan(focal.x + BOX_W);
  });

  it('no overlaps: male focal with siblings + spouses', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }), [p('p0'), p('p1')], [null, null, null, null],
      [], [p('s1')], [p('sib1'), p('sib2')],
    );
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: female focal with siblings + spouses', () => {
    const tree = hourglass(
      p('f', { sex: 'F' }), [p('p0'), p('p1')], [null, null, null, null],
      [], [p('s1'), p('s2')], [p('sib1'), p('sib2'), p('sib3')],
    );
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: siblings + children + spouses + grandparents', () => {
    const focal = p('f', { sex: 'M' });
    const tree: HourglassTree = {
      ancestors: pedigree3(focal, [p('father'), p('mother')], [p('pgf'), p('pgm'), p('mgf'), p('mgm')]),
      descendantRoot: {
        person: focal,
        children: [
          { person: p('c1'), children: [{ person: p('gc1'), children: [] }], coParentId: 's1' },
          { person: p('c2'), children: [], coParentId: 's1' },
        ],
      },
      descendantGenerations: 3,
      spouses: [p('s1', { sex: 'F' })],
      siblings: [p('sib1'), p('sib2'), p('sib3')],
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: 5 siblings + 4 grandparents (wide ancestor section)', () => {
    const focal = p('f', { sex: 'M' });
    const sibs = Array.from({ length: 5 }, (_, i) => p(`sib${i}`));
    const tree: HourglassTree = {
      ancestors: pedigree3(focal, [p('father'), p('mother')], [p('pgf'), p('pgm'), p('mgf'), p('mgm')]),
      descendantRoot: { person: focal, children: [] },
      descendantGenerations: 3,
      spouses: [],
      siblings: sibs,
    };
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('generates a sibling collapse button when siblings exist', () => {
    const { collapseButtons } = computeHourglassLayout(
      hourglass(p('f', { sex: 'M' }), [null, null], [null, null, null, null], [], [], [p('sib1')]),
    );
    const sibBtn = collapseButtons.find(b => b.coParentId === '__siblings__');
    expect(sibBtn).toBeDefined();
    expect(sibBtn!.isExpanded).toBe(true);
  });

  it('collapsing siblings hides sibling boxes', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }), [null, null], [null, null, null, null], [], [], [p('sib1'), p('sib2')],
    );
    const { boxes } = computeHourglassLayout(tree, new Set(['f:left:__siblings__']));
    expect(boxes.find(b => b.person.id === 'sib1')).toBeUndefined();
    expect(boxes.find(b => b.person.id === 'sib2')).toBeUndefined();
    // Focal still present
    expect(boxes.find(b => b.isFocal)).toBeDefined();
  });

  it('generates connector lines from parents to siblings', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }), [p('p0'), p('p1')], [null, null, null, null], [], [], [p('sib1')],
    );
    const withSibs = computeHourglassLayout(tree);
    const withoutSibs = computeHourglassLayout(
      hourglass(p('f', { sex: 'M' }), [p('p0'), p('p1')]),
    );
    expect(withSibs.lines.length).toBeGreaterThan(withoutSibs.lines.length);
  });
});
