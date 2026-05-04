// Multi-partner edge routing — every spouse gets its own connector, and no
// connector ever passes through a non-paired spouse's bounding box. This is
// the test for the "Inger and Anna-Lena look married to each other" bug.
//
// User goal (from docs/plans/2026-05-04-hourglass-chart-polish.md):
//   Multi-partner relationships don't make co-partners look married to each
//   other. With N partners, the focal connects to each via its OWN line that
//   does not visually pass through any other partner's box.

import { describe, it, expect } from 'vitest';
import { computeHourglassLayout } from '../../src/renderer/utils/chart-layout';
import type { PersonNode, TreePerson } from '../../src/renderer/utils/chart-layout';
import { BOX_W } from '../../src/renderer/utils/chart-layout';

function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
  return {
    id, givenName: 'Test', surname: id, preferredName: null, nickname: null,
    sex: 'U', living: true, birthDate: null, deathDate: null,
    birthPlace: null, deathPlace: null, photoUrl: null,
    ...overrides,
  };
}

function focalWithSpouses(focalSex: 'M' | 'F', spouseIds: string[]): TreePerson {
  return {
    person: p('focal', { sex: focalSex }),
    parents: [],
    children: [],
    spouses: spouseIds.map(id => ({ person: p(id), parents: [], children: [], spouses: [] })),
    isFocal: true,
  };
}

// --- Path geometry helpers ----------------------------------------------------
// SVG paths emitted by curvedElbow + marriageJog use the limited token set:
//   M x,y   V y   H x   Q x,y x,y
// We extract straight segments (M→V, M→H, V→H, H→V, V→V, H→H) for crossing
// checks. Quadratic curves are at corners with radius ≤ 12 px; the segment
// endpoints we collect bracket each curve, so any "passes through a box" test
// captures the body-crossing case correctly.

interface Seg { x1: number; y1: number; x2: number; y2: number; }

function parsePath(d: string): Seg[] {
  const tokens = d.replace(/^D:/, '').trim().split(/\s+/);
  const segs: Seg[] = [];
  let curX = 0, curY = 0;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'M') {
      const [x, y] = tokens[i + 1].split(',').map(Number);
      curX = x; curY = y;
      i += 2;
    } else if (t === 'V') {
      const y = parseFloat(tokens[i + 1]);
      segs.push({ x1: curX, y1: curY, x2: curX, y2: y });
      curY = y;
      i += 2;
    } else if (t === 'H') {
      const x = parseFloat(tokens[i + 1]);
      segs.push({ x1: curX, y1: curY, x2: x, y2: curY });
      curX = x;
      i += 2;
    } else if (t === 'Q') {
      // Skip control point, jump to endpoint. We approximate the curve by its
      // endpoint — the curve itself stays within an r×r corner box.
      const [, ey] = tokens[i + 2].split(',').map(Number);
      const [ex] = tokens[i + 2].split(',').map(Number);
      curX = ex; curY = ey;
      i += 3;
    } else {
      i++;
    }
  }
  return segs;
}

interface Box { x: number; y: number; w: number; h: number; id: string; }

function segCrossesBoxBody(seg: Seg, box: Box, slack = 1): boolean {
  // We test whether the line *enters the box body* — i.e. crosses fully into
  // the interior, not just touches an edge. Slack of 1 px keeps adjacent
  // touches (line ending at box edge) from counting.
  const minSegX = Math.min(seg.x1, seg.x2);
  const maxSegX = Math.max(seg.x1, seg.x2);
  const minSegY = Math.min(seg.y1, seg.y2);
  const maxSegY = Math.max(seg.y1, seg.y2);
  // Box interior (shrunk by slack)
  const bx1 = box.x + slack;
  const bx2 = box.x + box.w - slack;
  const by1 = box.y + slack;
  const by2 = box.y + box.h - slack;
  if (bx2 <= bx1 || by2 <= by1) return false;
  // Horizontal segment: y is constant, x sweeps. Crosses interior iff y inside
  // and x range overlaps interior x range.
  if (seg.y1 === seg.y2) {
    return seg.y1 > by1 && seg.y1 < by2 && maxSegX > bx1 && minSegX < bx2;
  }
  // Vertical segment
  if (seg.x1 === seg.x2) {
    return seg.x1 > bx1 && seg.x1 < bx2 && maxSegY > by1 && minSegY < by2;
  }
  return false;
}

function pathCrossesBoxBody(d: string, box: Box): boolean {
  return parsePath(d).some(seg => segCrossesBoxBody(seg, box));
}

// --- Tests --------------------------------------------------------------------

