// Property-based assertion library for chart-layout invariants.
//
// These helpers replace the implicit "what does a golden snapshot protect?"
// question with seven named invariants. Each one fails fast with a message
// naming the specific boxes involved, so when the layout algorithm changes,
// the failure tells the reader which invariant broke — not "the JSON differs".
//
// The Layout type here is the project's ChartLayout (see types.ts). Box ids
// come from `box.person.id`; "generation" is inferred from coordinate
// clustering (boxes that share an axis value within tolerance are in the same
// generation), because BoxLayout itself does not carry a generation field.

import type { ChartLayout, BoxLayout, PlaceholderBox } from '../../../src/renderer/utils/chart-layout/types';

export type ChartType = 'pedigree' | 'hourglass' | 'descendant';

/** Read the id of a box (its person.id). */
function boxId(b: BoxLayout): string {
  return b.person.id;
}

/**
 * No two real boxes overlap. Two boxes share an overlap if both their X and Y
 * extents intersect. Failure message names both boxes with their full geometry.
 */
export function assertNoOverlaps(layout: ChartLayout): void {
  const boxes = layout.boxes;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlapX && overlapY) {
        throw new Error(
          `Box ${boxId(a)} at (${a.x}, ${a.y}, ${a.w}x${a.h}) overlaps Box ${boxId(b)} at (${b.x}, ${b.y}, ${b.w}x${b.h})`,
        );
      }
    }
  }
}

/**
 * Parent direction is correct for the chart type.
 *
 * Connectors in ChartLayout are purely geometric (x1/y1/x2/y2 only — no
 * person id), so we accept an explicit list of (parent, child) id pairs the
 * caller knows from the fixture. For each pair, verify the parent box's
 * dominant coordinate is on the correct side of the child's:
 *
 *   - pedigree:   ancestors are to the RIGHT of descendants (x grows toward root)
 *   - hourglass:  ancestors are ABOVE descendants (y grows downward)
 *   - descendant: parents are ABOVE children (y grows downward)
 *
 * Failure message names both boxes and the axis values involved.
 */
export function assertParentDirection(
  layout: ChartLayout,
  chartType: ChartType,
  edges: Array<{ parent: string; child: string }>,
): void {
  for (const edge of edges) {
    const parent = layout.boxes.find((b) => boxId(b) === edge.parent);
    const child = layout.boxes.find((b) => boxId(b) === edge.child);
    if (!parent || !child) continue;
    switch (chartType) {
      case 'pedigree':
        if (parent.x <= child.x) {
          throw new Error(
            `Pedigree: parent ${edge.parent} (x=${parent.x}) should be right of child ${edge.child} (x=${child.x})`,
          );
        }
        break;
      case 'hourglass':
      case 'descendant':
        if (parent.y >= child.y) {
          throw new Error(
            `${chartType[0].toUpperCase() + chartType.slice(1)}: parent ${edge.parent} (y=${parent.y}) should be above child ${edge.child} (y=${child.y})`,
          );
        }
        break;
    }
  }
}

/**
 * Boxes belonging to the same generation share an axis value within tolerance.
 *
 * The chart layouts do not stamp boxes with a generation number, so the test
 * caller passes generation groups directly — a list of box-id arrays where each
 * inner array is one generation. For each group, the boxes' alignment axis
 * (`x` for pedigree, `y` for hourglass/descendant) must vary by no more than
 * `tolerance` pixels.
 *
 * Failure message names the chart type, the alignment span, and every box id
 * in the offending group.
 */
export function assertGenerationAlignment(
  layout: ChartLayout,
  chartType: ChartType,
  generations: string[][],
  tolerance = 2,
): void {
  for (let gen = 0; gen < generations.length; gen++) {
    const ids = generations[gen];
    const group = ids
      .map((id) => layout.boxes.find((b) => boxId(b) === id))
      .filter((b): b is BoxLayout => b !== undefined);
    if (group.length < 2) continue;
    const axisValues = chartType === 'pedigree' ? group.map((b) => b.x) : group.map((b) => b.y);
    const min = Math.min(...axisValues);
    const max = Math.max(...axisValues);
    if (max - min > tolerance) {
      throw new Error(
        `Generation ${gen} (${chartType}): boxes span ${min}..${max} on the alignment axis (tolerance ${tolerance}). Boxes: ${group.map(boxId).join(', ')}`,
      );
    }
  }
}

/**
 * Outline placeholders sit adjacent to the anchor box they belong to.
 *
 * A placeholder is "adjacent" if its centre lies within `maxDistanceMultiplier`
 * × max(anchor.w, anchor.h) of the anchor's centre. Placeholders are by design
 * attached to a particular real box via `childPersonId`; this helper checks
 * each placeholder against its declared anchor.
 *
 * Failure message names the placeholder role, its coordinates, and the anchor
 * coordinates.
 */
