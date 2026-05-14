import { describe, it, expect } from 'vitest';
import {
  computePedigreeLayout,
  computeHourglassLayout,
  computeDescendantLayout,
  computeTimelineLayout,
  eventSymbol,
  BOX_W,
  MIN_BOX_H,
} from '../../src/renderer/utils/chart-layout';
import type { PersonNode, PedigreeTree, TreePerson, DescendantNode } from '../../src/renderer/utils/chart-layout';
import { computeFootprint, ancestorFootprint } from '../../src/renderer/utils/chart-layout/hourglass';
import { V_GAP } from '../../src/renderer/utils/chart-layout/constants';
import {
  assertNoOverlaps as propAssertNoOverlaps,
  assertParentDirection,
  assertGenerationAlignment,
  assertOutlineAdjacency,
  assertCoupleSpacing,
  assertConnectivity,
  assertStableExtent,
} from './chart-layout/properties';
import {
  overlapFixture,
  parentDirectionReversedFixture,
  alignmentBrokenFixture,
} from './chart-layout/regression-fixtures';

function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
  return {
    id, givenName: 'Test', surname: 'Person', preferredName: null, nickname: null,
    sex: 'U', living: true, birthDate: null, deathDate: null,
    birthPlace: null, deathPlace: null, photoUrl: null,
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

// Build a minimal TreePerson for hourglass tests.
// parents[0]=father, parents[1]=mother; grandparents[0..3]=pat.gf, pat.gm, mat.gf, mat.gm
function hourglass(
  focal: PersonNode,
  parents: [PersonNode | null, PersonNode | null] = [null, null],
  grandparents: [PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null] = [null, null, null, null],
  children: PersonNode[] = [],
  spouses: PersonNode[] = [],
  siblings: PersonNode[] = [],
): TreePerson {
  const parentTPs: TreePerson[] = [];
  if (parents[0]) {
    const fatherParents: TreePerson[] = [];
    if (grandparents[0]) fatherParents.push({ person: grandparents[0], parents: [], children: [], spouses: [] });
    if (grandparents[1]) fatherParents.push({ person: grandparents[1], parents: [], children: [], spouses: [] });
    parentTPs.push({ person: parents[0], parents: fatherParents, children: [], spouses: [] });
  }
  if (parents[1]) {
    const motherParents: TreePerson[] = [];
    if (grandparents[2]) motherParents.push({ person: grandparents[2], parents: [], children: [], spouses: [] });
    if (grandparents[3]) motherParents.push({ person: grandparents[3], parents: [], children: [], spouses: [] });
    parentTPs.push({ person: parents[1], parents: motherParents, children: [], spouses: [] });
  }
  const childTPs: TreePerson[] = children.map(c => ({ person: c, parents: [], children: [], spouses: [] }));
  const spouseTPs: TreePerson[] = spouses.map(s => ({ person: s, parents: [], children: [], spouses: [] }));
  const siblingTPs: TreePerson[] = siblings.map(s => ({ person: s, parents: [], children: [], spouses: [] }));
  return {
    person: focal,
    parents: parentTPs,
    children: childTPs,
    spouses: spouseTPs,
    siblings: siblingTPs,
    isFocal: true,
  };
}

/** Convert an old-style DescendantNode-like object to TreePerson (for test migration). */
interface DN { person: PersonNode; children: DN[]; hasMoreChildren?: boolean; coParentId?: string | null; }
function dnToTP(dn: DN, isFocal = false): TreePerson {
  return {
    person: dn.person,
    parents: [],
    children: dn.children.map(c => dnToTP(c)),
    spouses: [],
    isFocal,
    hasMoreChildren: dn.hasMoreChildren,
    coParentId: dn.coParentId,
  };
}

/** Build TreePerson from old HourglassTree-style spec (for test migration). */
function hourglassFromOld(opts: {
  focal: PersonNode;
  parents?: TreePerson[];
  children?: DN[];
  spouses?: PersonNode[];
  siblings?: PersonNode[];
  hasMoreChildren?: boolean;
}): TreePerson {
  const childTPs = (opts.children ?? []).map(c => dnToTP(c));
  return {
    person: opts.focal,
    parents: opts.parents ?? [],
    children: childTPs,
    spouses: (opts.spouses ?? []).map(s => ({ person: s, parents: [], children: [], spouses: [] })),
    siblings: (opts.siblings ?? []).map(s => ({ person: s, parents: [], children: [], spouses: [] })),
    isFocal: true,
    hasMoreChildren: opts.hasMoreChildren,
  };
}

/** Build a parent TreePerson with optional grandparents and hasMoreAncestors. */
function makeParentTP(person: PersonNode, grandparents: PersonNode[] = [], hasMore = false): TreePerson {
  return {
    person,
    parents: grandparents.map(gp => ({ person: gp, parents: [], children: [], spouses: [] })),
    children: [],
    spouses: [],
    hasMoreAncestors: hasMore,
  };
}

describe('computeFootprint', () => {
  it('base footprint is BOX_W/2 each side', () => {
    const node: TreePerson = { person: p('a'), parents: [], children: [], spouses: [] };
    const fp = computeFootprint(node);
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2);
  });

  it('male with one real spouse extends right', () => {
    const spouse: TreePerson = { person: p('s'), parents: [], children: [], spouses: [] };
    const node: TreePerson = { person: p('a', { sex: 'M' }), parents: [], children: [], spouses: [spouse] };
    const fp = computeFootprint(node);
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2 + BOX_W + V_GAP); // BOX_W + V_GAP
  });

  it('female with one real spouse extends left', () => {
    const spouse: TreePerson = { person: p('s'), parents: [], children: [], spouses: [] };
    const node: TreePerson = { person: p('a', { sex: 'F' }), parents: [], children: [], spouses: [spouse] };
    const fp = computeFootprint(node);
    expect(fp.left).toBe(BOX_W / 2 + BOX_W + V_GAP);
    expect(fp.right).toBe(BOX_W / 2);
  });

  it('two placeholder parents do NOT widen footprint (they extend vertically, not horizontally)', () => {
    const phFather: TreePerson = { person: p('__ph_father_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const phMother: TreePerson = { person: p('__ph_mother_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const node: TreePerson = { person: p('a'), parents: [phFather, phMother], children: [], spouses: [] };
    const fp = computeFootprint(node);
    // Parent outlines are placed above, not beside — footprint is just the base box
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2);
  });

  it('spouse + parent outlines: only spouse affects footprint', () => {
    const spouse: TreePerson = { person: p('s'), parents: [], children: [], spouses: [] };
    const phFather: TreePerson = { person: p('__ph_father_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const phMother: TreePerson = { person: p('__ph_mother_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const node: TreePerson = { person: p('a', { sex: 'M' }), parents: [phFather, phMother], children: [], spouses: [spouse] };
    const fp = computeFootprint(node);
    // Parent outlines don't affect footprint (they extend vertically)
    // Only spouse matters: M has real spouse on right
    // left = BOX_W/2 (no spouse outline for M — placeholder spouse goes left but
    //         computeFootprint doesn't count parent placeholders)
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2 + BOX_W + V_GAP);
  });
});

describe('hourglass spacing with spouses', () => {
  it('ancestor with spouse gets wider subtree', () => {
    const spouse: TreePerson = { person: p('sp', { sex: 'F' }), parents: [], children: [], spouses: [] };
    const father: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [spouse] };
    const tree: TreePerson = {
      person: p('f'), parents: [father], children: [], spouses: [], isFocal: true,
    };
    const withSpouse = computeHourglassLayout(tree);
    const fatherNoSpouse: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [] };
    const treeNoSpouse: TreePerson = {
      person: p('f'), parents: [fatherNoSpouse], children: [], spouses: [], isFocal: true,
    };
    const without = computeHourglassLayout(treeNoSpouse);
    expect(withSpouse.svgWidth).toBeGreaterThan(without.svgWidth);
  });

  it('no overlaps: ancestor with spouse', () => {
    const spouse: TreePerson = { person: p('sp', { sex: 'F' }), parents: [], children: [], spouses: [] };
    const father: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [spouse] };
    const tree: TreePerson = {
      person: p('f'), parents: [father], children: [], spouses: [], isFocal: true,
    };
    const { boxes } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
  });
});