describe('multi-partner edge routing — no connector crosses a non-paired spouse box', () => {
  it('focal with 2 spouses: emits per-spouse connectors that do not cross intermediate boxes', () => {
    const tree = focalWithSpouses('M', ['sp1', 'sp2']);
    const layout = computeHourglassLayout(tree);

    const sp1Box = layout.boxes.find(b => b.person.id === 'sp1');
    const sp2Box = layout.boxes.find(b => b.person.id === 'sp2');
    expect(sp1Box).toBeDefined();
    expect(sp2Box).toBeDefined();

    const sp1: Box = { x: sp1Box!.x, y: sp1Box!.y, w: sp1Box!.w, h: sp1Box!.h, id: 'sp1' };
    const sp2: Box = { x: sp2Box!.x, y: sp2Box!.y, w: sp2Box!.w, h: sp2Box!.h, id: 'sp2' };

    // The OLD bug was: a single horizontal line spans focal → sp2, passing
    // through sp1's body. Assertion: NO emitted path crosses sp1's body.
    for (const d of layout.paths) {
      expect(pathCrossesBoxBody(d, sp1)).toBe(false);
      expect(pathCrossesBoxBody(d, sp2)).toBe(false);
    }
  });

  it('focal with 3 spouses: no connector path crosses any non-paired spouse box', () => {
    // Bengt's repro generalised: 3 partners on the same side stresses the U-jog.
    const tree = focalWithSpouses('M', ['sp1', 'sp2', 'sp3']);
    const layout = computeHourglassLayout(tree);

    const ids = ['sp1', 'sp2', 'sp3'];
    const spouseBoxes: Box[] = ids.map(id => {
      const b = layout.boxes.find(box => box.person.id === id)!;
      return { x: b.x, y: b.y, w: b.w, h: b.h, id };
    });

    // Every emitted path must avoid every spouse box body. Even with a U-jog,
    // each connector terminates at a clear endpoint — none traverses any box.
    for (const d of layout.paths) {
      for (const sb of spouseBoxes) {
        expect(
          pathCrossesBoxBody(d, sb),
          `path "${d}" crosses through spouse box ${sb.id} at (${sb.x},${sb.y},${sb.w}x${sb.h})`,
        ).toBe(false);
      }
    }
  });

  it('emits one connector per spouse, not a single span', () => {
    // Counts: with N spouses, the OLD code emitted 1 connector spanning all.
    // The NEW code emits N — each spouse paired with focal individually.
    const tree2 = focalWithSpouses('M', ['sp1', 'sp2']);
    const layout2 = computeHourglassLayout(tree2);
    // Filter: only paths whose endpoints touch the focal's marriage line height
    // — sibling/parent/child connectors are vertical-first, focal-spouse paths
    // are horizontal-first. The simplest robust assertion is "at least N
    // distinct paths terminate at distinct spouse-near-edge X coordinates."
    const focalBox = layout2.boxes.find(b => b.isFocal)!;
    const sp1 = layout2.boxes.find(b => b.person.id === 'sp1')!;
    const sp2 = layout2.boxes.find(b => b.person.id === 'sp2')!;
    const focalLineY = focalBox.y + focalBox.h / 2;

    // sp1 is adjacent → its connector is a horizontal stub at focalLineY ending
    // at sp1's near edge. sp2 connector enters from below at sp2's center.
    // Either way: at least 2 distinct paths reference sp1/sp2 endpoints.
    const sp1NearX = sp1.x; // M's spouses are on the right, so near edge = x (left edge of sp1)
    const sp2NearX = sp2.x;
    void sp1NearX; void sp2NearX; void focalLineY;

    // Two spouses → at least 2 marriage connectors. The old code emitted one
    // path that ended at sp2's far edge; the new code emits ≥2 distinct paths.
    // We approximate "marriage connector" as paths whose first M is at focal's
    // marriage line height (focalLineY).
    const marriageConnectors = layout2.paths.filter(d => {
      const m = d.match(/^M\s+([\d.-]+),([\d.-]+)/);
      if (!m) return false;
      const my = parseFloat(m[2]);
      return Math.abs(my - focalLineY) < 0.5;
    });
    expect(marriageConnectors.length).toBeGreaterThanOrEqual(2);
  });

  it('female focal with 3 spouses on the left side: same property holds', () => {
    // Mirror geometry — F's spouses go left rather than right.
    const tree = focalWithSpouses('F', ['sp1', 'sp2', 'sp3']);
    const layout = computeHourglassLayout(tree);

    const ids = ['sp1', 'sp2', 'sp3'];
    const spouseBoxes: Box[] = ids.map(id => {
      const b = layout.boxes.find(box => box.person.id === id)!;
      return { x: b.x, y: b.y, w: b.w, h: b.h, id };
    });

    for (const d of layout.paths) {
      for (const sb of spouseBoxes) {
        expect(
          pathCrossesBoxBody(d, sb),
          `path "${d}" crosses through spouse box ${sb.id}`,
        ).toBe(false);
      }
    }
  });

  it('non-focal node (e.g. parent) with multiple spouses also routes per-pair', () => {
    // The placeSpouses helper is also called for ancestors. Same fix should apply.
    const father: TreePerson = {
      person: p('dad', { sex: 'M' }),
      parents: [], children: [],
      spouses: [
        { person: p('mom1', { sex: 'F' }), parents: [], children: [], spouses: [] },
        { person: p('mom2', { sex: 'F' }), parents: [], children: [], spouses: [] },
      ],
    };
    const tree: TreePerson = {
      person: p('focal'),
      parents: [father],
      children: [], spouses: [],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);

    const mom1 = layout.boxes.find(b => b.person.id === 'mom1');
    const mom2 = layout.boxes.find(b => b.person.id === 'mom2');
    expect(mom1).toBeDefined();
    expect(mom2).toBeDefined();
    const m1Box: Box = { x: mom1!.x, y: mom1!.y, w: mom1!.w, h: mom1!.h, id: 'mom1' };
    const m2Box: Box = { x: mom2!.x, y: mom2!.y, w: mom2!.w, h: mom2!.h, id: 'mom2' };

    for (const d of layout.paths) {
      expect(pathCrossesBoxBody(d, m1Box)).toBe(false);
      expect(pathCrossesBoxBody(d, m2Box)).toBe(false);
    }
  });
});

// Silence unused import warning in some configs
void BOX_W;
