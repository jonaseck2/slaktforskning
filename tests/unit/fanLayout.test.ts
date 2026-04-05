import { describe, it, expect } from 'vitest';
import { computeFanLayout } from '../../src/renderer/utils/fanLayout';
import type { PedigreeTree, PersonNode } from '../../src/renderer/utils/chartLayout';

function makeNode(id: string): PersonNode {
  return {
    id, givenName: 'Test', surname: 'Nilsson', preferredName: null,
    nickname: null, sex: 'M', living: false, birthYear: 1900, deathYear: 1980,
  };
}

function makeTree(maxAhn: number): PedigreeTree {
  const nodes = new Map<number, PersonNode>();
  for (let n = 1; n <= maxAhn; n++) nodes.set(n, makeNode(String(n)));
  return { nodes, generations: 7 };
}

describe('computeFanLayout', () => {
  it('always returns exactly 127 segments', () => {
    const treeEmpty: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    expect(computeFanLayout(treeEmpty)).toHaveLength(127);
    expect(computeFanLayout(makeTree(127))).toHaveLength(127);
  });

  it('focal segment has isFocal=true, generation=0, ahnNum=1', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const focal = computeFanLayout(tree).find(s => s.ahnNum === 1)!;
    expect(focal.isFocal).toBe(true);
    expect(focal.generation).toBe(0);
    expect(focal.isEmpty).toBe(false);
    expect(focal.person?.id).toBe('1');
  });

  it('marks missing ancestors as empty with null person', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const nonFocal = computeFanLayout(tree).filter(s => !s.isFocal);
    expect(nonFocal).toHaveLength(126);
    expect(nonFocal.every(s => s.isEmpty)).toBe(true);
    expect(nonFocal.every(s => s.person === null)).toBe(true);
  });

  it('each generation covers exactly 360 degrees', () => {
    const segs = computeFanLayout(makeTree(127));
    for (let g = 0; g <= 6; g++) {
      const total = segs
        .filter(s => s.generation === g)
        .reduce((sum, s) => sum + s.sweepDeg, 0);
      expect(Math.round(total)).toBe(360);
    }
  });

  it('ahnentafel 4 gets base paternal-grandfather blue fill', () => {
    const segs = computeFanLayout(makeTree(7));
    expect(segs.find(s => s.ahnNum === 4)!.fill).toBe('#6a9cc0');
  });

  it('ahnentafel 5 gets base paternal-grandmother green fill', () => {
    const segs = computeFanLayout(makeTree(7));
    expect(segs.find(s => s.ahnNum === 5)!.fill).toBe('#6aaa78');
  });

  it('deeper generations of same branch are lighter', () => {
    const segs = computeFanLayout(makeTree(127));
    const r4  = parseInt(segs.find(s => s.ahnNum === 4)!.fill.slice(1, 3), 16);
    const r8  = parseInt(segs.find(s => s.ahnNum === 8)!.fill.slice(1, 3), 16);
    const r16 = parseInt(segs.find(s => s.ahnNum === 16)!.fill.slice(1, 3), 16);
    expect(r8).toBeGreaterThan(r4);
    expect(r16).toBeGreaterThan(r8);
  });

  it('ahnentafel 8 and 9 are in the same blue branch as ahnentafel 4', () => {
    const segs = computeFanLayout(makeTree(15));
    const fill8  = segs.find(s => s.ahnNum === 8)!.fill;
    const fill9  = segs.find(s => s.ahnNum === 9)!.fill;
    const fill8r = parseInt(fill8.slice(1, 3), 16);
    const fill9r = parseInt(fill9.slice(1, 3), 16);
    expect(fill8r).toBeGreaterThan(106);
    expect(fill8r).toBe(fill9r);
  });

  it('non-focal pathD starts with M and contains an A arc command', () => {
    const segs = computeFanLayout(makeTree(3));
    const nonFocal = segs.filter(s => !s.isFocal);
    for (const seg of nonFocal) {
      expect(seg.pathD).toMatch(/^M /);
      expect(seg.pathD).toContain(' A ');
    }
  });

  it('focal pathD is empty string', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const focal = computeFanLayout(tree).find(s => s.isFocal)!;
    expect(focal.pathD).toBe('');
  });
});