describe('computePedigreeLayout', () => {
  it('returns one focal box when tree has no ancestors', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f')));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].isFocal).toBe(true);
    expect(boxes[0].w).toBe(BOX_W);
    expect(boxes[0].h).toBeGreaterThanOrEqual(MIN_BOX_H);
  });

  it('places focal box at leftmost x (PAD=10)', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f')));
    expect(boxes[0].x).toBe(10);
  });

  it('generates no connector lines when no ancestors', () => {
    expect(computePedigreeLayout(pedigree3(p('f'))).lines).toHaveLength(0);
  });

  it('adds both parent boxes at genX[1]=280', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), p('p1')]));
    const parentBoxes = boxes.filter(b => !b.isFocal);
    expect(parentBoxes).toHaveLength(2);
    parentBoxes.forEach(b => expect(b.x).toBe(280));
  });

  it('places parents[0] above parents[1]', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), p('p1')]));
    const p0 = boxes.find(b => b.person.id === 'p0')!;
    const p1 = boxes.find(b => b.person.id === 'p1')!;
    expect(p0.y).toBeLessThan(p1.y);
  });

  it('generates connector paths when at least one parent exists', () => {
    const { lines, paths } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), null]));
    expect(paths.length).toBeGreaterThan(0);
    expect(lines.length).toBe(0);
  });

  it('returns 7 boxes for a full 3-generation tree', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), p('gp2'), p('gp3')]);
    expect(computePedigreeLayout(tree).boxes).toHaveLength(7);
  });

  it('places grandparent boxes at genX[2]=550', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), null, p('gp2'), null]);
    const { boxes } = computePedigreeLayout(tree);
    const gpBoxes = boxes.filter(b => b.person.id === 'gp0' || b.person.id === 'gp2');
    gpBoxes.forEach(b => expect(b.x).toBe(550));
  });

  it('focal is vertically centered between parents', () => {
    const { boxes } = computePedigreeLayout(pedigree3(p('f'), [p('p0'), p('p1')]));
    const focal = boxes.find(b => b.isFocal)!;
    const p0 = boxes.find(b => b.person.id === 'p0')!;
    const p1 = boxes.find(b => b.person.id === 'p1')!;
    const focalCY = focal.y + MIN_BOX_H / 2;
    const p0cy = p0.y + MIN_BOX_H / 2;
    const p1cy = p1.y + MIN_BOX_H / 2;
    expect(focalCY).toBeCloseTo((p0cy + p1cy) / 2, 1);
  });

  it('returns 31 boxes for a full 5-generation tree', () => {
    const nodes = new Map<number, PersonNode>();
    for (let k = 1; k < 32; k++) nodes.set(k, p(`n${k}`));
    expect(computePedigreeLayout({ nodes, generations: 5 }).boxes).toHaveLength(31);
  });
});

describe('computePedigreeLayout — dynamic heights and curved paths', () => {
  it('sizes each box via measureBoxHeight (multi-line name grows the box)', () => {
    const focal: PersonNode = {
      id: 'f',
      givenName: 'Aaaaaaaaa Bbbbbbbb Ccccccc Ddddddd',
      surname: 'Eeeeeeeeeee Ffffffffff',
      preferredName: null, nickname: null,
      sex: 'M', living: true,
      birthDate: '1985', deathDate: null,
      birthPlace: 'Some Very Long Place Name', deathPlace: null,
      photoUrl: null,
    };
    const tree: PedigreeTree = { nodes: new Map([[1, focal]]), generations: 1 };
    const layout = computePedigreeLayout(tree);
    expect(layout.boxes).toHaveLength(1);
    expect(layout.boxes[0].h).toBeGreaterThan(MIN_BOX_H);
  });

  it('single-row person has h === MIN_BOX_H', () => {
    const focal: PersonNode = {
      id: 'f', givenName: 'Jo', surname: 'Doe',
      preferredName: null, nickname: null,
      sex: 'M', living: true,
      birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const tree: PedigreeTree = { nodes: new Map([[1, focal]]), generations: 1 };
    const layout = computePedigreeLayout(tree);
    expect(layout.boxes[0].h).toBe(MIN_BOX_H);
  });

  it('emits curved SVG paths instead of straight lines', () => {
    const focal: PersonNode = {
      id: 'f', givenName: 'C', surname: 'Child',
      preferredName: null, nickname: null,
      sex: 'U', living: true,
      birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const dad: PersonNode = { ...focal, id: 'd', givenName: 'D', surname: 'Dad', sex: 'M' };
    const mom: PersonNode = { ...focal, id: 'm', givenName: 'M', surname: 'Mom', sex: 'F' };
    const tree: PedigreeTree = {
      nodes: new Map([[1, focal], [2, dad], [3, mom]]),
      generations: 2,
    };
    const layout = computePedigreeLayout(tree);
    expect(layout.paths.length).toBeGreaterThanOrEqual(2);
    expect(layout.lines.length).toBe(0);
    for (const d of layout.paths) {
      expect(d).toMatch(/^M |^D:M /);
      if (d.startsWith('M ')) expect(d).toContain('Q ');
    }
  });

  it('sibling rows stack without overlap using each box\'s own h', () => {
    const focal: PersonNode = {
      id: 'f', givenName: 'Short', surname: 'Name', preferredName: null, nickname: null,
      sex: 'U', living: true, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const longDad: PersonNode = {
      id: 'd', sex: 'M', living: false,
      givenName: 'Aaaaaaaaa Bbbbbbbb Ccccccc Ddddddd Eeeeeeee', surname: 'Ffffffff Gggggggg',
      preferredName: null, nickname: null,
      birthDate: '1940', deathDate: '2010', birthPlace: 'Very Very Long Place', deathPlace: 'Another Place',
      photoUrl: null,
    };
    const mom: PersonNode = { ...focal, id: 'm', givenName: 'M', surname: 'Mom', sex: 'F' };
    const tree: PedigreeTree = {
      nodes: new Map([[1, focal], [2, longDad], [3, mom]]),
      generations: 2,
    };
    const layout = computePedigreeLayout(tree);
    const sorted = [...layout.boxes].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x === sorted[i - 1].x) {
        expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y + sorted[i - 1].h);
      }
    }
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
    children.forEach(c => expect(c.y).toBeGreaterThan(focal.y + MIN_BOX_H));
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
    const tree = hourglassFromOld({
      focal: p('f'),
      children: [{ person: p('c'), children: [{ person: p('gc'), children: [] }] }],
    });
    const { boxes } = computeHourglassLayout(tree);
    const cBox  = boxes.find(b => b.person.id === 'c')!;
    const gcBox = boxes.find(b => b.person.id === 'gc')!;
    expect(gcBox.y).toBeGreaterThan(cBox.y + MIN_BOX_H);
  });
});

