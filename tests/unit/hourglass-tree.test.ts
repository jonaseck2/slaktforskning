import { describe, it, expect } from 'vitest';
import {
  buildHourglassTree,
  buildPedigreeTreePerson,
  buildDescendantTreePerson,
  injectOutlines,
  findPerson,
  PLACEHOLDER_PREFIX,
} from '../../src/renderer/utils/chart-layout/hourglass-tree';
import type {
  PersonNode,
  PedigreeTree,
  DescendantNode,
  TreePerson,
  HourglassTree,
} from '../../src/renderer/utils/chart-layout/types';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

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

/** Build a PedigreeTree with focal + optional parents + optional grandparents. */
function pedigree3(
  focal: PersonNode,
  parents: [PersonNode | null, PersonNode | null] = [null, null],
  grandparents: [PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null] = [null, null, null, null],
  hasMoreAncestors?: Set<number>,
): PedigreeTree {
  const nodes = new Map<number, PersonNode>();
  nodes.set(1, focal);
  if (parents[0]) nodes.set(2, parents[0]);
  if (parents[1]) nodes.set(3, parents[1]);
  if (grandparents[0]) nodes.set(4, grandparents[0]);
  if (grandparents[1]) nodes.set(5, grandparents[1]);
  if (grandparents[2]) nodes.set(6, grandparents[2]);
  if (grandparents[3]) nodes.set(7, grandparents[3]);
  return { nodes, generations: 3, hasMoreAncestors };
}

/** Build a DescendantNode. */
function dn(
  person: PersonNode,
  children: DescendantNode[] = [],
  opts: { hasMoreChildren?: boolean; coParentId?: string | null } = {},
): DescendantNode {
  return { person, children, ...opts };
}

/** Build a minimal HourglassTree for tests. */
function hourglassTree(
  focal: PersonNode,
  opts: {
    parents?: [PersonNode | null, PersonNode | null];
    grandparents?: [PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null];
    children?: DescendantNode[];
    spouses?: PersonNode[];
    siblings?: PersonNode[];
    hasMoreChildren?: boolean;
    hasMoreAncestors?: Set<number>;
  } = {},
): HourglassTree {
  const {
    parents = [null, null],
    grandparents = [null, null, null, null],
    children = [],
    spouses = [],
    siblings = [],
    hasMoreChildren,
    hasMoreAncestors,
  } = opts;

  const ancestorNodes = new Map<number, PersonNode>();
  ancestorNodes.set(1, focal);
  if (parents[0]) ancestorNodes.set(2, parents[0]);
  if (parents[1]) ancestorNodes.set(3, parents[1]);
  if (grandparents[0]) ancestorNodes.set(4, grandparents[0]);
  if (grandparents[1]) ancestorNodes.set(5, grandparents[1]);
  if (grandparents[2]) ancestorNodes.set(6, grandparents[2]);
  if (grandparents[3]) ancestorNodes.set(7, grandparents[3]);

  return {
    ancestors: { nodes: ancestorNodes, generations: 3, hasMoreAncestors },
    descendantRoot: dn(focal, children, { hasMoreChildren }),
    descendantGenerations: 2,
    spouses,
    siblings,
  };
}

// ---------------------------------------------------------------------------
// buildPedigreeTreePerson
// ---------------------------------------------------------------------------

