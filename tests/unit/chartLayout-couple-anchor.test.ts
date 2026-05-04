// Common children under couple connector — shared children visibly belong to
// the couple that produced them, not to the focal parent alone.
//
// User goal (from docs/plans/2026-05-04-hourglass-chart-polish.md):
//   A child whose two parents are both rendered on the chart hangs from the
//   parent–parent connector midpoint, not from one parent's bottom edge.

import { describe, it, expect } from 'vitest';
import { computeHourglassLayout } from '../../src/renderer/utils/chart-layout';
import type { PersonNode, TreePerson } from '../../src/renderer/utils/chart-layout';

function p(id: string, overrides: Partial<PersonNode> = {}): PersonNode {
  return {
    id, givenName: 'Test', surname: id, preferredName: null, nickname: null,
    sex: 'U', living: true, birthDate: null, deathDate: null,
    birthPlace: null, deathPlace: null, photoUrl: null,
    ...overrides,
  };
}

/** First M-token in the path (the connector's start). */
function firstMove(d: string): { x: number; y: number } {
  const m = d.match(/^M\s+([\d.-]+),([\d.-]+)/);
  if (!m) throw new Error(`No initial M in path: ${d}`);
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

/** Find the path whose first M lands at the given child's top edge X (within tol). */
function pathStartingAtChild(paths: string[], childCX: number, childTopY: number, tol = 0.5): string | null {
  // The connector ENDS at (childCX, childTopY). Find a path whose terminal V is
  // childTopY and whose first segment starts at column near startX of interest.
  // Easier proxy: a path whose final V equals childTopY and contains childCX.
  for (const d of paths) {
    // Last token before path end should be V <childTopY> after H <childCX>.
    if (!d.includes(`V ${childTopY}`) && !d.includes(`V ${childTopY.toFixed(1)}`)) continue;
    if (d.includes(`H ${childCX}`) || d.includes(`${childCX},`)) return d;
  }
  // Fallback: best-effort — return paths whose terminal coordinate matches.
  for (const d of paths) {
    const tokens = d.trim().split(/\s+/);
    // Find last V and the X used when it was emitted (last fromX before V).
    let lastVy: number | null = null;
    let curX = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === 'M' || t === 'Q') {
        const which = t === 'Q' ? i + 2 : i + 1;
        const [x] = tokens[which].split(',').map(Number);
        curX = x;
        i = t === 'Q' ? i + 2 : i + 1;
      } else if (t === 'H') {
        curX = parseFloat(tokens[i + 1]);
        i += 1;
      } else if (t === 'V') {
        lastVy = parseFloat(tokens[i + 1]);
        i += 1;
      }
    }
    if (lastVy !== null && Math.abs(lastVy - childTopY) < tol && Math.abs(curX - childCX) < tol) {
      return d;
    }
  }
  return null;
}

