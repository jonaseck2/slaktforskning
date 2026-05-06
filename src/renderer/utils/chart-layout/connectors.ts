// Curved elbow connector path builder for chart connectors.
// Generates SVG path "d" attribute strings for connecting boxes.

import { CURVE_R } from './constants';

/**
 * SVG `stroke-dasharray` value for a parent_child relationship subtype.
 *
 * The hourglass chart uses dash pattern alone (not color) to encode
 * relationship subtype, so the user can tell foster from adoptive at a
 * glance without conflicting with the existing colour-mode setting
 * (themed / sex-coloured).
 *
 * Patterns are deliberately distinct from the outline-placeholder dash
 * (`"4 3"`) so a placeholder edge stays visually different from an
 * adoptive edge.
 *
 *   biological → 'none'   (solid line)
 *   foster     → '8 4'    (long dashes)
 *   adopted    → '2 3'    (dotted)
 *   step       → '8 4'    (treated as foster for now — the plan deferred a
 *                         distinct visual; revisit when the user asks)
 *   unknown    → 'none'   (assume biological for now — flagging it as
 *                         dashed would mis-signal an authored value)
 *   null       → 'none'   (biological-equivalent; no relationship-subtype
 *                         data present)
 */
export type ParentSubtypeForDash =
  | 'biological'
  | 'adopted'
  | 'foster'
  | 'step'
  | 'unknown'
  | null
  | undefined;

export function dashForSubtype(subtype: ParentSubtypeForDash): string {
  switch (subtype) {
    case 'foster':
      return '8 4';
    case 'adopted':
      return '2 3';
    // Deferred — same visual as foster until the user asks for a third style.
    case 'step':
      return '8 4';
    // Ambiguous — assume biological so we don't claim authored data we
    // don't have.
    case 'unknown':
    case 'biological':
    case null:
    case undefined:
    default:
      return 'none';
  }
}

/**
 * Generate a U-shaped marriage connector between a focal node and a non-adjacent
 * spouse on the same side. Used for the 3+ spouse case where a direct horizontal
 * line would visually cross through one or more intermediate spouse boxes.
 *
 * The path drops vertically from the focal node's edge to a `jogY` below (or
 * above) the row, travels horizontally under (or over) any intermediate spouses,
 * and rises to meet the target spouse's edge.
 *
 * `fromX`, `fromY` is the focal-side endpoint (typically focal.x ± BOX_W/2 at
 * the marriage-line height). `toX`, `toY` is the target spouse's near-edge
 * endpoint at the same height. `jogY` is the y-coordinate of the horizontal
 * traversal; it must be different from `fromY` (i.e. clearly below or above
 * the row).
 */
export function marriageJog(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  jogY: number,
): string {
  const dy1 = jogY - fromY;
  const dy2 = toY - jogY;
  const dx = toX - fromX;
  const signY1 = dy1 >= 0 ? 1 : -1;
  const signY2 = dy2 >= 0 ? 1 : -1;
  const signX = dx >= 0 ? 1 : -1;
  const r = Math.min(
    CURVE_R,
    Math.abs(dy1) / 2,
    Math.abs(dy2) / 2,
    Math.abs(dx) / 2,
  );

  return [
    `M ${fromX},${fromY}`,
    `V ${jogY - signY1 * r}`,
    `Q ${fromX},${jogY} ${fromX + signX * r},${jogY}`,
    `H ${toX - signX * r}`,
    `Q ${toX},${jogY} ${toX},${jogY + signY2 * r}`,
    `V ${toY}`,
  ].join(' ');
}

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