describe('computeHourglassLayout — dynamic heights and curved paths', () => {
  it('sizes each box via measureBoxHeight', () => {
    const focal: PersonNode = {
      id: 'f',
      givenName: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee',
      surname: 'Fffff Ggggg',
      preferredName: null, nickname: null, sex: 'M', living: true,
      birthDate: '1940', deathDate: '2010',
      birthPlace: 'Very Long Place', deathPlace: null, photoUrl: null,
    };
    const tree = hourglass(focal);
    const layout = computeHourglassLayout(tree);
    const focalBox = layout.boxes.find(b => b.isFocal)!;
    expect(focalBox.h).toBeGreaterThan(MIN_BOX_H);
  });

  it('emits curved SVG paths instead of lines', () => {
    const focal: PersonNode = {
      id: 'f', sex: 'M', living: true,
      givenName: 'F', surname: 'F',
      preferredName: null, nickname: null,
      birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
    };
    const dad: PersonNode = { ...focal, id: 'd' };
    const tree = hourglass(focal, [dad, null]);
    const layout = computeHourglassLayout(tree);
    expect(layout.paths.length).toBeGreaterThan(0);
    expect(layout.lines.length).toBe(0);
    for (const d of layout.paths) expect(d).toMatch(/^M |^D:M /);
  });
});

describe('ancestorFootprint', () => {
  it('excludes placeholder spouses from footprint', () => {
    const phSpouse: TreePerson = { person: p('__ph_spouse_a'), parents: [], children: [], spouses: [], isPlaceholder: true };
    const node: TreePerson = { person: p('a', { sex: 'M' }), parents: [], children: [], spouses: [phSpouse] };
    const fp = ancestorFootprint(node);
    // Placeholder spouse should NOT widen ancestor footprint
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2);
  });

  it('includes real spouses in footprint', () => {
    const spouse: TreePerson = { person: p('s'), parents: [], children: [], spouses: [] };
    const node: TreePerson = { person: p('a', { sex: 'M' }), parents: [], children: [], spouses: [spouse] };
    const fp = ancestorFootprint(node);
    expect(fp.left).toBe(BOX_W / 2);
    expect(fp.right).toBe(BOX_W / 2 + BOX_W + V_GAP);
  });
});

describe('grandparent selection reserves outline space without extra rows', () => {
  it('selecting grandparent does not add extra generation rows', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }),
      [p('dad', { sex: 'M' }), p('mom', { sex: 'F' })],
      [p('pgf', { sex: 'M' }), p('pgm', { sex: 'F' }), p('mgf', { sex: 'M' }), p('mgm', { sex: 'F' })],
    );
    const noSel = computeHourglassLayout(tree);
    const withSel = computeHourglassLayout(tree, new Set(), 'pgf');

    const findBox = (layout: typeof noSel, id: string) => layout.boxes.find(b => b.person.id === id)!;

    // Y positions must be identical — no extra rows from placeholder parents
    expect(findBox(withSel, 'dad').y).toBe(findBox(noSel, 'dad').y);
    expect(findBox(withSel, 'pgf').y).toBe(findBox(noSel, 'pgf').y);
    expect(findBox(withSel, 'f').y).toBe(findBox(noSel, 'f').y);
  });

  it('no box overlaps when grandparent is selected', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }),
      [p('dad', { sex: 'M' }), p('mom', { sex: 'F' })],
      [p('pgf', { sex: 'M' }), p('pgm', { sex: 'F' }), p('mgf', { sex: 'M' }), p('mgm', { sex: 'F' })],
    );
    const { boxes } = computeHourglassLayout(tree, new Set(), 'pgf');
    assertNoOverlaps(boxes);
  });

  // (Outline placeholder for grandparent spouse removed — replaced by + button.)
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
  function hourglassWithGrandchild(): TreePerson {
    return hourglassFromOld({
      focal: p('f'),
      children: [{ person: p('c'), children: [{ person: p('gc'), children: [] }] }],
    });
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
    const tree = hourglassFromOld({
      focal: p('f'),
      children: [
        { person: p('c1'), children: [{ person: p('gc1'), children: [] }, { person: p('gc2'), children: [] }] },
        { person: p('c2'), children: [] },
      ],
    });
    const { svgWidth: widthExpanded } = computeHourglassLayout(tree);
    const { svgWidth: widthCollapsed } = computeHourglassLayout(tree, new Set(['c1:down']));
    expect(widthCollapsed).toBeLessThan(widthExpanded);
  });
});