describe('couple-anchor: shared children hang from the parent–parent connector midpoint', () => {
  it('focal F + spouse S + shared child C → child connector starts between F and S, not at F center', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [{ person: p('spouse', { sex: 'F' }), parents: [], children: [], spouses: [] }],
      children: [{
        person: p('child'), parents: [], children: [], spouses: [],
        coParentId: 'spouse',
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);

    const focalBox = layout.boxes.find(b => b.isFocal)!;
    const spouseBox = layout.boxes.find(b => b.person.id === 'spouse')!;
    const childBox = layout.boxes.find(b => b.person.id === 'child')!;

    // Spouse is on the right (focal is M, so spouses go right per Fix 1 layout).
    expect(spouseBox.x).toBeGreaterThan(focalBox.x);

    const focalRightEdge = focalBox.x + focalBox.w;
    const spouseLeftEdge = spouseBox.x;
    const expectedMidX = (focalRightEdge + spouseLeftEdge) / 2;
    const focalCX = focalBox.x + focalBox.w / 2;

    const childCX = childBox.x + childBox.w / 2;
    const childTopY = childBox.y;
    const childPath = pathStartingAtChild(layout.paths, childCX, childTopY);
    expect(childPath, `no child connector found for C ending at (${childCX}, ${childTopY})`).not.toBeNull();

    const start = firstMove(childPath!);
    // The shared child's connector originates at the couple-connector midpoint
    // (between focal's right edge and spouse's left edge), NOT at focal's center.
    expect(start.x).toBeCloseTo(expectedMidX, 1);
    // Sanity: the new anchor X is materially different from focal's center.
    expect(Math.abs(start.x - focalCX)).toBeGreaterThan(1);
  });

  it('focal F + spouse S + half-sibling H (coParentId=null) → H connector starts at F center bottom', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [{ person: p('spouse', { sex: 'F' }), parents: [], children: [], spouses: [] }],
      children: [{
        person: p('half'), parents: [], children: [], spouses: [],
        coParentId: null,
      }],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);

    const focalBox = layout.boxes.find(b => b.isFocal)!;
    const halfBox = layout.boxes.find(b => b.person.id === 'half')!;
    const focalCX = focalBox.x + focalBox.w / 2;
    const focalBottom = focalBox.y + focalBox.h;

    const halfCX = halfBox.x + halfBox.w / 2;
    const halfTopY = halfBox.y;
    const halfPath = pathStartingAtChild(layout.paths, halfCX, halfTopY);
    expect(halfPath).not.toBeNull();

    const start = firstMove(halfPath!);
    // Behaviour preserved: half-sibling drops from focal's bottom center.
    expect(start.x).toBeCloseTo(focalCX, 1);
    expect(start.y).toBeCloseTo(focalBottom, 1);
  });

  it('focal + 2 spouses + 1 child per spouse → each child anchors to its own couple connector', () => {
    const tree: TreePerson = {
      person: p('focal', { sex: 'M' }),
      parents: [],
      spouses: [
        { person: p('s1', { sex: 'F' }), parents: [], children: [], spouses: [] },
        { person: p('s2', { sex: 'F' }), parents: [], children: [], spouses: [] },
      ],
      children: [
        { person: p('c1'), parents: [], children: [], spouses: [], coParentId: 's1' },
        { person: p('c2'), parents: [], children: [], spouses: [], coParentId: 's2' },
      ],
      isFocal: true,
    };
    const layout = computeHourglassLayout(tree);

    const focalBox = layout.boxes.find(b => b.isFocal)!;
    const s1Box = layout.boxes.find(b => b.person.id === 's1')!;
    const s2Box = layout.boxes.find(b => b.person.id === 's2')!;
    const c1Box = layout.boxes.find(b => b.person.id === 'c1')!;
    const c2Box = layout.boxes.find(b => b.person.id === 'c2')!;

    const focalRightEdge = focalBox.x + focalBox.w;
    const focalCenterY = focalBox.y + focalBox.h / 2;

    // Spouse 0 (s1) is the adjacent spouse — its marriage line is the focal's
    // centerline. Spouse 1 (s2) uses the U-jog under the row.
    const s1MidX = (focalRightEdge + s1Box.x) / 2;
    // s2's couple anchor: midpoint between focal's right edge and s2's left edge
    // (s2 is further out on the same side as s1).
    const s2MidX = (focalRightEdge + s2Box.x) / 2;

    const c1Path = pathStartingAtChild(layout.paths, c1Box.x + c1Box.w / 2, c1Box.y);
    const c2Path = pathStartingAtChild(layout.paths, c2Box.x + c2Box.w / 2, c2Box.y);
    expect(c1Path, 'c1 connector missing').not.toBeNull();
    expect(c2Path, 'c2 connector missing').not.toBeNull();

    const c1Start = firstMove(c1Path!);
    const c2Start = firstMove(c2Path!);

    // c1 anchors to focal-s1 marriage line (centerline stub).
    expect(c1Start.x).toBeCloseTo(s1MidX, 1);
    expect(c1Start.y).toBeCloseTo(focalCenterY, 1);

    // c2 anchors to focal-s2 marriage line (jog under the row), at s2's pair
    // midpoint X — different from c1's anchor.
    expect(c2Start.x).toBeCloseTo(s2MidX, 1);
    // c2 originates BELOW the focal box bottom (at the jog Y), not at focal
    // centerline — that's the visible difference from spouse[0].
    expect(c2Start.y).toBeGreaterThan(focalBox.y + focalBox.h - 0.5);
    expect(Math.abs(c2Start.x - c1Start.x)).toBeGreaterThan(1);
  });
});
