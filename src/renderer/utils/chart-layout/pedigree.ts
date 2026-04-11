// Pedigree chart layout algorithm.

import type { PersonNode, PedigreeTree, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, BOX_H, V_GAP, H_GAP, PAD, ROW_H } from './constants';

/**
 * Lay out a pedigree chart (focal at left, ancestors going right).
 * Handles any number of generations via ahnentafel numbering.
 */
export function computePedigreeLayout(
  tree: PedigreeTree,
  collapsed: Set<string> = new Set(),
  /** When set, only show add-parent placeholders for this person (prevents overlap). */
  selectedPersonId?: string | null,
): ChartLayout {
  const { nodes: originalNodes, generations: G } = tree;

  // Map personId → ahnentafel key (for button generation)
  const personToAhnen = new Map<string, number>();
  for (const [k, person] of originalNodes) {
    personToAhnen.set(person.id, k);
  }

  // Prune collapsed ancestor subtrees
  function removeSubtree(nodes: Map<number, PersonNode>, k: number): void {
    if (!nodes.has(k)) return;
    nodes.delete(k);
    removeSubtree(nodes, k * 2);
    removeSubtree(nodes, k * 2 + 1);
  }

  const prunedNodes = new Map(originalNodes);
  for (const [k, person] of originalNodes) {
    if (collapsed.has(`${person.id}:right`)) {
      removeSubtree(prunedNodes, k * 2);
      removeSubtree(prunedNodes, k * 2 + 1);
    }
  }

  const nodes = prunedNodes;
  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  const svgWidth = PAD + G * BOX_W + (G - 1) * H_GAP + PAD + 10; // button at box.right+10, r=8, stroke=1.5 → need ≥18.75 past box.right; +20 total

  const genXOf = (g: number) => PAD + g * (BOX_W + H_GAP);

  // Compact vertical layout: assign slots only to visible leaves, preserving
  // genealogical top-to-bottom order (father's family above mother's family).
  // A node's "virtual leaf position" is where its slot-centre would fall in the
  // full 2^(G-1)-leaf tree — used purely for sort-order, not for pixel positions.
  function virtualLeafPos(k: number): number {
    const g = Math.floor(Math.log2(k));
    const pos = k - (1 << g);
    return (pos + 0.5) * (1 << (G - 1 - g)) - 0.5;
  }

  const isLeafNode = (k: number) => !nodes.has(k * 2) && !nodes.has(k * 2 + 1);
  const leaves = [...nodes.keys()].filter(isLeafNode).sort((a, b) => virtualLeafPos(a) - virtualLeafPos(b));
  const leafYIndex = new Map<number, number>();
  leaves.forEach((k, i) => leafYIndex.set(k, i));

  const numLeaves = leaves.length;
  const svgHeight = PAD + numLeaves * ROW_H - (numLeaves > 1 ? V_GAP : 0) + PAD;

  // Memoised: leaves get a sequential slot; internal nodes average their children.
  const cyCache = new Map<number, number>();
  function centerYOf(k: number): number {
    if (cyCache.has(k)) return cyCache.get(k)!;
    let cy: number;
    const idx = leafYIndex.get(k);
    if (idx !== undefined) {
      cy = PAD + (idx + 0.5) * ROW_H;
    } else {
      const childYs: number[] = [];
      if (nodes.has(k * 2)) childYs.push(centerYOf(k * 2));
      if (nodes.has(k * 2 + 1)) childYs.push(centerYOf(k * 2 + 1));
      cy = childYs.length > 0
        ? childYs.reduce((a, b) => a + b, 0) / childYs.length
        : PAD + 0.5 * ROW_H;
    }
    cyCache.set(k, cy);
    return cy;
  }

  // Place boxes
  for (const [k, person] of nodes) {
    const g = Math.floor(Math.log2(k));
    boxes.push({
      person,
      isFocal: k === 1,
      x: genXOf(g),
      y: centerYOf(k) - BOX_H / 2,
      w: BOX_W,
      h: BOX_H,
    });
  }

  // Draw connector lines: for each person, connect rightward to present parents
  for (const [k] of nodes) {
    const g = Math.floor(Math.log2(k));
    if (g >= G - 1) continue; // at rightmost generation, no parents to draw

    const fatherK = k * 2;
    const motherK = k * 2 + 1;
    const father  = nodes.get(fatherK);
    const mother  = nodes.get(motherK);
    if (!father && !mother) continue;

    const cy    = centerYOf(k);
    const forkX = genXOf(g) + BOX_W + H_GAP / 2;

    lines.push({ x1: genXOf(g) + BOX_W, y1: cy, x2: forkX, y2: cy });

    const pCYs = ([father ? centerYOf(fatherK) : null, mother ? centerYOf(motherK) : null]
      .filter((y): y is number => y !== null));

    lines.push({ x1: forkX, y1: Math.min(...pCYs), x2: forkX, y2: Math.max(...pCYs) });
    for (const pcy of pCYs) {
      lines.push({ x1: forkX, y1: pcy, x2: genXOf(g + 1), y2: pcy });
    }
  }

  // Generate collapse/load-more buttons on right side of each box.
  // Ancestors expand rightward in pedigree, so direction is 'right' (▶).
  const hasMore = tree.hasMoreAncestors ?? new Set<number>();
  const collapseButtons: CollapseButton[] = [];
  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k === undefined) continue;
    const hasParents = originalNodes.has(k * 2) || originalNodes.has(k * 2 + 1);
    if (hasParents) {
      collapseButtons.push({
        personId: box.person.id,
        direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: !collapsed.has(`${box.person.id}:right`),
        isLoadMore: false,
      });
    } else if (hasMore.has(k)) {
      collapseButtons.push({
        personId: box.person.id,
        direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: false,
        isLoadMore: true,
      });
    }
  }

  // Generate placeholder ghost boxes for the selected person's missing parents only.
  // Limiting to one person prevents overlapping placeholders when multiple leaf nodes
  // are adjacent in the tree.
  const selectedK = selectedPersonId
    ? [...nodes.entries()].find(([, p]) => p.id === selectedPersonId)?.[0]
    : undefined;
  const placeholders: PlaceholderBox[] = [];
  const placeholderLines: Line[] = [];
  for (const [k] of nodes) {
    if (selectedK !== undefined && k !== selectedK) continue;
    if (selectedK === undefined) continue; // no selection → no placeholders
    const g = Math.floor(Math.log2(k));
    if (g >= G - 1) continue;
    const fatherK = k * 2;
    const motherK = k * 2 + 1;
    const hasFather = nodes.has(fatherK);
    const hasMother = nodes.has(motherK);
    if (hasFather && hasMother) continue;
    if (hasMore.has(k)) continue;

    const cy = centerYOf(k);
    const parentGenX = genXOf(g + 1);
    const halfStep = (BOX_H + V_GAP) / 2;

    if (!hasFather) {
      const phY = cy - halfStep - BOX_H / 2;
      placeholders.push({
        type: 'placeholder',
        role: 'father',
        childPersonId: nodes.get(k)!.id,
        key: fatherK,
        x: parentGenX,
        y: phY,
      });
      // Dashed connector line from child to placeholder
      const forkX = genXOf(g) + BOX_W + H_GAP / 2;
      const phCy = phY + BOX_H / 2;
      placeholderLines.push({ x1: genXOf(g) + BOX_W, y1: cy, x2: forkX, y2: cy });
      placeholderLines.push({ x1: forkX, y1: phCy, x2: forkX, y2: cy });
      placeholderLines.push({ x1: forkX, y1: phCy, x2: parentGenX, y2: phCy });
    }

    if (!hasMother) {
      const phY = cy + halfStep - BOX_H / 2;
      placeholders.push({
        type: 'placeholder',
        role: 'mother',
        childPersonId: nodes.get(k)!.id,
        key: motherK,
        x: parentGenX,
        y: phY,
      });
      const forkX = genXOf(g) + BOX_W + H_GAP / 2;
      const phCy = phY + BOX_H / 2;
      placeholderLines.push({ x1: genXOf(g) + BOX_W, y1: cy, x2: forkX, y2: cy });
      placeholderLines.push({ x1: forkX, y1: cy, x2: forkX, y2: phCy });
      placeholderLines.push({ x1: forkX, y1: phCy, x2: parentGenX, y2: phCy });
    }
  }

  // Deduplicate connector lines that overlap with existing solid lines
  const lineSet = new Set(lines.map(l => `${l.x1},${l.y1},${l.x2},${l.y2}`));
  const uniquePlaceholderLines = placeholderLines.filter(l => !lineSet.has(`${l.x1},${l.y1},${l.x2},${l.y2}`));

  // Expand SVG dimensions to include any placeholders that extend beyond box area
  let viewBoxMinY = 0;
  let finalHeight = svgHeight;
  let finalWidth = svgWidth;
  for (const ph of placeholders) {
    viewBoxMinY = Math.min(viewBoxMinY, ph.y - PAD);
    finalHeight = Math.max(finalHeight, ph.y + BOX_H + PAD);
    finalWidth = Math.max(finalWidth, ph.x + BOX_W + PAD);
  }
  // If viewBoxMinY is negative, increase height to cover the extra space above
  if (viewBoxMinY < 0) {
    finalHeight += -viewBoxMinY;
  }

  return { boxes, lines, svgWidth: finalWidth, svgHeight: finalHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines: uniquePlaceholderLines };
}