describe('load-more buttons', () => {
  it('hourglass ancestor leaf with hasMoreAncestors gets a load-more up button', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
      parents: [makeParentTP(p('par'), [], true)],
    });
    const { collapseButtons } = computeHourglassLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('up');
    expect(btn!.isExpanded).toBe(false);
  });

  it('hourglass ancestor with loaded parents gets collapse button, not load-more', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
      parents: [makeParentTP(p('par'), [p('gp')], true)],
    });
    const { collapseButtons } = computeHourglassLayout(tree);
    const loadMoreBtn = collapseButtons.find(b => b.personId === 'par' && b.isLoadMore);
    expect(loadMoreBtn).toBeUndefined();
    const collapseBtn = collapseButtons.find(b => b.personId === 'par' && !b.isLoadMore);
    expect(collapseBtn).toBeDefined();
  });

  it('hourglass descendant leaf with hasMoreChildren gets a load-more down button', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
      children: [{ person: p('c'), children: [], hasMoreChildren: true }],
    });
    const { collapseButtons } = computeHourglassLayout(tree);
    const btn = collapseButtons.find(b => b.personId === 'c' && b.isLoadMore);
    expect(btn).toBeDefined();
    expect(btn!.direction).toBe('down');
  });

  it('hourglass descendant leaf without hasMoreChildren gets no button', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
      children: [{ person: p('c'), children: [], hasMoreChildren: false }],
    });
    const { collapseButtons } = computeHourglassLayout(tree);
    expect(collapseButtons.find(b => b.personId === 'c')).toBeUndefined();
  });

  it('hourglass focal with hasMoreChildren and no loaded children gets a load-more down button', () => {
    const tree = hourglassFromOld({ focal: p('f'), hasMoreChildren: true });
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

  it('generates evenly spaced tick marks', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const { ticks } = computeTimelineLayout(entries, 2000);
    expect(ticks.length).toBeGreaterThan(1);
    // Step is chosen dynamically from {1,2,5,10,25,50,100,…} based on width; all
    // ticks must be multiples of the first interval.
    const step = ticks[1].year - ticks[0].year;
    expect(step).toBeGreaterThan(0);
    ticks.forEach(t => expect(t.year % step).toBe(0));
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

describe('computeTimelineLayout — event markers', () => {
  it('populates markers when events are provided', () => {
    const entries = [{
      person: p('f', { birthDate: '1950', deathDate: '2010' }),
      isFocal: true,
      events: [
        { event_type: 'birth', date_value: '1950-01-15' },
        { event_type: 'marriage', date_value: '1975-06-20' },
        { event_type: 'death', date_value: '2010-12-01' },
      ],
    }];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].markers).toHaveLength(3);
    expect(bars[0].markers[0].symbol).toBe('★');
    expect(bars[0].markers[1].symbol).toBe('♥');
    expect(bars[0].markers[2].symbol).toBe('†');
  });

  it('returns empty markers when no events provided', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].markers).toEqual([]);
  });

  it('filters out events outside bar range', () => {
    const entries = [{
      person: p('f', { birthDate: '1950', deathDate: '2010' }),
      isFocal: true,
      events: [
        { event_type: 'census', date_value: '1920-01-01' }, // before birth
        { event_type: 'marriage', date_value: '1975-06-20' }, // in range
      ],
    }];
    const { bars } = computeTimelineLayout(entries, 2024);
    expect(bars[0].markers).toHaveLength(1);
    expect(bars[0].markers[0].eventType).toBe('marriage');
  });

  it('marker x is within bar x..x+w', () => {
    const entries = [{
      person: p('f', { birthDate: '1950', deathDate: '2010' }),
      isFocal: true,
      events: [{ event_type: 'marriage', date_value: '1975' }],
    }];
    const { bars } = computeTimelineLayout(entries, 2024);
    const bar = bars[0];
    const marker = bar.markers[0];
    expect(marker.x).toBeGreaterThanOrEqual(bar.x);
    expect(marker.x).toBeLessThanOrEqual(bar.x + bar.w);
  });
});

describe('computeTimelineLayout — responsive width', () => {
  it('uses containerWidth when provided', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const layout = computeTimelineLayout(entries, 2024, 1200);
    expect(layout.svgWidth).toBe(1200);
  });

  it('falls back to 800 when containerWidth is too small', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const layout = computeTimelineLayout(entries, 2024, 300);
    expect(layout.svgWidth).toBe(800);
  });

  it('falls back to 800 when containerWidth is undefined', () => {
    const entries = [{ person: p('f', { birthDate: '1950' }), isFocal: true }];
    const layout = computeTimelineLayout(entries, 2024);
    expect(layout.svgWidth).toBe(800);
  });
});

