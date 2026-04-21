// Curved elbow connector path builder for chart connectors.
// Generates SVG path "d" attribute strings for connecting boxes.

import { CURVE_R } from './constants';

/**
 * Generate a curved elbow SVG path between two points.
 *
 * - `"right"` (pedigree): horizontal-first elbow (goes right, then bends to target Y)
 * - `"down"` (hourglass/descendant): vertical-first elbow (goes down/up, then bends to target X)
 *
 * `customMidY` (only honored for direction `"down"`) forces the horizontal
 * segment to a specific Y. Used when several connectors share a junction — e.g.
 * a child going up to multiple parents of varying heights — so all horizontals
 * align even though each connector ends at its own parent's bottom.
 *
 * Returns a straight line for same-axis connections.
 */
export function curvedElbow(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  direction: 'right' | 'down',
  customMidY?: number,
): string {
  const dx = toX - fromX;
  const dy = toY - fromY;

  if (direction === 'right') {
    // Same Y — simple horizontal line
    if (dy === 0) return `M ${fromX},${fromY} H ${toX}`;

    const midX = (fromX + toX) / 2;
    const r = Math.min(CURVE_R, Math.abs(dy) / 2, Math.abs(midX - fromX));
    const signY = dy > 0 ? 1 : -1;
    const signX = dx > 0 ? 1 : -1;

    return [
      `M ${fromX},${fromY}`,
      `H ${midX - signX * r}`,
      `Q ${midX},${fromY} ${midX},${fromY + signY * r}`,
      `V ${toY - signY * r}`,
      `Q ${midX},${toY} ${midX + signX * r},${toY}`,
      `H ${toX}`,
    ].join(' ');
  } else {
    // direction === 'down'
    // Same X — simple vertical line
    if (dx === 0) return `M ${fromX},${fromY} V ${toY}`;

    const midY = customMidY ?? (fromY + toY) / 2;
    // When the horizontal segment lands exactly at toY, emit a clean L-shape
    // instead of letting r→0 produce degenerate quadratic arcs.
    if (Math.abs(midY - toY) < 0.5) return `M ${fromX},${fromY} V ${midY} H ${toX}`;
    const r = Math.min(
      CURVE_R,
      Math.abs(dx) / 2,
      Math.abs(midY - fromY),
      Math.abs(midY - toY),
    );
    const signX = dx > 0 ? 1 : -1;
    const signY = dy > 0 ? 1 : -1;

    return [
      `M ${fromX},${fromY}`,
      `V ${midY - signY * r}`,
      `Q ${fromX},${midY} ${fromX + signX * r},${midY}`,
      `H ${toX - signX * r}`,
      `Q ${toX},${midY} ${toX},${midY + signY * r}`,
      `V ${toY}`,
    ].join(' ');
  }
}
