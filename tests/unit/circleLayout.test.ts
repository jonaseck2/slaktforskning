import { describe, it, expect } from 'vitest';
import { computeCircleLayout } from '../../src/renderer/utils/circleLayout';
import { branchBaseColors, branchFill } from '../../src/renderer/utils/circleColors';
import type { PedigreeTree, PersonNode } from '../../src/renderer/utils/chartLayout';

function makeNode(id: string): PersonNode {
  return {
    id, givenName: 'Test', surname: 'Nilsson', preferredName: null,
    nickname: null, sex: 'M', living: false, birthDate: '1900', deathDate: '1980',
  };
}

function makeTree(maxAhn: number): PedigreeTree {
  const nodes = new Map<number, PersonNode>();
  for (let n = 1; n <= maxAhn; n++) nodes.set(n, makeNode(String(n)));
  return { nodes, generations: 7 };
}

describe('computeCircleLayout', () => {
  it('always returns exactly 127 segments', () => {
    const treeEmpty: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    expect(computeCircleLayout(treeEmpty)).toHaveLength(127);
    expect(computeCircleLayout(makeTree(127))).toHaveLength(127);
  });

  it('focal segment has isFocal=true, generation=0, ahnNum=1', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const focal = computeCircleLayout(tree).find(s => s.ahnNum === 1)!;
    expect(focal.isFocal).toBe(true);
    expect(focal.generation).toBe(0);
    expect(focal.isEmpty).toBe(false);
    expect(focal.person?.id).toBe('1');
  });

  it('marks missing ancestors as empty with null person', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const nonFocal = computeCircleLayout(tree).filter(s => !s.isFocal);
    expect(nonFocal).toHaveLength(126);
    expect(nonFocal.every(s => s.isEmpty)).toBe(true);
    expect(nonFocal.every(s => s.person === null)).toBe(true);
  });

  it('each generation covers exactly 360 degrees', () => {
    const segs = computeCircleLayout(makeTree(127));
    for (let g = 0; g <= 6; g++) {
      const total = segs
        .filter(s => s.generation === g)
        .reduce((sum, s) => sum + s.sweepDeg, 0);
      expect(Math.round(total)).toBe(360);
    }
  });

  it('fillFn is called and its return value is used as fill', () => {
    const branches = branchBaseColors('#2d5a27') as [string, string, string, string];
    const fillFn = (ahnNum: number, gen: number, isEmpty: boolean) =>
      branchFill(ahnNum, gen, isEmpty, branches, false);
    const segs = computeCircleLayout(makeTree(7), 6, fillFn);
    // Father (ahnNum=2, gen=1) gets branch 0 color
    const father = segs.find(s => s.ahnNum === 2)!;
    expect(father.fill).toBe(branches[0]);
    // Mother (ahnNum=3, gen=1) gets branch 2 color
    const mother = segs.find(s => s.ahnNum === 3)!;
    expect(mother.fill).toBe(branches[2]);
  });

  it('without fillFn, default fallback is used (non-empty = #999, empty = #e0e0e0)', () => {
    const treeWithOnlyFocal: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const segs = computeCircleLayout(treeWithOnlyFocal);
    const nonFocal = segs.filter(s => !s.isFocal);
    expect(nonFocal.every(s => s.fill === '#e0e0e0')).toBe(true);
    const filled = computeCircleLayout(makeTree(7));
    expect(filled.find(s => s.ahnNum === 2)!.fill).toBe('#999');
  });

  it('deeper generations with fillFn produce lighter fills in light mode', () => {
    const branches = branchBaseColors('#2d5a27') as [string, string, string, string];
    const fillFn = (ahnNum: number, gen: number, isEmpty: boolean) =>
      branchFill(ahnNum, gen, isEmpty, branches, false);
    const segs = computeCircleLayout(makeTree(127), 6, fillFn);
    const r4  = parseInt(segs.find(s => s.ahnNum === 4)!.fill.slice(1, 3), 16);
    const r8  = parseInt(segs.find(s => s.ahnNum === 8)!.fill.slice(1, 3), 16);
    const r16 = parseInt(segs.find(s => s.ahnNum === 16)!.fill.slice(1, 3), 16);
    expect(r8).toBeGreaterThan(r4);
    expect(r16).toBeGreaterThan(r8);
  });

  it('ahnentafel 8 and 9 share same branch fill via fillFn', () => {
    const branches = branchBaseColors('#2d5a27') as [string, string, string, string];
    const fillFn = (ahnNum: number, gen: number, isEmpty: boolean) =>
      branchFill(ahnNum, gen, isEmpty, branches, false);
    const segs = computeCircleLayout(makeTree(15), 6, fillFn);
    const fill8  = segs.find(s => s.ahnNum === 8)!.fill;
    const fill9  = segs.find(s => s.ahnNum === 9)!.fill;
    // ahn 8 and 9 both map to branch 0 (rootAhn >> (gen-2): 8>>2=2→branchIdx -2... wait: gen=3, rootAhn=8>>1=4, branchIdx=0)
    expect(fill8).toBe(fill9);
  });

  it('non-focal pathD starts with M and contains an A arc command', () => {
    const segs = computeCircleLayout(makeTree(3));
    const nonFocal = segs.filter(s => !s.isFocal);
    for (const seg of nonFocal) {
      expect(seg.pathD).toMatch(/^M /);
      expect(seg.pathD).toContain(' A ');
    }
  });

  it('focal pathD is empty string', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const focal = computeCircleLayout(tree).find(s => s.isFocal)!;
    expect(focal.pathD).toBe('');
  });
});