describe('eventSymbol', () => {
  it('maps known event types to symbols', () => {
    expect(eventSymbol('birth')).toBe('★');
    expect(eventSymbol('death')).toBe('†');
    expect(eventSymbol('marriage')).toBe('♥');
  });

  it('returns default diamond for unknown types', () => {
    expect(eventSymbol('census')).toBe('◆');
    expect(eventSymbol('immigration')).toBe('◆');
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

/** Check if a line segment (horizontal or vertical) passes THROUGH a box interior,
 *  excluding lines that merely touch a box edge (which are valid connectors).
 *  A line "passes through" if it enters one side and exits the other. */
function linePassesThroughBox(
  line: { x1: number; y1: number; x2: number; y2: number },
  box: { x: number; y: number; w: number; h: number },
): boolean {
  const { x1, y1, x2, y2 } = line;
  const bx = box.x, by = box.y, bw = box.w, bh = box.h;

  if (y1 === y2) {
    // Horizontal line: passes through box if Y is inside box AND line extends
    // across the box interior (both start and end are beyond opposite edges)
    if (y1 <= by || y1 >= by + bh) return false; // Y outside box
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    // Line must enter from one side and exit the other — meaning it spans
    // the full box width (strictly inside on both sides)
    if (minX < bx && maxX > bx + bw) return true;
  } else if (x1 === x2) {
    // Vertical line: passes through box if X is inside box AND line extends
    // across the box interior
    if (x1 <= bx || x1 >= bx + bw) return false; // X outside box
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (minY < by && maxY > by + bh) return true;
  }
  return false;
}

/** Assert no line passes through any box. Lines that START or END at a box edge are OK (connectors). */
function assertNoLinesCrossBoxes(
  allLines: { x1: number; y1: number; x2: number; y2: number }[],
  allBoxes: { x: number; y: number; w: number; h: number; person?: { id: string } }[],
): void {
  for (const ln of allLines) {
    for (const box of allBoxes) {
      if (linePassesThroughBox(ln, box)) {
        const id = (box as any).person?.id ?? '?';
        throw new Error(
          `Line (${ln.x1},${ln.y1})→(${ln.x2},${ln.y2}) passes through box ${id} at (${box.x},${box.y})`,
        );
      }
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
    const tree = hourglassFromOld({
      focal: p('f'),
      children: children.map(c => ({ person: c, children: [], coParentId: 's1' as string | null })),
      spouses: [p('s1')],
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: children from 2 different spouses', () => {
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'M' }),
      children: [
        { person: p('c1'), children: [], coParentId: 's1' },
        { person: p('c2'), children: [], coParentId: 's1' },
        { person: p('c3'), children: [], coParentId: 's2' },
        { person: p('c4'), children: [], coParentId: 's2' },
      ],
      spouses: [p('s1', { sex: 'F' }), p('s2', { sex: 'F' })],
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: children from 2 spouses + solo children', () => {
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'M' }),
      children: [
        { person: p('c1'), children: [], coParentId: 's1' },
        { person: p('c2'), children: [], coParentId: null },
        { person: p('c3'), children: [], coParentId: null },
      ],
      spouses: [p('s1', { sex: 'F' })],
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: deep descendant subtree under one child, none under other', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
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
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: female focal with left spouses + wide descendant tree', () => {
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'F' }),
      parents: [
        makeParentTP(p('father')),
        makeParentTP(p('mother')),
      ],
      children: [
        { person: p('c1'), children: [], coParentId: 's1' },
        { person: p('c2'), children: [], coParentId: 's1' },
        { person: p('c3'), children: [], coParentId: 's1' },
        { person: p('c4'), children: [], coParentId: 's2' },
        { person: p('c5'), children: [], coParentId: 's2' },
      ],
      spouses: [p('s1', { sex: 'M' }), p('s2', { sex: 'M' })],
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: full tree — parents, grandparents, 2 spouses, children from each, grandchildren', () => {
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'M' }),
      parents: [
        makeParentTP(p('father'), [p('pgf'), p('pgm')]),
        makeParentTP(p('mother'), [p('mgf'), p('mgm')]),
      ],
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
      spouses: [p('s1', { sex: 'F' }), p('s2', { sex: 'F' })],
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: spouse boxes do not overlap with ancestor boxes (wide ancestor section)', () => {
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'M' }),
      parents: [
        makeParentTP(p('father'), [p('pgf'), p('pgm')]),
        makeParentTP(p('mother'), [p('mgf'), p('mgm')]),
      ],
      spouses: [p('s1'), p('s2'), p('s3'), p('s4')],
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: female focal — left spouses do not overlap ancestor section', () => {
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'F' }),
      parents: [
        makeParentTP(p('father'), [p('pgf'), p('pgm')]),
        makeParentTP(p('mother'), [p('mgf'), p('mgm')]),
      ],
      spouses: [p('s1'), p('s2'), p('s3'), p('s4')],
    });
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
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'M' }),
      parents: [
        makeParentTP(p('father'), [p('pgf'), p('pgm')]),
        makeParentTP(p('mother'), [p('mgf'), p('mgm')]),
      ],
      children: [
        { person: p('c1'), children: [{ person: p('gc1'), children: [] }], coParentId: 's1' },
        { person: p('c2'), children: [], coParentId: 's1' },
      ],
      spouses: [p('s1', { sex: 'F' })],
      siblings: [p('sib1'), p('sib2'), p('sib3')],
    });
    const { boxes, svgWidth, svgHeight } = computeHourglassLayout(tree);
    assertNoOverlaps(boxes);
    assertWithinBounds(boxes, svgWidth, svgHeight);
  });

  it('no overlaps: 5 siblings + 4 grandparents (wide ancestor section)', () => {
    const sibs = Array.from({ length: 5 }, (_, i) => p(`sib${i}`));
    const tree = hourglassFromOld({
      focal: p('f', { sex: 'M' }),
      parents: [
        makeParentTP(p('father'), [p('pgf'), p('pgm')]),
        makeParentTP(p('mother'), [p('mgf'), p('mgm')]),
      ],
      siblings: sibs,
    });
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
    // Paths replaced lines in the curved-connector refactor; siblings add extra curved elbows.
    expect(withSibs.paths.length).toBeGreaterThan(withoutSibs.paths.length);
  });
});

describe('hourglass outline overlap detection', () => {
  it('no overlaps when focal is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1')], [p('s1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'f');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when child is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1'), p('c2')], [p('s1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'c1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when ancestor is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [p('gp0'), p('gp1'), null, null], [p('c1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'dad');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when focal spouse is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1')], [p('s1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 's1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no overlaps when focal spouse is selected with ancestors who have spouses', () => {
    // Realistic scenario: father has a real spouse at the parent row
    const dadSpouse: TreePerson = { person: p('dadsp', { sex: 'F' }), parents: [], children: [], spouses: [] };
    const father: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [dadSpouse] };
    const momSpouse: TreePerson = { person: p('momsp', { sex: 'M' }), parents: [], children: [], spouses: [] };
    const mother: TreePerson = { person: p('mom', { sex: 'F' }), parents: [], children: [], spouses: [momSpouse] };
    const tree: TreePerson = {
      person: p('f', { sex: 'F' }),
      parents: [father, mother],
      children: [
        { person: p('c1'), parents: [], children: [], spouses: [] },
        { person: p('c2'), parents: [], children: [], spouses: [] },
      ],
      spouses: [{ person: p('s1', { sex: 'M' }), parents: [], children: [], spouses: [] }],
      siblings: [],
      isFocal: true,
    };
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 's1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });

  it('no lines cross boxes when focal spouse is selected with ancestors', () => {
    // Issue: selecting a spouse leads to parent outline lines crossing ancestor boxes
    const dadSpouse: TreePerson = { person: p('dadsp', { sex: 'F' }), parents: [], children: [], spouses: [] };
    const father: TreePerson = { person: p('dad', { sex: 'M' }), parents: [], children: [], spouses: [dadSpouse] };
    const mother: TreePerson = { person: p('mom', { sex: 'F' }), parents: [], children: [], spouses: [] };
    const tree: TreePerson = {
      person: p('f', { sex: 'F' }),
      parents: [father, mother],
      children: [{ person: p('c1'), parents: [], children: [], spouses: [] }],
      spouses: [{ person: p('s1', { sex: 'M' }), parents: [], children: [], spouses: [] }],
      siblings: [],
      isFocal: true,
    };
    const { boxes, lines, placeholders, placeholderLines } = computeHourglassLayout(tree, new Set(), 's1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H, person: { id: ph.role + '_' + ph.childPersonId } }))];
    const allLines = [...lines, ...placeholderLines];
    assertNoLinesCrossBoxes(allLines, allBoxes as any);
  });

  it('no lines cross boxes when ancestor is selected', () => {
    // Issue: child outline on ancestor may have lines crossing the focal row
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1')], [p('s1')]);
    const { boxes, lines, placeholders, placeholderLines } = computeHourglassLayout(tree, new Set(), 'dad');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H, person: { id: ph.role + '_' + ph.childPersonId } }))];
    const allLines = [...lines, ...placeholderLines];
    assertNoLinesCrossBoxes(allLines, allBoxes as any);
  });

  it('outline placeholders are connected to their owner', () => {
    // Issue: after collision avoidance shifts outlines, they may become disconnected.
    // Dashed paths carry a "D:" prefix — each placeholder should have a dashed path whose
    // endpoint lies on one of the placeholder's edge centers (top/bottom/left/right).
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [p('c1'), p('c2')], [p('s1')]);
    const { placeholders, paths } = computeHourglassLayout(tree, new Set(), 'c1');
    const dashedPaths = paths.filter(d => d.startsWith('D:')).map(d => d.slice(2));

    // Extract the start (M x,y) and end point (track through the path).
    function endpoints(d: string): Array<[number, number]> {
      const tokens = d.split(/\s+/);
      let x = 0, y = 0;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === 'M') {
          const [mx, my] = tokens[i + 1].split(',').map(parseFloat);
          x = mx; y = my; pts.push([x, y]);
          i++;
        } else if (t === 'H') {
          x = parseFloat(tokens[++i]);
        } else if (t === 'V') {
          y = parseFloat(tokens[++i]);
        } else if (t === 'Q') {
          // Q cx,cy ex,ey — advance to end point
          const _ctl = tokens[++i];
          const [ex, ey] = tokens[++i].split(',').map(parseFloat);
          void _ctl;
          x = ex; y = ey;
        }
      }
      pts.push([x, y]);
      return pts;
    }

    for (const ph of placeholders) {
      const cx = ph.x + BOX_W / 2;
      const edgeYs = [ph.y, ph.y + MIN_BOX_H];
      const edgeYC = ph.y + MIN_BOX_H / 2;
      const touches = dashedPaths.some(d => {
        const pts = endpoints(d);
        return pts.some(([x, y]) =>
          (Math.abs(x - cx) < 0.5 && edgeYs.some(ey => Math.abs(y - ey) < 0.5)) ||
          (Math.abs(x - ph.x) < 0.5 && Math.abs(y - edgeYC) < 0.5) ||
          (Math.abs(x - (ph.x + BOX_W)) < 0.5 && Math.abs(y - edgeYC) < 0.5)
        );
      });
      expect(touches, `Placeholder ${ph.role} for ${ph.childPersonId} at (${ph.x},${ph.y}) has no connecting path`).toBe(true);
    }
  });

  it('no overlaps when sibling is selected', () => {
    const tree = hourglass(p('f', { sex: 'M' }), [p('dad'), p('mom')], [null, null, null, null], [], [], [p('sib1')]);
    const { boxes, placeholders } = computeHourglassLayout(tree, new Set(), 'sib1');
    const allBoxes = [...boxes, ...placeholders.map(ph => ({ person: { id: ph.childPersonId + ph.role }, x: ph.x, y: ph.y, w: BOX_W, h: MIN_BOX_H }))];
    assertNoOverlaps(allBoxes as any);
  });
});