describe('buildPedigreeTreePerson', () => {
  it('single person (focal only): isFocal=true, no parents, no children', () => {
    const tree = pedigree3(p('focal'));
    const tp = buildPedigreeTreePerson(tree);
    expect(tp.person.id).toBe('focal');
    expect(tp.isFocal).toBe(true);
    expect(tp.parents).toHaveLength(0);
    expect(tp.children).toHaveLength(0);
    expect(tp.spouses).toHaveLength(0);
  });

  it('focal + two parents: parents wired, no grandparents', () => {
    const tree = pedigree3(p('focal'), [p('dad'), p('mum')]);
    const tp = buildPedigreeTreePerson(tree);

    expect(tp.parents).toHaveLength(2);
    expect(tp.parents[0].person.id).toBe('dad');
    expect(tp.parents[1].person.id).toBe('mum');
    // parents are not focal
    expect(tp.parents[0].isFocal).toBeFalsy();
    expect(tp.parents[0].parents).toHaveLength(0);
  });

  it('3-gen tree: grandparents wired onto parents', () => {
    const tree = pedigree3(
      p('focal'),
      [p('dad'), p('mum')],
      [p('pgf'), p('pgm'), p('mgf'), p('mgm')],
    );
    const tp = buildPedigreeTreePerson(tree);

    const dad = tp.parents[0];
    expect(dad.parents).toHaveLength(2);
    expect(dad.parents[0].person.id).toBe('pgf');
    expect(dad.parents[1].person.id).toBe('pgm');

    const mum = tp.parents[1];
    expect(mum.parents).toHaveLength(2);
    expect(mum.parents[0].person.id).toBe('mgf');
    expect(mum.parents[1].person.id).toBe('mgm');
  });

  it('children is always empty (ancestor-direction only)', () => {
    const tree = pedigree3(p('focal'), [p('dad'), p('mum')]);
    const tp = buildPedigreeTreePerson(tree);
    // No descendant data exists in a PedigreeTree
    expect(tp.children).toHaveLength(0);
    expect(tp.parents[0].children).toHaveLength(0);
  });

  it('hasMoreAncestors is reflected on the relevant node', () => {
    const moreSet = new Set<number>([2]); // father has more ancestors
    const tree = pedigree3(p('focal'), [p('dad'), null], [null, null, null, null], moreSet);
    const tp = buildPedigreeTreePerson(tree);

    expect(tp.hasMoreAncestors).toBe(false);
    expect(tp.parents[0].hasMoreAncestors).toBe(true);
  });

  it('throws when focal person (key=1) is missing', () => {
    const tree: PedigreeTree = { nodes: new Map(), generations: 1 };
    expect(() => buildPedigreeTreePerson(tree)).toThrow('Focal person not found');
  });

  it('only-father tree: single parent, no mother slot', () => {
    const tree = pedigree3(p('focal'), [p('dad'), null]);
    const tp = buildPedigreeTreePerson(tree);
    expect(tp.parents).toHaveLength(1);
    expect(tp.parents[0].person.id).toBe('dad');
  });
});

// ---------------------------------------------------------------------------
// buildDescendantTreePerson
// ---------------------------------------------------------------------------

