// tests/unit/fanLayout.test.ts
import { describe, it, expect } from 'vitest';
import { computeFanLayout, fanViewBox, fanOuterRadius, type ArcSpan } from '../../src/renderer/utils/fanLayout';
import { branchBaseColors, branchFill } from '../../src/renderer/utils/fanColors';
import type { PersonNode, PedigreeTree } from '../../src/renderer/utils/chart-layout/types';

// PedigreeTree is { nodes: Map<number, PersonNode>; generations: number; hasMoreAncestors?: Set<number> }
// We only need nodes and generations for layout tests.

function makeNode(id: string, sex: 'M' | 'F' | 'U' = 'M'): PersonNode {
  return {
    id, givenName: 'Test', surname: 'Nilsson', preferredName: null,
    nickname: null, sex, living: false, birthDate: '1900', deathDate: '1980',
  };
}

function makeTree(maxAhn: number): PedigreeTree {
  const nodes = new Map<number, PersonNode>();
  for (let n = 1; n <= maxAhn; n++) nodes.set(n, makeNode(String(n)));
  return { nodes, generations: Math.floor(Math.log2(maxAhn)) + 1 };
}

describe('computeFanLayout', () => {
  it('returns correct number of segments for default 6 generations', () => {
    const tree = makeTree(1);
    const segs = computeFanLayout(tree, { maxGen: 6 });
    // 2^0 + 2^1 + ... + 2^6 = 127
    expect(segs).toHaveLength(127);
  });

  it('returns correct segment count for 4 generations', () => {
    const tree = makeTree(1);
    const segs = computeFanLayout(tree, { maxGen: 4 });
    // 2^0 + 2^1 + 2^2 + 2^3 + 2^4 = 31
    expect(segs).toHaveLength(31);
  });

  it('returns correct segment count for 8 generations', () => {
    const tree = makeTree(1);
    const segs = computeFanLayout(tree, { maxGen: 8 });
    // 2^0 + ... + 2^8 = 511
    expect(segs).toHaveLength(511);
  });

  it('focal segment has isFocal=true, generation=0, ahnNum=1', () => {
    const tree = makeTree(1);
    const focal = computeFanLayout(tree).find(s => s.ahnNum === 1)!;
    expect(focal.isFocal).toBe(true);
    expect(focal.generation).toBe(0);
    expect(focal.isEmpty).toBe(false);
    expect(focal.person?.id).toBe('1');
  });

  it('marks missing ancestors as empty with null person', () => {
    const tree: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const nonFocal = computeFanLayout(tree).filter(s => !s.isFocal);
    expect(nonFocal.every(s => s.isEmpty)).toBe(true);
    expect(nonFocal.every(s => s.person === null)).toBe(true);
  });

  it('each generation covers exactly arcSpan degrees (180)', () => {
    const segs = computeFanLayout(makeTree(127), { arcSpan: 180, maxGen: 6 });
    for (let g = 0; g <= 6; g++) {
      const total = segs
        .filter(s => s.generation === g)
        .reduce((sum, s) => sum + s.sweepDeg, 0);
      expect(Math.round(total)).toBe(180);
    }
  });

  it('each generation covers exactly arcSpan degrees (270)', () => {
    const segs = computeFanLayout(makeTree(127), { arcSpan: 270, maxGen: 6 });
    for (let g = 0; g <= 6; g++) {
      const total = segs
        .filter(s => s.generation === g)
        .reduce((sum, s) => sum + s.sweepDeg, 0);
      expect(Math.round(total)).toBe(270);
    }
  });

  it('each generation covers exactly arcSpan degrees (360)', () => {
    const segs = computeFanLayout(makeTree(127), { arcSpan: 360, maxGen: 6 });
    for (let g = 0; g <= 6; g++) {
      const total = segs
        .filter(s => s.generation === g)
        .reduce((sum, s) => sum + s.sweepDeg, 0);
      expect(Math.round(total)).toBe(360);
    }
  });

  it('non-focal pathD starts with M and contains A arc command', () => {
    const segs = computeFanLayout(makeTree(3));
    const nonFocal = segs.filter(s => !s.isFocal);
    for (const seg of nonFocal) {
      expect(seg.pathD).toMatch(/^M /);
      expect(seg.pathD).toContain(' A ');
    }
  });

  it('focal pathD and focalPathD are empty — <circle> handles focal rendering', () => {
    const segs = computeFanLayout(makeTree(1), { arcSpan: 180 });
    const focal = segs.find(s => s.isFocal)!;
    expect(focal.pathD).toBe('');
    expect(focal.focalPathD).toBe('');
  });

  it('default fill fallback: non-empty non-focal = #999, empty = #e0e0e0', () => {
    const treeOnlyFocal: PedigreeTree = { nodes: new Map([[1, makeNode('1')]]), generations: 7 };
    const segs = computeFanLayout(treeOnlyFocal, { maxGen: 6 });
    const nonFocal = segs.filter(s => !s.isFocal);
    expect(nonFocal.every(s => s.fill === '#e0e0e0')).toBe(true);

    const filled = computeFanLayout(makeTree(7), { maxGen: 6 });
    expect(filled.find(s => s.ahnNum === 2)!.fill).toBe('#999');
    expect(filled.find(s => s.isFocal)!.fill).toBe('#2c3e50');
  });

  it('fillFn is called and its return value is used as fill', () => {
    const branches = branchBaseColors('#2d5a27');
    const segs = computeFanLayout(makeTree(7), {
      maxGen: 6,
      fillFn: (ahnNum, gen, isEmpty) => branchFill(ahnNum, gen, isEmpty, branches, false),
    });
    const father = segs.find(s => s.ahnNum === 2)!;
    expect(father.fill).toBe(branches[0]);
    const mother = segs.find(s => s.ahnNum === 3)!;
    expect(mother.fill).toBe(branches[2]);
  });

  it('deeper generations with branchFill produce lighter fills in light mode', () => {
    const branches = branchBaseColors('#2d5a27');
    const segs = computeFanLayout(makeTree(127), {
      maxGen: 6,
      fillFn: (ahnNum, gen, isEmpty) => branchFill(ahnNum, gen, isEmpty, branches, false),
    });
    const r4  = parseInt(segs.find(s => s.ahnNum === 4)!.fill.slice(1, 3), 16);
    const r8  = parseInt(segs.find(s => s.ahnNum === 8)!.fill.slice(1, 3), 16);
    const r16 = parseInt(segs.find(s => s.ahnNum === 16)!.fill.slice(1, 3), 16);
    expect(r8).toBeGreaterThan(r4);
    expect(r16).toBeGreaterThan(r8);
  });

  it('segments have curved text paths for non-focal', () => {
    const segs = computeFanLayout(makeTree(3));
    const parent = segs.find(s => s.ahnNum === 2)!;
    expect(parent.textPathD).toContain('M ');
    expect(parent.textPathD).toContain(' A ');
    expect(parent.textPathGivenD).toContain('M ');
    expect(parent.textPathBirthD).toContain('M ');
    expect(parent.textPathDeathD).toContain('M ');
  });

  it('exposes both tangential (textAngle) and radial (textAngleRadial) rotations', () => {
    const segs = computeFanLayout(makeTree(127), { arcSpan: 360, maxGen: 6 });
    for (const seg of segs) {
      expect(Number.isFinite(seg.textAngle)).toBe(true);
      expect(Number.isFinite(seg.textAngleRadial)).toBe(true);
    }
    // The two angles are 90° apart before the readability flip
    const sample = segs.find(s => s.ahnNum === 8)!;
    const diff = Math.abs(((sample.textAngle - sample.textAngleRadial) % 180 + 180) % 180 - 90);
    expect(diff).toBeLessThan(0.5);
  });

  it('gen 5+ rings are deep enough for radial text (≥46px)', () => {
    const segs = computeFanLayout(makeTree(1), { maxGen: 8 });
    // radial depth = outer ring radius jump. We probe it indirectly via viewBox growth.
    const r5 = fanOuterRadius(5) - fanOuterRadius(4);
    const r6 = fanOuterRadius(6) - fanOuterRadius(5);
    const r7 = fanOuterRadius(7) - fanOuterRadius(6);
    const r8 = fanOuterRadius(8) - fanOuterRadius(7);
    expect(r5).toBeGreaterThanOrEqual(46);
    expect(r6).toBeGreaterThanOrEqual(46);
    expect(r7).toBeGreaterThanOrEqual(46);
    expect(r8).toBeGreaterThanOrEqual(46);
    void segs;
  });

  it('clamps maxGen to 8', () => {
    const segs = computeFanLayout(makeTree(1), { maxGen: 12 });
    const maxGenFound = Math.max(...segs.map(s => s.generation));
    expect(maxGenFound).toBe(8);
  });

  it('clamps maxGen minimum to 1', () => {
    const segs = computeFanLayout(makeTree(1), { maxGen: 0 });
    const maxGenFound = Math.max(...segs.map(s => s.generation));
    expect(maxGenFound).toBe(1);
  });
});

describe('fanViewBox', () => {
  it('returns positive width and height', () => {
    for (const span of [180, 210, 240, 270, 360] as ArcSpan[]) {
      const vb = fanViewBox(span, 6);
      expect(vb.width).toBeGreaterThan(0);
      expect(vb.height).toBeGreaterThan(0);
      expect(vb.cx).toBeGreaterThan(0);
      expect(vb.cy).toBeGreaterThan(0);
    }
  });

  it('180° fan is wider than tall (excluding focal bulge)', () => {
    const vb = fanViewBox(180, 6);
    // For 180° fan, the width should be roughly 2x the outer radius
    // and the height roughly 1x (half circle)
    expect(vb.width).toBeGreaterThan(vb.height * 0.8);
  });

  it('360° fan is square', () => {
    const vb = fanViewBox(360, 6);
    expect(vb.width).toBe(vb.height);
  });
});

describe('fanOuterRadius', () => {
  it('increases with more generations', () => {
    expect(fanOuterRadius(4)).toBeLessThan(fanOuterRadius(6));
    expect(fanOuterRadius(6)).toBeLessThan(fanOuterRadius(8));
  });
});