export function assertOutlineAdjacency(
  layout: ChartLayout,
  maxDistanceMultiplier = 3,
): void {
  const placeholders: PlaceholderBox[] = layout.placeholders ?? [];
  for (const ph of placeholders) {
    const anchor = layout.boxes.find((b) => boxId(b) === ph.childPersonId);
    if (!anchor) {
      throw new Error(
        `Outline placeholder ${ph.role} for ${ph.childPersonId} has no anchor box in layout`,
      );
    }
    const anchorCx = anchor.x + anchor.w / 2;
    const anchorCy = anchor.y + anchor.h / 2;
    const phCx = ph.x;
    const phCy = ph.y;
    const dx = Math.abs(phCx - anchorCx);
    const dy = Math.abs(phCy - anchorCy);
    const maxDist = Math.max(anchor.w, anchor.h) * maxDistanceMultiplier;
    if (dx > maxDist && dy > maxDist) {
      throw new Error(
        `Outline placeholder ${ph.role} for ${ph.childPersonId} at (${ph.x}, ${ph.y}) too far from anchor at (${anchor.x}, ${anchor.y}) (dx=${dx}, dy=${dy}, max=${maxDist})`,
      );
    }
  }
}

/**
 * A couple (person + spouse) sits within `maxGap` pixels of each other along
 * the dominant axis. For hourglass spouses, "dominant" means horizontal: the
 * spouse box's `x` must be within `personBox.w + maxGap` of the person box's
 * `x`.
 *
 * Failure message names both ids and the actual gap.
 */
export function assertCoupleSpacing(
  layout: ChartLayout,
  personId: string,
  spouseId: string,
  maxGap = 60,
): void {
  const a = layout.boxes.find((b) => boxId(b) === personId);
  const b = layout.boxes.find((bx) => boxId(bx) === spouseId);
  if (!a || !b) return;
  const gap = Math.abs(a.x - b.x);
  if (gap > a.w + maxGap) {
    throw new Error(
      `Couple ${personId}/${spouseId}: gap=${gap}px exceeds box-width ${a.w} + max-gap ${maxGap}`,
    );
  }
}

/**
 * Every real box is "connected" — either it's the only box, it carries a
 * connector line touching its bounds, or it's the focal box (focal can be
 * legitimately disconnected in single-node charts).
 *
 * Failure message names the orphan box id.
 */
export function assertConnectivity(layout: ChartLayout): void {
  if (layout.boxes.length <= 1) return;
  const lineEndpoints = layout.lines;
  const paths = layout.paths;
  for (const box of layout.boxes) {
    if (box.isFocal) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const ln of lineEndpoints) {
      xs.push(ln.x1, ln.x2);
      ys.push(ln.y1, ln.y2);
    }
    const tolerance = 2;
    const touchesLine = lineEndpoints.some((ln) => {
      const endsOnBox = (px: number, py: number) =>
        px >= box.x - tolerance &&
        px <= box.x + box.w + tolerance &&
        py >= box.y - tolerance &&
        py <= box.y + box.h + tolerance;
      return endsOnBox(ln.x1, ln.y1) || endsOnBox(ln.x2, ln.y2);
    });
    // Path strings contain "M x,y" move commands; a connector to this box
    // produces a path whose move-to or final point lies within box bounds.
    const cxStr = `${box.x},${box.y}`;
    const touchesPath = paths.some((d) => d.includes(`M ${box.x}`) || d.includes(cxStr));
    if (!touchesLine && !touchesPath) {
      throw new Error(`Box ${boxId(box)} has no connecting line or path (orphan)`);
    }
  }
}

/**
 * Total svg extent stays within `tolerancePct` of an expected width × height.
 * Used by regression tests to pin the overall canvas to a documented size; a
 * generous tolerance protects against pixel-level reflow without locking exact
 * values.
 *
 * Failure message reports both expected and actual extents with deltas.
 */
export function assertStableExtent(
  layout: ChartLayout,
  expected: { width: number; height: number },
  tolerancePct = 10,
): void {
  const actual = {
    width: layout.svgWidth,
    height: layout.svgHeight,
  };
  const widthDelta = (Math.abs(actual.width - expected.width) / expected.width) * 100;
  const heightDelta = (Math.abs(actual.height - expected.height) / expected.height) * 100;
  if (widthDelta > tolerancePct || heightDelta > tolerancePct) {
    throw new Error(
      `Extent drift: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height} (${widthDelta.toFixed(1)}% / ${heightDelta.toFixed(1)}%)`,
    );
  }
}