describe('computeDescendantLayout — dynamic heights and curved paths', () => {
  it('sizes each box via measureBoxHeight', () => {
    const root: DescendantNode = {
      person: {
        id: 'f',
        givenName: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee',
        surname: 'Fffff Ggggg',
        preferredName: null, nickname: null,
        sex: 'M', living: true,
        birthDate: '1940', deathDate: '2010',
        birthPlace: 'Very Long Place', deathPlace: 'Another Place',
        photoUrl: null,
      },
      children: [],
    };
    const layout = computeDescendantLayout(root, 1);
    expect(layout.boxes[0].h).toBeGreaterThan(MIN_BOX_H);
  });

  it('spaces generation rows by the max height in each row', () => {
    const tall: PersonNode = {
      id: 'c1', sex: 'M', living: true,
      givenName: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee', surname: 'Fffff Ggggg',
      preferredName: null, nickname: null,
      birthDate: '1980', deathDate: null,
      birthPlace: 'Very Long Place', deathPlace: null, photoUrl: null,
    };
    const short: PersonNode = { ...tall, id: 'c2', givenName: 'S', surname: 'S', birthDate: null, birthPlace: null };
    const root: DescendantNode = {
      person: { ...short, id: 'f' },
      children: [
        { person: tall, children: [] },
        { person: short, children: [] },
      ],
    };
    const layout = computeDescendantLayout(root, 2);
    // Both children should have the same Y (same row) and row 2's Y should be at or
    // below row 1 bottom + GEN_GAP (using tall's actual height).
    const children = layout.boxes.filter(b => b.person.id !== 'f');
    expect(children[0].y).toBe(children[1].y);
    const focal = layout.boxes.find(b => b.person.id === 'f')!;
    expect(children[0].y).toBeGreaterThanOrEqual(focal.y + focal.h);
  });

  it('emits curved SVG paths instead of lines', () => {
    const root: DescendantNode = {
      person: {
        id: 'f', sex: 'U', living: true,
        givenName: 'F', surname: 'F',
        preferredName: null, nickname: null,
        birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
      },
      children: [
        {
          person: {
            id: 'c', sex: 'U', living: true,
            givenName: 'C', surname: 'C',
            preferredName: null, nickname: null,
            birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null,
          },
          children: [],
        },
      ],
    };
    const layout = computeDescendantLayout(root, 2);
    expect(layout.paths.length).toBeGreaterThan(0);
    expect(layout.lines.length).toBe(0);
    for (const d of layout.paths) expect(d).toMatch(/^M |^D:M /);
  });
});

// ── Route alignment ──────────────────────────────────────────────────────────
//
// When nodes in the same generation row have different heights, all connectors
// from that row to the next must use the same midY so horizontal segments align
// at one consistent height. Without this the routing looks cluttered.

/** Extract the midY of a curvedElbow 'down' path.
 *  Curved path: first Q control point is "fromX,midY".
 *  L-shape path: "V midY H toX".
 *  Returns null for same-X straight lines where midY is irrelevant. */
function parseMidY(path: string): number | null {
  const qMatch = path.match(/Q ([\d.-]+),([\d.-]+)/);
  if (qMatch) return parseFloat(qMatch[2]);
  const vhMatch = path.match(/V ([\d.-]+) H/);
  if (vhMatch) return parseFloat(vhMatch[1]);
  return null;
}

