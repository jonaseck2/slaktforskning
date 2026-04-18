// Curved elbow connector path builder for chart connectors.
// Generates SVG path "d" attribute strings for connecting boxes.

import { CURVE_R } from './constants';

/**
 * Generate a curved elbow SVG path between two points.
 *
 * - `"right"` (pedigree): horizontal-first elbow (goes right, then bends to target Y)
 * - `"down"` (hourglass/descendant): vertical-first elbow (goes down/up, then bends to target X)
 *
 * Returns a straight line for same-axis connections.
 */
export function curvedElbow(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  direction: 'right' | 'down',
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

    const midY = (fromY + toY) / 2;
    const r = Math.min(CURVE_R, Math.abs(dx) / 2, Math.abs(midY - fromY));
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