describe('buildDescendantTreePerson', () => {
  it('single focal person: isFocal=true, no children', () => {
    const root = dn(p('focal'));
    const tp = buildDescendantTreePerson(root);
    expect(tp.person.id).toBe('focal');
    expect(tp.isFocal).toBe(true);
    expect(tp.children).toHaveLength(0);
    expect(tp.parents).toHaveLength(0);
  });

  it('focal with two children: children wired, no parents', () => {
    const root = dn(p('focal'), [dn(p('child1')), dn(p('child2'))]);
    const tp = buildDescendantTreePerson(root);
    expect(tp.children).toHaveLength(2);
    expect(tp.children[0].person.id).toBe('child1');
    expect(tp.children[1].person.id).toBe('child2');
    // children are not focal
    expect(tp.children[0].isFocal).toBe(false);
    expect(tp.parents).toHaveLength(0);
  });

  it('3-gen tree: grandchildren wired onto children', () => {
    const root = dn(p('focal'), [
      dn(p('child1'), [dn(p('gc1')), dn(p('gc2'))]),
    ]);
    const tp = buildDescendantTreePerson(root);
    expect(tp.children[0].children).toHaveLength(2);
    expect(tp.children[0].children[0].person.id).toBe('gc1');
    expect(tp.children[0].children[1].person.id).toBe('gc2');
  });

  it('hasMoreChildren is propagated to TreePerson nodes', () => {
    const root = dn(p('focal'), [dn(p('child1'), [], { hasMoreChildren: true })], { hasMoreChildren: false });
    const tp = buildDescendantTreePerson(root);
    expect(tp.hasMoreChildren).toBe(false);
    expect(tp.children[0].hasMoreChildren).toBe(true);
  });

  it('coParentId is propagated onto child nodes', () => {
    const root = dn(p('focal'), [dn(p('child1'), [], { coParentId: 'spouse-id' })]);
    const tp = buildDescendantTreePerson(root);
    expect(tp.children[0].coParentId).toBe('spouse-id');
  });

  it('grandchildren have no parents (ancestor direction not populated)', () => {
    const root = dn(p('focal'), [dn(p('child1'), [dn(p('gc1'))])]);
    const tp = buildDescendantTreePerson(root);
    expect(tp.children[0].parents).toHaveLength(0);
    expect(tp.children[0].children[0].parents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildHourglassTree
// ---------------------------------------------------------------------------

describe('buildHourglassTree', () => {
  it('minimal: focal only, no ancestors/descendants/spouses/siblings', () => {
    const tree = hourglassTree(p('focal'));
    const tp = buildHourglassTree(tree);

    expect(tp.person.id).toBe('focal');
    expect(tp.isFocal).toBe(true);
    expect(tp.parents).toHaveLength(0);
    expect(tp.children).toHaveLength(0);
    expect(tp.spouses).toHaveLength(0);
    expect(tp.siblings).toHaveLength(0);
  });

  it('ancestors are wired as parents', () => {
    const tree = hourglassTree(p('focal'), { parents: [p('dad'), p('mum')] });
    const tp = buildHourglassTree(tree);

    expect(tp.parents).toHaveLength(2);
    expect(tp.parents[0].person.id).toBe('dad');
    expect(tp.parents[1].person.id).toBe('mum');
  });

  it('descendants become children of focal', () => {
    const tree = hourglassTree(p('focal'), {
      children: [dn(p('child1')), dn(p('child2'))],
    });
    const tp = buildHourglassTree(tree);

    expect(tp.children).toHaveLength(2);
    expect(tp.children[0].person.id).toBe('child1');
    expect(tp.children[1].person.id).toBe('child2');
  });

  it('spouses are attached to focal', () => {
    const tree = hourglassTree(p('focal'), { spouses: [p('sp1', { sex: 'F' }), p('sp2', { sex: 'M' })] });
    const tp = buildHourglassTree(tree);

    expect(tp.spouses).toHaveLength(2);
    expect(tp.spouses[0].person.id).toBe('sp1');
    expect(tp.spouses[1].person.id).toBe('sp2');
    // Spouse nodes get empty arrays
    expect(tp.spouses[0].parents).toHaveLength(0);
    expect(tp.spouses[0].children).toHaveLength(0);
  });

  it('siblings are attached to focal', () => {
    const tree = hourglassTree(p('focal'), { siblings: [p('sib1'), p('sib2')] });
    const tp = buildHourglassTree(tree);

    expect(tp.siblings).toHaveLength(2);
    expect(tp.siblings![0].person.id).toBe('sib1');
    expect(tp.siblings![1].person.id).toBe('sib2');
  });

  it('all four sides populated: ancestors + descendants + spouses + siblings', () => {
    const tree = hourglassTree(p('focal'), {
      parents: [p('dad'), p('mum')],
      children: [dn(p('child1'))],
      spouses: [p('spouse', { sex: 'F' })],
      siblings: [p('sibling')],
    });
    const tp = buildHourglassTree(tree);

    expect(tp.parents).toHaveLength(2);
    expect(tp.children).toHaveLength(1);
    expect(tp.spouses).toHaveLength(1);
    expect(tp.siblings).toHaveLength(1);
  });

  it('hasMoreAncestors is reflected on ancestor nodes', () => {
    const moreSet = new Set<number>([2]);
    const tree = hourglassTree(p('focal'), {
      parents: [p('dad'), null],
      hasMoreAncestors: moreSet,
    });
    const tp = buildHourglassTree(tree);

    expect(tp.hasMoreAncestors).toBe(false);
    expect(tp.parents[0].hasMoreAncestors).toBe(true);
  });

  it('hasMoreChildren is reflected on focal', () => {
    const tree = hourglassTree(p('focal'), { hasMoreChildren: true });
    const tp = buildHourglassTree(tree);
    expect(tp.hasMoreChildren).toBe(true);
  });

  it('throws when focal person is missing from ancestors', () => {
    const emptyAncestors: PedigreeTree = { nodes: new Map(), generations: 1 };
    const tree: HourglassTree = {
      ancestors: emptyAncestors,
      descendantRoot: dn(p('focal')),
      descendantGenerations: 1,
      spouses: [],
      siblings: [],
    };
    expect(() => buildHourglassTree(tree)).toThrow('Focal person not found');
  });

  it('default empty siblings when not provided', () => {
    const tree: HourglassTree = {
      ancestors: { nodes: new Map([[1, p('focal')]]), generations: 1 },
      descendantRoot: dn(p('focal')),
      descendantGenerations: 1,
      spouses: [],
      // siblings deliberately omitted
    };
    const tp = buildHourglassTree(tree);
    expect(tp.siblings).toHaveLength(0);
  });

  it('3-gen grandparents wired through ancestor section', () => {
    const tree = hourglassTree(p('focal'), {
      parents: [p('dad'), p('mum')],
      grandparents: [p('pgf'), p('pgm'), p('mgf'), p('mgm')],
    });
    const tp = buildHourglassTree(tree);

    const dad = tp.parents[0];
    expect(dad.parents).toHaveLength(2);
    expect(dad.parents[0].person.id).toBe('pgf');

    const mum = tp.parents[1];
    expect(mum.parents).toHaveLength(2);
    expect(mum.parents[0].person.id).toBe('mgf');
  });
});

// ---------------------------------------------------------------------------
// injectOutlines
// ---------------------------------------------------------------------------

describe('injectOutlines', () => {
  function singlePerson(sex: 'M' | 'F' | 'U' = 'U'): TreePerson {
    return {
      person: p('focal', { sex }),
      parents: [],
      children: [],
      spouses: [],
      isFocal: true,
    };
  }

  it('injects son and daughter placeholders into children', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal');
    const placeholderChildren = root.children.filter(c => c.isPlaceholder);
    expect(placeholderChildren).toHaveLength(2);
    const roles = placeholderChildren.map(c => c.placeholderRole);
    expect(roles).toContain('son');
    expect(roles).toContain('daughter');
  });

  it('son placeholder has sex M and daughter has sex F', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal');
    const son = root.children.find(c => c.placeholderRole === 'son');
    const daughter = root.children.find(c => c.placeholderRole === 'daughter');
    expect(son!.person.sex).toBe('M');
    expect(daughter!.person.sex).toBe('F');
  });

  it('injects father and mother when no real parents exist', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal');
    const parentRoles = root.parents.filter(c => c.isPlaceholder).map(c => c.placeholderRole);
    expect(parentRoles).toContain('father');
    expect(parentRoles).toContain('mother');
  });

  it('father placeholder has sex M and mother has sex F', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal');
    const father = root.parents.find(c => c.placeholderRole === 'father');
    const mother = root.parents.find(c => c.placeholderRole === 'mother');
    expect(father!.person.sex).toBe('M');
    expect(mother!.person.sex).toBe('F');
  });

  it('does NOT inject father when real father (M) already exists', () => {
    const root = singlePerson();
    root.parents.push({ person: p('real-dad', { sex: 'M' }), parents: [], children: [], spouses: [] });
    injectOutlines(root, 'focal');
    const fatherPhs = root.parents.filter(c => c.isPlaceholder && c.placeholderRole === 'father');
    expect(fatherPhs).toHaveLength(0);
    // But mother placeholder should still be injected
    const motherPhs = root.parents.filter(c => c.isPlaceholder && c.placeholderRole === 'mother');
    expect(motherPhs).toHaveLength(1);
  });

  it('does NOT inject mother when real mother (F) already exists', () => {
    const root = singlePerson();
    root.parents.push({ person: p('real-mum', { sex: 'F' }), parents: [], children: [], spouses: [] });
    injectOutlines(root, 'focal');
    const motherPhs = root.parents.filter(c => c.isPlaceholder && c.placeholderRole === 'mother');
    expect(motherPhs).toHaveLength(0);
    // Father placeholder should still be injected
    const fatherPhs = root.parents.filter(c => c.isPlaceholder && c.placeholderRole === 'father');
    expect(fatherPhs).toHaveLength(1);
  });

  it('explicitly provided parentInfo overrides tree-derived parent state', () => {
    const root = singlePerson();
    // Tree has no real parents, but parentInfo says both exist
    injectOutlines(root, 'focal', { hasFather: true, hasMother: true });
    const phParents = root.parents.filter(c => c.isPlaceholder);
    expect(phParents).toHaveLength(0);
  });

  it('parentInfo hasFather=false still injects father even if tree is empty', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal', { hasFather: false, hasMother: true });
    const fatherPhs = root.parents.filter(c => c.isPlaceholder && c.placeholderRole === 'father');
    expect(fatherPhs).toHaveLength(1);
    const motherPhs = root.parents.filter(c => c.isPlaceholder && c.placeholderRole === 'mother');
    expect(motherPhs).toHaveLength(0);
  });

  it('male focal: spouse placeholder appended (sex F)', () => {
    const root = singlePerson('M');
    injectOutlines(root, 'focal');
    const spousePh = root.spouses.find(c => c.isPlaceholder && c.placeholderRole === 'spouse');
    expect(spousePh).toBeDefined();
    expect(spousePh!.person.sex).toBe('F');
    // pushed to end
    expect(root.spouses[root.spouses.length - 1].placeholderRole).toBe('spouse');
  });

  it('female focal: spouse placeholder prepended (sex M)', () => {
    const root = singlePerson('F');
    root.spouses.push({ person: p('existing-spouse'), parents: [], children: [], spouses: [] });
    injectOutlines(root, 'focal');
    const spousePh = root.spouses.find(c => c.isPlaceholder && c.placeholderRole === 'spouse');
    expect(spousePh).toBeDefined();
    expect(spousePh!.person.sex).toBe('M');
    // unshifted — first element
    expect(root.spouses[0].placeholderRole).toBe('spouse');
  });

  it('placeholder ids start with PLACEHOLDER_PREFIX', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal');
    const allPhs = [
      ...root.parents.filter(c => c.isPlaceholder),
      ...root.children.filter(c => c.isPlaceholder),
      ...root.spouses.filter(c => c.isPlaceholder),
    ];
    for (const ph of allPhs) {
      expect(ph.person.id.startsWith(PLACEHOLDER_PREFIX)).toBe(true);
    }
  });

  it('placeholder ids encode the role and target person id', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal');
    const sonPh = root.children.find(c => c.placeholderRole === 'son')!;
    expect(sonPh.person.id).toBe(`${PLACEHOLDER_PREFIX}son_focal`);
    expect(sonPh.placeholderForPersonId).toBe('focal');
  });

  it('does nothing when selectedPersonId is not found in tree', () => {
    const root = singlePerson();
    const parentsBefore = root.parents.length;
    const childrenBefore = root.children.length;
    injectOutlines(root, 'nonexistent-id');
    expect(root.parents.length).toBe(parentsBefore);
    expect(root.children.length).toBe(childrenBefore);
  });

  it('injects on a descendant (not focal) when that person is the selected one', () => {
    // Build a tree where focal has a child
    const childTP: TreePerson = { person: p('child', { sex: 'M' }), parents: [], children: [], spouses: [] };
    const root: TreePerson = {
      person: p('focal'),
      parents: [],
      children: [childTP],
      spouses: [],
      isFocal: true,
    };
    injectOutlines(root, 'child');
    // child should now have placeholder children
    const childNode = root.children[0];
    expect(childNode.children.filter(c => c.isPlaceholder).length).toBeGreaterThan(0);
  });

  it('isPlaceholder and placeholderRole are set on injected nodes', () => {
    const root = singlePerson();
    injectOutlines(root, 'focal');
    for (const ph of root.children.filter(c => c.isPlaceholder)) {
      expect(ph.isPlaceholder).toBe(true);
      expect(ph.placeholderRole).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// findPerson
// ---------------------------------------------------------------------------

describe('findPerson', () => {
  function makeTree(): TreePerson {
    const grandchild: TreePerson = { person: p('gc'), parents: [], children: [], spouses: [] };
    const child: TreePerson = { person: p('child'), parents: [], children: [grandchild], spouses: [] };
    const parent: TreePerson = { person: p('parent'), parents: [], children: [], spouses: [] };
    const spouse: TreePerson = { person: p('spouse'), parents: [], children: [], spouses: [] };
    const sibling: TreePerson = { person: p('sibling'), parents: [], children: [], spouses: [] };
    const focal: TreePerson = {
      person: p('focal'),
      parents: [parent],
      children: [child],
      spouses: [spouse],
      siblings: [sibling],
      isFocal: true,
    };
    return focal;
  }

  it('finds the root itself', () => {
    const root = makeTree();
    const found = findPerson(root, 'focal');
    expect(found).not.toBeNull();
    expect(found!.person.id).toBe('focal');
  });

  it('finds a parent', () => {
    const root = makeTree();
    const found = findPerson(root, 'parent');
    expect(found).not.toBeNull();
    expect(found!.person.id).toBe('parent');
  });

  it('finds a child', () => {
    const root = makeTree();
    const found = findPerson(root, 'child');
    expect(found).not.toBeNull();
    expect(found!.person.id).toBe('child');
  });

  it('finds a grandchild (recursive depth)', () => {
    const root = makeTree();
    const found = findPerson(root, 'gc');
    expect(found).not.toBeNull();
    expect(found!.person.id).toBe('gc');
  });

  it('finds a spouse', () => {
    const root = makeTree();
    const found = findPerson(root, 'spouse');
    expect(found).not.toBeNull();
    expect(found!.person.id).toBe('spouse');
  });

  it('finds a sibling', () => {
    const root = makeTree();
    const found = findPerson(root, 'sibling');
    expect(found).not.toBeNull();
    expect(found!.person.id).toBe('sibling');
  });

  it('returns null for unknown id', () => {
    const root = makeTree();
    expect(findPerson(root, 'unknown-id')).toBeNull();
  });

  it('handles single-person tree', () => {
    const root: TreePerson = { person: p('only'), parents: [], children: [], spouses: [] };
    expect(findPerson(root, 'only')).not.toBeNull();
    expect(findPerson(root, 'other')).toBeNull();
  });

  it('does not infinite-loop on circular references', () => {
    // Create a cycle: A → B (parent), B → A (child)
    const a: TreePerson = { person: p('a'), parents: [], children: [], spouses: [] };
    const b: TreePerson = { person: p('b'), parents: [a], children: [], spouses: [] };
    a.children.push(b); // cycle
    // Should not throw and should find both
    expect(findPerson(a, 'b')).not.toBeNull();
    expect(findPerson(a, 'a')).not.toBeNull();
    expect(findPerson(a, 'missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PLACEHOLDER_PREFIX constant
// ---------------------------------------------------------------------------

describe('PLACEHOLDER_PREFIX', () => {
  it('is a non-empty string', () => {
    expect(typeof PLACEHOLDER_PREFIX).toBe('string');
    expect(PLACEHOLDER_PREFIX.length).toBeGreaterThan(0);
  });

  it('placeholder ids generated by injectOutlines start with it', () => {
    const root: TreePerson = {
      person: p('focal'),
      parents: [],
      children: [],
      spouses: [],
    };
    injectOutlines(root, 'focal');
    const allPhs = [
      ...root.parents.filter(c => c.isPlaceholder),
      ...root.children.filter(c => c.isPlaceholder),
      ...root.spouses.filter(c => c.isPlaceholder),
    ];
    expect(allPhs.length).toBeGreaterThan(0);
    for (const ph of allPhs) {
      expect(ph.person.id).toMatch(new RegExp(`^${PLACEHOLDER_PREFIX}`));
    }
  });
});
