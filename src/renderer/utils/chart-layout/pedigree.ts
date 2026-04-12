// Pedigree chart layout algorithm — operates on TreePerson graph.
// Focal at left, ancestors expand rightward. Supports N parents per node.

import type { PedigreeTree, TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, BOX_H, V_GAP, H_GAP, PAD, ROW_H } from './constants';
import { buildPedigreeTreePerson, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

/**
 * Lay out a pedigree chart (focal at left, ancestors going right).
 * Uses TreePerson graph — supports N parents per person.
 */
export function computePedigreeLayout(
  tree: PedigreeTree,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {
  // ── 1. Build TreePerson graph ───────────────────────────────────────────────
  const root = buildPedigreeTreePerson(tree);
  if (selectedPersonId) injectOutlines(root, selectedPersonId);

  // ── 2. Collapse filtering ──────────────────────────────────────────────────
  const originalParentCount = new Map<string, number>();
  const hasMoreUp = new Map<string, boolean>();

  function recordAndPrune(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    originalParentCount.set(node.person.id, node.parents.length);
    hasMoreUp.set(node.person.id, !!node.hasMoreAncestors);

    // Prune collapsed parents (never prune placeholders)
    if (collapsed.has(`${node.person.id}:right`)) {
      node.parents = node.parents.filter(p => p.isPlaceholder);
    }

    for (const p of node.parents) recordAndPrune(p, visited);
  }
  recordAndPrune(root);

  // ── 3. Compute geometry ────────────────────────────────────────────────────

  // Max ancestor depth from focal
  function maxDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    if (node.parents.length === 0) return 0;
    return 1 + Math.max(...node.parents.map(p => maxDepth(p, visited)));
  }

  const G = maxDepth(root) + 1; // generations including focal
  const genXOf = (g: number) => PAD + g * (BOX_W + H_GAP);

  // Compact vertical layout: assign sequential slots to visible leaf nodes,
  // then internal nodes center vertically over their parents.
  const leafSlots = new Map<string, number>();
  let slotIndex = 0;

  function assignLeafSlots(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    if (node.parents.length === 0) {
      leafSlots.set(node.person.id, slotIndex++);
      // If this leaf is the selected person, reserve slots for spouse outlines
      // so the layout naturally creates vertical space below them.
      if (selectedPersonId && node.person.id === selectedPersonId) {
        for (const sp of node.spouses) {
          if (sp.isPlaceholder) {
            leafSlots.set(sp.person.id, slotIndex++);
          }
        }
      }
      return;
    }
    // For internal nodes: also reserve spouse outline slots after their subtree
    for (const p of node.parents) assignLeafSlots(p, visited);
    if (selectedPersonId && node.person.id === selectedPersonId) {
      for (const sp of node.spouses) {
        if (sp.isPlaceholder) {
          leafSlots.set(sp.person.id, slotIndex++);
        }
      }
    }
  }
  assignLeafSlots(root);

  const numLeaves = slotIndex;

  // Memoised center Y: leaves get sequential slots, internal nodes average their parents.
  const cyCache = new Map<string, number>();
  function centerYOf(node: TreePerson): number {
    if (cyCache.has(node.person.id)) return cyCache.get(node.person.id)!;
    let cy: number;
    const slot = leafSlots.get(node.person.id);
    if (slot !== undefined) {
      cy = PAD + (slot + 0.5) * ROW_H;
    } else {
      const parentCYs = node.parents.map(p => centerYOf(p));
      cy = parentCYs.length > 0
        ? parentCYs.reduce((a, b) => a + b, 0) / parentCYs.length
        : PAD + 0.5 * ROW_H;
    }
    cyCache.set(node.person.id, cy);
    return cy;
  }

  // Compute depth (generation) of each node
  function nodeDepth(node: TreePerson, depth: number, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    depthMap.set(node.person.id, depth);
    for (const p of node.parents) nodeDepth(p, depth + 1, visited);
  }
  const depthMap = new Map<string, number>();
  nodeDepth(root, 0);

  // ── 4. Place boxes and lines ───────────────────────────────────────────────
  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  function placeNodes(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    const g = depthMap.get(node.person.id) ?? 0;
    const cy = centerYOf(node);

    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: genXOf(g),
      y: cy - BOX_H / 2,
      w: BOX_W, h: BOX_H,
    });

    if (node.parents.length > 0) {
      const forkX = genXOf(g) + BOX_W + H_GAP / 2;
      lines.push({ x1: genXOf(g) + BOX_W, y1: cy, x2: forkX, y2: cy });

      const parentCYs = node.parents.map(p => centerYOf(p));
      // Vertical fork spanning all parents
      if (parentCYs.length > 0) {
        lines.push({ x1: forkX, y1: Math.min(...parentCYs), x2: forkX, y2: Math.max(...parentCYs) });
      }
      // Horizontal lines to each parent
      const parentGenX = genXOf(g + 1);
      for (const pcy of parentCYs) {
        lines.push({ x1: forkX, y1: pcy, x2: parentGenX, y2: pcy });
      }
    }

    for (const p of node.parents) placeNodes(p, visited);
  }
  placeNodes(root);

  // ── Place unplaced outlines for selected person ──
  if (selectedPersonId) {
    const selBox = boxes.find(b => b.person.id === selectedPersonId);
    const placedIds = new Set(boxes.map(b => b.person.id));

    if (selBox) {
      const selNode = findPersonInTree(root, selectedPersonId);
      if (selNode) {
        const selCY = selBox.y + BOX_H / 2;

        // Helper: find first Y that doesn't overlap any existing box at exact X
        function findClearYSameCol(x: number, startY: number, direction: 1 | -1): number {
          let y = startY;
          const overlaps = () => boxes.some(b =>
            b.x === x && y < b.y + b.h + V_GAP && y + BOX_H + V_GAP > b.y
          );
          while (overlaps()) {
            y += direction * (BOX_H + V_GAP);
          }
          return y;
        }

        // Helper: find first Y using full rectangle intersection (cross-column)
        function findClearYRect(x: number, startY: number, direction: 1 | -1): number {
          let y = startY;
          const overlaps = () => boxes.some(b =>
            x < b.x + b.w && x + BOX_W > b.x &&
            y < b.y + b.h + V_GAP && y + BOX_H + V_GAP > b.y
          );
          while (overlaps()) {
            y += direction * (BOX_H + V_GAP);
          }
          return y;
        }

        // Unplaced spouse outlines — place directly below selected person (V_GAP spacing).
        // Leaf slot was reserved during assignLeafSlots to push other boxes down,
        // but we place at selBox.y + BOX_H + V_GAP for tight couple-like spacing.
        const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
        if (unplacedSpouses.length > 0) {
          const selDepth = depthMap.get(selectedPersonId) ?? 0;
          for (let i = 0; i < unplacedSpouses.length; i++) {
            const spY = selBox.y + BOX_H + V_GAP + i * (BOX_H + V_GAP);
            boxes.push({
              person: unplacedSpouses[i].person,
              isFocal: false,
              x: genXOf(selDepth), y: spY,
              w: BOX_W, h: BOX_H,
            });
            // Vertical connector from bottom of selected person to top of spouse
            lines.push({ x1: selBox.x + BOX_W / 2, y1: selBox.y + BOX_H, x2: selBox.x + BOX_W / 2, y2: spY });
          }
        }

        // Unplaced child outlines — place to the left, cross-column overlap check
        const unplacedChildren = selNode.children.filter(c => !placedIds.has(c.person.id));
        if (unplacedChildren.length > 0) {
          const childX = selBox.x - BOX_W - H_GAP;
          let nextY = findClearYRect(childX, selBox.y, 1);
          for (let i = 0; i < unplacedChildren.length; i++) {
            const childY = nextY;
            const childCY = childY + BOX_H / 2;
            boxes.push({
              person: unplacedChildren[i].person,
              isFocal: false,
              x: childX, y: childY,
              w: BOX_W, h: BOX_H,
            });
            const forkX = selBox.x - H_GAP / 2;
            lines.push({ x1: selBox.x, y1: selCY, x2: forkX, y2: selCY });
            lines.push({ x1: forkX, y1: childCY, x2: childX + BOX_W, y2: childCY });
            lines.push({ x1: forkX, y1: selCY, x2: forkX, y2: childCY });
            nextY = childY + BOX_H + V_GAP;
          }
        }
      }
    }
  }

  // ── 5. Compute SVG dimensions ──────────────────────────────────────────────
  const maxBoxRight = boxes.length > 0 ? Math.max(...boxes.map(b => b.x + b.w)) : BOX_W;
  const maxBoxBottom = boxes.length > 0 ? Math.max(...boxes.map(b => b.y + b.h)) : BOX_H;
  const minBoxTop = boxes.length > 0 ? Math.min(...boxes.map(b => b.y)) : 0;
  const minBoxLeft = boxes.length > 0 ? Math.min(...boxes.map(b => b.x)) : 0;

  const svgWidth = Math.max(PAD + G * BOX_W + (G - 1) * H_GAP + PAD + 20, maxBoxRight + PAD);
  const svgHeight = Math.max(PAD + numLeaves * ROW_H - (numLeaves > 1 ? V_GAP : 0) + PAD, maxBoxBottom + PAD);
  const viewBoxMinY = Math.min(0, minBoxTop - PAD);
  const viewBoxMinX = Math.min(0, minBoxLeft - PAD);

  // Adjust height if viewBoxMinY is negative
  const finalHeight = viewBoxMinY < 0 ? svgHeight + (-viewBoxMinY) : svgHeight;

  // ── 6. Collapse buttons ────────────────────────────────────────────────────
  const collapseButtons: CollapseButton[] = [];
  for (const box of boxes) {
    const pid = box.person.id;
    if (pid.startsWith(PLACEHOLDER_PREFIX)) continue;

    const origParents = originalParentCount.get(pid) ?? 0;
    const moreUp = hasMoreUp.get(pid) ?? false;

    if (origParents > 0) {
      collapseButtons.push({
        personId: pid, direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: !collapsed.has(`${pid}:right`),
        isLoadMore: false,
      });
    } else if (moreUp) {
      collapseButtons.push({
        personId: pid, direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: false, isLoadMore: true,
      });
    }
  }

  // ── 7. Extract placeholders ────────────────────────────────────────────────
  const placeholders: PlaceholderBox[] = [];
  const placeholderLines: Line[] = [];

  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (!box.person.id.startsWith(PLACEHOLDER_PREFIX)) continue;
    const pid = box.person.id;
    let role: 'father' | 'mother' | 'child' | 'spouse';
    let childPersonId: string;
    if (pid.startsWith(PLACEHOLDER_PREFIX + 'father_')) {
      role = 'father';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'father_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'mother_')) {
      role = 'mother';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'mother_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'spouse_')) {
      role = 'spouse';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'spouse_').length);
    } else {
      role = 'child';
      childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'child_').length);
    }
    placeholders.push({ type: 'placeholder', role, childPersonId, x: box.x, y: box.y });
    boxes.splice(i, 1);
  }

  // Convert lines touching placeholders to dashed
  const phCenters = new Set<string>();
  for (const ph of placeholders) {
    phCenters.add(`${ph.x + BOX_W / 2},${ph.y + BOX_H / 2}`);
    phCenters.add(`${ph.x + BOX_W},${ph.y + BOX_H / 2}`);
    phCenters.add(`${ph.x},${ph.y + BOX_H / 2}`);
    // Also check top/bottom center for vertical lines
    phCenters.add(`${ph.x + BOX_W / 2},${ph.y}`);
    phCenters.add(`${ph.x + BOX_W / 2},${ph.y + BOX_H}`);
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    if (phCenters.has(`${ln.x1},${ln.y1}`) || phCenters.has(`${ln.x2},${ln.y2}`)) {
      placeholderLines.push(ln);
      lines.splice(i, 1);
    }
  }

  // Deduplicate placeholder lines that overlap with solid lines
  const lineSet = new Set(lines.map(l => `${l.x1},${l.y1},${l.x2},${l.y2}`));
  const uniquePlaceholderLines = placeholderLines.filter(l => !lineSet.has(`${l.x1},${l.y1},${l.x2},${l.y2}`));

  return { boxes, lines, svgWidth, svgHeight: finalHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines: uniquePlaceholderLines };
}

/** Find a TreePerson by ID in the graph (cycle-safe). */
function findPersonInTree(node: TreePerson, id: string, visited = new Set<string>()): TreePerson | null {
  if (node.person.id === id) return node;
  if (visited.has(node.person.id)) return null;
  visited.add(node.person.id);
  for (const p of node.parents) { const f = findPersonInTree(p, id, visited); if (f) return f; }
  for (const c of node.children) { const f = findPersonInTree(c, id, visited); if (f) return f; }
  for (const s of node.spouses) { const f = findPersonInTree(s, id, visited); if (f) return f; }
  return null;
}