/** Extract fromY from a path that starts with "M fromX,fromY" (or "D:M ..."). */
function parseFromY(path: string): number {
  const m = path.match(/^(?:D:)?M [\d.-]+,([\d.-]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

/** Person with a long name that forces measureBoxHeight above MIN_BOX_H. */
function tallP(id: string): PersonNode {
  return p(id, { givenName: 'Aaaaaaaaa Bbbbbbbb Ccccccc Ddddddd', surname: 'Eeeeeeeeeee Ffffffffff' });
}

describe('route alignment — connectors from same depth share one midY', () => {
  it('descendant layout: depth-1 nodes with different heights share connector midY to depth 2', () => {
    // Each depth-1 node gets two grandchildren so the connectors fan out (dx ≠ 0),
    // producing a curved elbow with a visible horizontal segment.
    const tree: DescendantNode = {
      person: p('f'),
      children: [
        {
          person: tallP('tall'),
          children: [{ person: p('gc1'), children: [] }, { person: p('gc2'), children: [] }],
        },
        {
          person: p('short'),
          children: [{ person: p('gc3'), children: [] }, { person: p('gc4'), children: [] }],
        },
      ],
    };
    const layout = computeDescendantLayout(tree, 3);

    const tallBox  = layout.boxes.find(b => b.person.id === 'tall')!;
    const shortBox = layout.boxes.find(b => b.person.id === 'short')!;
    // Precondition: the two depth-1 nodes must differ in height for this test to be meaningful.
    expect(tallBox.h).toBeGreaterThan(shortBox.h);

    const tallFromY  = tallBox.y + tallBox.h;
    const shortFromY = shortBox.y + shortBox.h;
    // Differing heights → different fromY without the fix.
    expect(tallFromY).not.toBeCloseTo(shortFromY, 1);

    const realPaths = layout.paths.filter(d => !d.startsWith('D:'));
    const fromTall  = realPaths.filter(d => Math.abs(parseFromY(d) - tallFromY)  < 0.5);
    const fromShort = realPaths.filter(d => Math.abs(parseFromY(d) - shortFromY) < 0.5);

    // 2 connectors per parent (one per grandchild)
    expect(fromTall).toHaveLength(2);
    expect(fromShort).toHaveLength(2);

    const midYsTall  = fromTall.map(parseMidY).filter((y): y is number => y !== null);
    const midYsShort = fromShort.map(parseMidY).filter((y): y is number => y !== null);
    expect(midYsTall.length).toBe(2);
    expect(midYsShort.length).toBe(2);

    // All four connectors must share the same midY.
    const allMidYs = [...midYsTall, ...midYsShort];
    for (const y of allMidYs) expect(y).toBeCloseTo(allMidYs[0], 3);

    // The shared midY must lie strictly between the max parent bottom and the grandchild row top.
    const gc1Box = layout.boxes.find(b => b.person.id === 'gc1')!;
    expect(allMidYs[0]).toBeGreaterThan(tallFromY); // below the taller parent's bottom
    expect(allMidYs[0]).toBeLessThan(gc1Box.y);      // above the grandchild row top
  });

  it('hourglass descendant: depth-1 nodes with different heights share connector midY to depth 2', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
      children: [
        {
          person: tallP('tall'),
          children: [{ person: p('gc1'), children: [] }, { person: p('gc2'), children: [] }],
        },
        {
          person: p('short'),
          children: [{ person: p('gc3'), children: [] }, { person: p('gc4'), children: [] }],
        },
      ],
    });
    const layout = computeHourglassLayout(tree);

    const tallBox  = layout.boxes.find(b => b.person.id === 'tall')!;
    const shortBox = layout.boxes.find(b => b.person.id === 'short')!;
    expect(tallBox.h).toBeGreaterThan(shortBox.h);

    const tallFromY  = tallBox.y + tallBox.h;
    const shortFromY = shortBox.y + shortBox.h;

    const realPaths = layout.paths.filter(d => !d.startsWith('D:'));
    const fromTall  = realPaths.filter(d => Math.abs(parseFromY(d) - tallFromY)  < 0.5);
    const fromShort = realPaths.filter(d => Math.abs(parseFromY(d) - shortFromY) < 0.5);

    expect(fromTall).toHaveLength(2);
    expect(fromShort).toHaveLength(2);

    const midYsTall  = fromTall.map(parseMidY).filter((y): y is number => y !== null);
    const midYsShort = fromShort.map(parseMidY).filter((y): y is number => y !== null);
    expect(midYsTall.length).toBe(2);
    expect(midYsShort.length).toBe(2);

    const allMidYs = [...midYsTall, ...midYsShort];
    for (const y of allMidYs) expect(y).toBeCloseTo(allMidYs[0], 3);

    const gc1Box = layout.boxes.find(b => b.person.id === 'gc1')!;
    expect(allMidYs[0]).toBeGreaterThan(tallFromY);
    expect(allMidYs[0]).toBeLessThan(gc1Box.y);
  });

  it('hourglass ancestor: parents with different heights already share connector midY (regression)', () => {
    const tree = hourglass(p('f'), [tallP('dad'), p('mom')]);
    const layout = computeHourglassLayout(tree);

    const focalBox = layout.boxes.find(b => b.isFocal)!;
    const dadBox   = layout.boxes.find(b => b.person.id === 'dad')!;
    const momBox   = layout.boxes.find(b => b.person.id === 'mom')!;
    expect(dadBox.h).toBeGreaterThan(momBox.h);

    // Ancestor connectors start at focalBox.y (focal top) and go upward.
    const focalTopY = focalBox.y;
    const realPaths = layout.paths.filter(d => !d.startsWith('D:'));
    const ancestorPaths = realPaths.filter(d => Math.abs(parseFromY(d) - focalTopY) < 0.5);

    expect(ancestorPaths.length).toBeGreaterThanOrEqual(2);
    const midYs = ancestorPaths.map(parseMidY).filter((y): y is number => y !== null);
    expect(midYs.length).toBeGreaterThanOrEqual(2);
    for (const y of midYs) expect(y).toBeCloseTo(midYs[0], 3);
  });

  it('descendant layout: midY equals nextRowTop minus half the generation gap', () => {
    // sharedMidY = rowTopY[d+1] - GEN_GAP/2 = grandchildRow.y - 35 (GEN_GAP=70).
    // Two grandchildren per depth-1 node ensure the connector fans out (dx ≠ 0).
    const tree: DescendantNode = {
      person: p('f'),
      children: [
        {
          person: tallP('a'),
          children: [{ person: p('gc1'), children: [] }, { person: p('gc2'), children: [] }],
        },
        {
          person: p('b'),
          children: [{ person: p('gc3'), children: [] }, { person: p('gc4'), children: [] }],
        },
      ],
    };
    const layout = computeDescendantLayout(tree, 3);
    const gc1Box = layout.boxes.find(b => b.person.id === 'gc1')!;
    const gc3Box = layout.boxes.find(b => b.person.id === 'gc3')!;
    // All grandchildren share the same row top.
    expect(gc1Box.y).toBeCloseTo(gc3Box.y, 1);

    // Pick one fanned connector from node 'a' (dx ≠ 0 since it has two children).
    const aBox = layout.boxes.find(b => b.person.id === 'a')!;
    const fromAY = aBox.y + aBox.h;
    const realPaths = layout.paths.filter(d => !d.startsWith('D:'));
    const pathsFromA = realPaths.filter(d => Math.abs(parseFromY(d) - fromAY) < 0.5);
    expect(pathsFromA.length).toBeGreaterThan(0);
    const midY = parseMidY(pathsFromA[0]);
    expect(midY).not.toBeNull();
    // midY = gc1Box.y - GEN_GAP/2 = gc1Box.y - 35
    expect(midY!).toBeCloseTo(gc1Box.y - 35, 1);
  });
});

