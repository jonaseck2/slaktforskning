// Standalone descendant chart layout algorithm — operates on TreePerson graph.
// Focal at top, descendants fan out downward. Supports outline injection.

import type { DescendantNode, TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD } from './constants';
import { buildDescendantTreePerson, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

/**
 * Lay out a top-down descendant chart starting from a focal person at the top.
 * Children fan out downward, centered below their parent.
 */
export function computeDescendantLayout(
  root: DescendantNode,
  maxGenerations: number,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {
  // ── 1. Build TreePerson graph ───────────────────────────────────────────────
  const tp = buildDescendantTreePerson(root);
  if (selectedPersonId) injectOutlines(tp, selectedPersonId);

  // ── 1b. Reserve extra subtree width for outline placeholders ────────────────
  // Like pedigree's leaf slot reservation: widen the selected person's extent
  // (for spouse outline) and their tree parent's extent (for parent outlines)
  // so the main layout pushes siblings apart to create room.
  const extraRightExtent = new Map<string, number>();
  const extraLeftExtent = new Map<string, number>();
  if (selectedPersonId) {
    const target = findPersonInTree(tp, selectedPersonId);
    if (target) {
      const spouseCount = target.spouses.filter(s => s.isPlaceholder).length;
      if (spouseCount > 0) {
        const extra = spouseCount * (BOX_W + V_GAP);
        // Female → spouse goes left; male/unknown → spouse goes right
        if (target.person.sex === 'F') {
          extraLeftExtent.set(selectedPersonId, extra);
        } else {
          extraRightExtent.set(selectedPersonId, extra);
        }
      }
      const parentCount = target.parents.filter(p => p.isPlaceholder).length;
      if (parentCount > 0) {
        const treeParent = findParentOf(tp, selectedPersonId);
        if (treeParent) {
          extraRightExtent.set(treeParent.person.id, parentCount * (BOX_W + V_GAP));
        }
      }
    }
  }

  // ── 2. Collapse filtering ──────────────────────────────────────────────────
  const originalChildCount = new Map<string, number>();
  const hasMoreDown = new Map<string, boolean>();

  function recordAndPrune(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    originalChildCount.set(node.person.id, node.children.length);
    hasMoreDown.set(node.person.id, !!node.hasMoreChildren);

    if (collapsed.has(`${node.person.id}:down`)) {
      node.children = node.children.filter(c => c.isPlaceholder);
    }

    for (const c of node.children) recordAndPrune(c, visited);
  }
  recordAndPrune(tp);

  // ── 3. Layout ──────────────────────────────────────────────────────────────
  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];
  const collapseButtons: CollapseButton[] = [];

  const rowY = (depth: number) => PAD + depth * (BOX_H + GEN_GAP);

  // Compute subtree extents (left, right from center X)
  function subtreeExtents(node: TreePerson, depth: number): [number, number] {
    const half = BOX_W / 2;
    const extraR = extraRightExtent.get(node.person.id) ?? 0;
    const extraL = extraLeftExtent.get(node.person.id) ?? 0;
    if (depth >= maxGenerations || node.children.length === 0) return [half + extraL, half + extraR];
    if (collapsed.has(`${node.person.id}:down`)) return [half + extraL, half + extraR];

    const n = node.children.length;
    const childExts = node.children.map(c => subtreeExtents(c, depth + 1));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftExt = Math.max(half, totalSpan / 2 + childExts[0][0]) + extraL;
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]) + extraR;
    return [leftExt, rightExt];
  }

  // Recursively place boxes and connector lines
  function place(node: TreePerson, depth: number, cx: number): void {
    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: cx - BOX_W / 2,
      y: rowY(depth),
      w: BOX_W, h: BOX_H,
    });

    const pid = node.person.id;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(`${pid}:down`);

    // Collapse/expand button
    if (!pid.startsWith(PLACEHOLDER_PREFIX)) {
      const origChildren = originalChildCount.get(pid) ?? 0;
      const moreDown = hasMoreDown.get(pid) ?? false;

      if (origChildren > 0) {
        collapseButtons.push({
          personId: pid, direction: 'down',
          cx, cy: rowY(depth) + BOX_H + 10,
          isExpanded: !isCollapsed, isLoadMore: false,
        });
      } else if (moreDown) {
        collapseButtons.push({
          personId: pid, direction: 'down',
          cx, cy: rowY(depth) + BOX_H + 10,
          isExpanded: false, isLoadMore: true,
        });
      }
    }

    // Place children if not collapsed and within depth limit
    if (depth < maxGenerations && hasChildren && !isCollapsed) {
      const forkY = rowY(depth) + BOX_H + GEN_GAP / 2;
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

      if (n > 1) {
        lines.push({ x1: childCXs[0], y1: forkY, x2: childCXs[n - 1], y2: forkY });
      }
      for (let ci = 0; ci < n; ci++) {
        lines.push({ x1: childCXs[ci], y1: forkY, x2: childCXs[ci], y2: rowY(depth + 1) });
        place(node.children[ci], depth + 1, childCXs[ci]);
      }
    }
  }

  // Compute root extents to determine canvas center
  const [leftExt, rightExt] = subtreeExtents(tp, 0);
  const rootCX = PAD + leftExt;
  place(tp, 0, rootCX);

  // ── Place unplaced outlines for selected person ──
  if (selectedPersonId) {
    const selBox = boxes.find(b => b.person.id === selectedPersonId);
    const placedIds = new Set(boxes.map(b => b.person.id));

    if (selBox) {
      const selNode = findPersonInTree(tp, selectedPersonId);
      if (selNode) {
        const selCX = selBox.x + BOX_W / 2;
        const selIsFemale = selNode.person.sex === 'F';

        // Helper: find first X that doesn't overlap any existing box (full rectangle check)
        function findClearXRect(startX: number, y: number, direction: 1 | -1): number {
          let x = startX;
          const overlaps = () => boxes.some(b =>
            x < b.x + b.w + V_GAP && x + BOX_W + V_GAP > b.x &&
            y < b.y + b.h && y + BOX_H > b.y
          );
          while (overlaps()) {
            x += direction * (BOX_W + V_GAP);
          }
          return x;
        }

        // Spouse outlines — placed right next to the selected person
        const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
        if (unplacedSpouses.length > 0) {
          for (let i = 0; i < unplacedSpouses.length; i++) {
            let spX: number;
            if (selIsFemale) {
              spX = selBox.x - BOX_W - V_GAP - i * (BOX_W + V_GAP);
              spX = findClearXRect(spX, selBox.y, -1);
            } else {
              spX = selBox.x + BOX_W + V_GAP + i * (BOX_W + V_GAP);
              spX = findClearXRect(spX, selBox.y, 1);
            }
            const spCX = spX + BOX_W / 2;
            boxes.push({
              person: unplacedSpouses[i].person,
              isFocal: false,
              x: spX, y: selBox.y,
              w: BOX_W, h: BOX_H,
            });
            const lineY = selBox.y + BOX_H / 2;
            lines.push({
              x1: selIsFemale ? spCX + BOX_W / 2 : selCX + BOX_W / 2,
              y1: lineY,
              x2: selIsFemale ? selCX - BOX_W / 2 : spCX - BOX_W / 2,
              y2: lineY,
            });
          }
        }

        // Parent outlines — placed as a group above the selected person, with gap-finding
        const unplacedParents = selNode.parents.filter(p => !placedIds.has(p.person.id));
        if (unplacedParents.length > 0) {
          const parentY = selBox.y - BOX_H - GEN_GAP;
          const forkY = selBox.y - GEN_GAP / 2;
          lines.push({ x1: selCX, y1: selBox.y, x2: selCX, y2: forkY });

          const n = unplacedParents.length;
          const groupW = n * BOX_W + (n - 1) * V_GAP;
          const idealGroupX = selCX - groupW / 2;

          function groupOverlaps(gx: number): boolean {
            for (let i = 0; i < n; i++) {
              const bx = gx + i * (BOX_W + V_GAP);
              if (boxes.some(b =>
                bx < b.x + b.w + V_GAP && bx + BOX_W + V_GAP > b.x &&
                parentY < b.y + b.h && parentY + BOX_H > b.y
              )) return true;
            }
            return false;
          }

          let groupX = idealGroupX;
          if (groupOverlaps(groupX)) {
            const rowBoxes = boxes
              .filter(b => parentY < b.y + b.h && parentY + BOX_H > b.y)
              .sort((a, b) => a.x - b.x);
            const candidates: number[] = [idealGroupX];
            if (rowBoxes.length > 0) {
              for (const b of rowBoxes) candidates.push(b.x + b.w + V_GAP);
              for (const b of rowBoxes) candidates.push(b.x - groupW - V_GAP);
            }
            let bestX: number | null = null;
            let bestDist = Infinity;
            for (const cx of candidates) {
              if (!groupOverlaps(cx)) {
                const dist = Math.abs((cx + groupW / 2) - selCX);
                if (dist < bestDist) { bestDist = dist; bestX = cx; }
              }
            }
            if (bestX !== null) groupX = bestX;
          }

          const parentXs: number[] = [];
          for (let i = 0; i < n; i++) {
            const px = groupX + i * (BOX_W + V_GAP);
            parentXs.push(px);
            boxes.push({
              person: unplacedParents[i].person,
              isFocal: false,
              x: px, y: parentY,
              w: BOX_W, h: BOX_H,
            });
            const parentCX = px + BOX_W / 2;
            lines.push({ x1: parentCX, y1: forkY, x2: parentCX, y2: parentY + BOX_H });
          }
          if (n > 1) {
            const firstCX = parentXs[0] + BOX_W / 2;
            const lastCX = parentXs[n - 1] + BOX_W / 2;
            lines.push({ x1: firstCX, y1: forkY, x2: lastCX, y2: forkY });
          }
        }
      }
    }
  }

  // ── SVG dimensions ─────────────────────────────────────────────────────────
  const maxBoxRight = boxes.length > 0 ? Math.max(...boxes.map(b => b.x + b.w)) : BOX_W;
  const maxBoxBottom = boxes.length > 0 ? Math.max(...boxes.map(b => b.y + b.h)) : BOX_H;
  const minBoxTop = boxes.length > 0 ? Math.min(...boxes.map(b => b.y)) : 0;
  const minBoxLeft = boxes.length > 0 ? Math.min(...boxes.map(b => b.x)) : 0;

  const svgWidth = Math.max(rootCX + rightExt + PAD, maxBoxRight + PAD);
  const viewBoxMinY = Math.min(0, minBoxTop - PAD);
  let maxDepth = 0;
  for (const box of boxes) {
    const depth = Math.round((box.y - PAD) / (BOX_H + GEN_GAP));
    if (depth > maxDepth) maxDepth = depth;
  }
  const svgHeight = Math.max(rowY(maxDepth) + BOX_H + 20 + PAD, maxBoxBottom + 20 + PAD)
    + (viewBoxMinY < 0 ? -viewBoxMinY : 0);

  // ── Extract placeholders ───────────────────────────────────────────────────
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
    phCenters.add(`${ph.x + BOX_W / 2},${ph.y}`);
    phCenters.add(`${ph.x + BOX_W / 2},${ph.y + BOX_H}`);
    phCenters.add(`${ph.x + BOX_W / 2},${ph.y + BOX_H / 2}`);
    phCenters.add(`${ph.x},${ph.y + BOX_H / 2}`);
    phCenters.add(`${ph.x + BOX_W},${ph.y + BOX_H / 2}`);
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    if (phCenters.has(`${ln.x1},${ln.y1}`) || phCenters.has(`${ln.x2},${ln.y2}`)) {
      placeholderLines.push(ln);
      lines.splice(i, 1);
    }
  }

  return { boxes, lines, svgWidth, svgHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines };
}

/** Find the tree-parent of a person (the node whose children array contains it). */
function findParentOf(root: TreePerson, childId: string, visited = new Set<string>()): TreePerson | null {
  if (visited.has(root.person.id)) return null;
  visited.add(root.person.id);
  for (const c of root.children) {
    if (c.person.id === childId) return root;
    const found = findParentOf(c, childId, visited);
    if (found) return found;
  }
  return null;
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
