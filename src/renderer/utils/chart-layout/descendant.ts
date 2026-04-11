// Standalone descendant chart layout algorithm.

import type { DescendantNode, ChartLayout, BoxLayout, CollapseButton, Line } from './types';
import { BOX_W, BOX_H, V_GAP, GEN_GAP, PAD } from './constants';

/**
 * Lay out a top-down descendant chart starting from a focal person at the top.
 * Children fan out downward, centered below their parent.
 */
export function computeDescendantLayout(
  root: DescendantNode,
  maxGenerations: number,
  collapsed: Set<string> = new Set(),
): ChartLayout {
  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];
  const collapseButtons: CollapseButton[] = [];

  const rowY = (depth: number) => PAD + depth * (BOX_H + GEN_GAP);

  // Compute how wide a subtree needs to be (left extent, right extent from node's CX).
  function subtreeExtents(node: DescendantNode, depth: number): [number, number] {
    const half = BOX_W / 2;
    if (depth >= maxGenerations || node.children.length === 0) return [half, half];
    if (collapsed.has(`${node.person.id}:down`)) return [half, half];

    const n = node.children.length;
    const childExts = node.children.map(c => subtreeExtents(c, depth + 1));

    // Offsets of each child's CX from the leftmost child's CX
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];

    const leftExt = Math.max(half, totalSpan / 2 + childExts[0][0]);
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]);
    return [leftExt, rightExt];
  }

  // Recursively place boxes and connector lines.
  function place(node: DescendantNode, depth: number, cx: number): void {
    boxes.push({
      person: node.person,
      isFocal: depth === 0,
      x: cx - BOX_W / 2,
      y: rowY(depth),
      w: BOX_W,
      h: BOX_H,
    });

    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(`${node.person.id}:down`);

    // Add collapse/expand button if there are children or more to load
    if (hasChildren) {
      collapseButtons.push({
        personId: node.person.id,
        direction: 'down',
        cx,
        cy: rowY(depth) + BOX_H + 10,
        isExpanded: !isCollapsed,
        isLoadMore: false,
      });
    } else if (node.hasMoreChildren) {
      collapseButtons.push({
        personId: node.person.id,
        direction: 'down',
        cx,
        cy: rowY(depth) + BOX_H + 10,
        isExpanded: false,
        isLoadMore: true,
      });
    }

    // Place children if not collapsed and within depth limit
    if (depth < maxGenerations && hasChildren && !isCollapsed) {
      const forkY = rowY(depth) + BOX_H + GEN_GAP / 2;

      // Vertical line from parent bottom to fork
      lines.push({ x1: cx, y1: rowY(depth) + BOX_H, x2: cx, y2: forkY });

      const n = node.children.length;
      const childExts = node.children.map(c => subtreeExtents(c, depth + 1));
      const offsets: number[] = [0];
      for (let i = 1; i < n; i++) {
        offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
      }
      const totalSpan = offsets[n - 1];
      const leftmostCX = cx - totalSpan / 2;
      const childCXs = offsets.map(o => leftmostCX + o);

      // Horizontal bar connecting children
      if (n > 1) {
        lines.push({ x1: childCXs[0], y1: forkY, x2: childCXs[n - 1], y2: forkY });
      }

      // Vertical drops to each child + recurse
      for (let ci = 0; ci < n; ci++) {
        lines.push({ x1: childCXs[ci], y1: forkY, x2: childCXs[ci], y2: rowY(depth + 1) });
        place(node.children[ci], depth + 1, childCXs[ci]);
      }
    }
  }

  // Compute root extents to determine canvas center
  const [leftExt, rightExt] = subtreeExtents(root, 0);
  const rootCX = PAD + leftExt;

  place(root, 0, rootCX);

  const svgWidth = rootCX + rightExt + PAD;
  // Find the deepest row used
  let maxDepth = 0;
  for (const box of boxes) {
    const depth = Math.round((box.y - PAD) / (BOX_H + GEN_GAP));
    if (depth > maxDepth) maxDepth = depth;
  }
  const svgHeight = rowY(maxDepth) + BOX_H + 20 + PAD;

  return { boxes, lines, svgWidth, svgHeight, viewBoxMinY: 0, collapseButtons, placeholders: [], placeholderLines: [] };
}