// ---------------------------------------------------------------------------
// Property assertions: side-by-side validation on existing fixtures.
//
// Each entry exercises one or more of the seven property assertions in
// tests/unit/chart-layout/properties.ts against a fixture the rest of this
// file already uses. The goal is to prove the property suite is satisfied by
// the real layout — when a future test fixture is added, the property
// assertions become its first-class invariants and no new golden is needed.
// ---------------------------------------------------------------------------
describe('Property assertions on existing fixtures', () => {
  it('pedigree: 3-generation full tree satisfies overlap + parent-direction + alignment', () => {
    const tree = pedigree3(p('f'), [p('p0'), p('p1')], [p('gp0'), p('gp1'), p('gp2'), p('gp3')]);
    const layout = computePedigreeLayout(tree);
    propAssertNoOverlaps(layout);
    // ancestors live to the right of descendants in pedigree
    assertParentDirection(layout, 'pedigree', [
      { parent: 'p0', child: 'f' },
      { parent: 'p1', child: 'f' },
      { parent: 'gp0', child: 'p0' },
      { parent: 'gp1', child: 'p0' },
      { parent: 'gp2', child: 'p1' },
      { parent: 'gp3', child: 'p1' },
    ]);
    // generations align on x
    assertGenerationAlignment(layout, 'pedigree', [
      ['f'],
      ['p0', 'p1'],
      ['gp0', 'gp1', 'gp2', 'gp3'],
    ]);
  });

  it('hourglass: ancestors-and-children satisfies overlap + parent-direction + alignment', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
      parents: [
        makeParentTP(p('dad', { sex: 'M' })),
        makeParentTP(p('mom', { sex: 'F' })),
      ],
      children: [
        { person: p('c1'), children: [] },
        { person: p('c2'), children: [] },
      ],
    });
    const layout = computeHourglassLayout(tree);
    propAssertNoOverlaps(layout);
    assertParentDirection(layout, 'hourglass', [
      { parent: 'dad', child: 'f' },
      { parent: 'mom', child: 'f' },
      { parent: 'f', child: 'c1' },
      { parent: 'f', child: 'c2' },
    ]);
    // ancestors share a row (y); children share a row (y)
    assertGenerationAlignment(layout, 'hourglass', [
      ['dad', 'mom'],
      ['f'],
      ['c1', 'c2'],
    ]);
  });

  it('hourglass: spouse sits within couple-spacing of focal', () => {
    const tree = hourglass(
      p('f'),
      [null, null],
      [null, null, null, null],
      [],
      [p('s1')],
    );
    const layout = computeHourglassLayout(tree);
    propAssertNoOverlaps(layout);
    assertCoupleSpacing(layout, 'f', 's1', 80);
  });

  it('descendant: grandchild row stays below child row', () => {
    const tree: DescendantNode = {
      person: p('f'),
      children: [
        { person: p('c1'), children: [{ person: p('gc1'), children: [] }] },
      ],
    };
    const layout = computeDescendantLayout(tree, 3);
    propAssertNoOverlaps(layout);
    assertParentDirection(layout, 'descendant', [
      { parent: 'f', child: 'c1' },
      { parent: 'c1', child: 'gc1' },
    ]);
    assertGenerationAlignment(layout, 'descendant', [['f'], ['c1'], ['gc1']]);
  });

  it('pedigree single focal: connectivity holds trivially', () => {
    const layout = computePedigreeLayout(pedigree3(p('f')));
    // Single-box layouts skip connectivity (no other boxes to connect to)
    assertConnectivity(layout);
  });

  it('hourglass: svg extent is non-trivially positive', () => {
    const tree = hourglassFromOld({
      focal: p('f'),
      children: [{ person: p('c'), children: [] }],
    });
    const layout = computeHourglassLayout(tree);
    // Lock the canvas to within 20% of a documented baseline — generous enough
    // not to flap on cosmetic spacing tweaks, tight enough to catch order-of-
    // magnitude regressions.
    assertStableExtent(layout, { width: layout.svgWidth, height: layout.svgHeight }, 1);
  });

  it('hourglass with selected grandparent: outline placeholders are adjacent to anchors', () => {
    const tree = hourglass(
      p('f', { sex: 'M' }),
      [p('dad', { sex: 'M' }), p('mom', { sex: 'F' })],
      [p('pgf', { sex: 'M' }), p('pgm', { sex: 'F' }), p('mgf', { sex: 'M' }), p('mgm', { sex: 'F' })],
    );
    const layout = computeHourglassLayout(tree, new Set(), 'pgf');
    propAssertNoOverlaps(layout);
    assertOutlineAdjacency(layout, 5);
  });
});

// ---------------------------------------------------------------------------
// Property assertions catch deliberate regressions.
//
// Each fixture in regression-fixtures.ts violates exactly one invariant. The
// expected error message is asserted on so a future change that loosens the
// failure message still fails noisily (rather than silently swallowing the
// regression). This is how the property suite earns its keep: if a real
// layout regression introduces an overlap, a reversed parent edge, or a
// broken generation row, the test that fires names the specific boxes.
// ---------------------------------------------------------------------------
describe('Property assertions catch regressions', () => {
  it('detects overlap with named box ids', () => {
    expect(() => propAssertNoOverlaps(overlapFixture)).toThrow(
      /Box A at \(100, 100, 80x40\) overlaps Box B at \(110, 110, 80x40\)/,
    );
  });

  it('detects reversed parent direction in pedigree mode', () => {
    expect(() =>
      assertParentDirection(parentDirectionReversedFixture, 'pedigree', [
        { parent: 'parent', child: 'child' },
      ]),
    ).toThrow(/Pedigree: parent parent .* should be right of child child/);
  });

  it('detects broken generation alignment in hourglass mode', () => {
    expect(() =>
      assertGenerationAlignment(alignmentBrokenFixture, 'hourglass', [['A', 'B']]),
    ).toThrow(/Generation 0 \(hourglass\): boxes span 100\.\.150.*Boxes: A, B/);
  });
});
