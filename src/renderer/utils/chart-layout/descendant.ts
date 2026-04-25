// Standalone descendant chart layout algorithm — operates on TreePerson graph.
// Focal at top, descendants fan out downward. Supports outline injection.

import type { DescendantNode, TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, MIN_BOX_H, V_GAP, GEN_GAP, PAD } from './constants';
import { measureBoxHeight } from './measure';
import { curvedElbow } from './connectors';
import { buildDescendantTreePerson, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

export function computeDescendantLayout(
  root: DescendantNode,
  maxGenerations: number,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {
  const tp = buildDescendantTreePerson(root);

  // ── Pre-measure heights ──────────────────────────────────────────────────
  const heightOf = new Map<string, number>();
  function measureAll(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    heightOf.set(node.person.id, node.isPlaceholder ? MIN_BOX_H : measureBoxHeight(node.person));
    for (const c of node.children) measureAll(c, visited);
    for (const p of node.parents) measureAll(p, visited);
    for (const s of node.spouses) measureAll(s, visited);
  }
  measureAll(tp);
  const hOf = (node: TreePerson): number => heightOf.get(node.person.id) ?? MIN_BOX_H;

  // ── Collapse filtering ───────────────────────────────────────────────────
  const originalChildCount = new Map<string, number>();
  const hasMoreDown = new Map<string, boolean>();
  function recordAndPrune(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    originalChildCount.set(node.person.id, node.children.filter(c => !c.isPlaceholder).length);
    hasMoreDown.set(node.person.id, !!node.hasMoreChildren);
    if (collapsed.has(`${node.person.id}:down`)) {
      node.children = node.children.filter(c => c.isPlaceholder);
    }
    for (const c of node.children) recordAndPrune(c, visited);
  }
  recordAndPrune(tp);

  // Inject outlines after collapse so collapsed nodes correctly receive
  // placeholder boxes (their children=[] after pruning, injection sees it).
  if (selectedPersonId) injectOutlines(tp, selectedPersonId);

  // ── Outline extents (depends on injected placeholders) ───────────────────
  const extraRightExtent = new Map<string, number>();
  const extraLeftExtent = new Map<string, number>();
  if (selectedPersonId) {
    const target = findPersonInTree(tp, selectedPersonId);
    if (target) {
      const spouseCount = target.spouses.filter(s => s.isPlaceholder).length;
      if (spouseCount > 0) {
        const extra = spouseCount * (BOX_W + V_GAP);
        if (target.person.sex === 'F') extraLeftExtent.set(selectedPersonId, extra);
        else extraRightExtent.set(selectedPersonId, extra);
      }
      const parentCount = target.parents.filter(p => p.isPlaceholder).length;
      if (parentCount > 0) {
        const treeParent = findParentOf(tp, selectedPersonId);
        if (treeParent) extraRightExtent.set(treeParent.person.id, parentCount * (BOX_W + V_GAP));
      }
    }
  }

  // ── Compute per-row max height via a depth-traversal pre-pass ────────────
  const rowMaxH: number[] = [];
  function recordDepths(node: TreePerson, depth: number, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    if (depth > maxGenerations) return;
    const h = hOf(node);
    rowMaxH[depth] = Math.max(rowMaxH[depth] ?? MIN_BOX_H, h);
    if (collapsed.has(`${node.person.id}:down`)) return;
    for (const c of node.children) recordDepths(c, depth + 1, visited);
  }
  recordDepths(tp, 0);
  for (let i = 0; i <= maxGenerations; i++) if (rowMaxH[i] == null) rowMaxH[i] = MIN_BOX_H;

  const rowTopY: number[] = [PAD];
  for (let d = 1; d <= maxGenerations; d++) {
    rowTopY[d] = rowTopY[d - 1] + rowMaxH[d - 1] + GEN_GAP;
  }

  const boxes: BoxLayout[] = [];
  const paths: string[] = [];
  const placeholderPaths: string[] = [];
  const collapseButtons: CollapseButton[] = [];
  const depthOf = new Map<string, number>();

  // Placeholder children are excluded from spacing — they're placed by the post-layout pass.
  function subtreeExtents(node: TreePerson, depth: number): [number, number] {
    const half = BOX_W / 2;
    const extraR = extraRightExtent.get(node.person.id) ?? 0;
    const extraL = extraLeftExtent.get(node.person.id) ?? 0;
    const realChildren = node.children.filter(c => !c.isPlaceholder);
    if (depth >= maxGenerations || realChildren.length === 0) return [half + extraL, half + extraR];
    if (collapsed.has(`${node.person.id}:down`)) return [half + extraL, half + extraR];
    const n = realChildren.length;
    const childExts = realChildren.map(c => subtreeExtents(c, depth + 1));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftExt = Math.max(half, totalSpan / 2 + childExts[0][0]) + extraL;
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]) + extraR;
    return [leftExt, rightExt];
  }

  function place(node: TreePerson, depth: number, cx: number): void {
    const h = hOf(node);
    const y = rowTopY[depth];
    depthOf.set(node.person.id, depth);
    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: cx - BOX_W / 2,
      y,
      w: BOX_W, h,
    });

    const pid = node.person.id;
    const realChildren = node.children.filter(c => !c.isPlaceholder);
    const hasChildren = realChildren.length > 0;
    const isCollapsed = collapsed.has(`${pid}:down`);

    if (!pid.startsWith(PLACEHOLDER_PREFIX)) {
      const origChildren = originalChildCount.get(pid) ?? 0;
      const moreDown = hasMoreDown.get(pid) ?? false;
      if (origChildren > 0) {
        collapseButtons.push({
          personId: pid, direction: 'down',
          cx, cy: y + h + 10,
          isExpanded: !isCollapsed, isLoadMore: false,
        });
      } else if (moreDown) {
        collapseButtons.push({
          personId: pid, direction: 'down',
          cx, cy: y + h + 10,
          isExpanded: false, isLoadMore: true,
        });
      }
    }

    if (depth < maxGenerations && hasChildren && !isCollapsed) {
      const n = realChildren.length;
      const childExts = realChildren.map(c => subtreeExtents(c, depth + 1));
      const offsets: number[] = [0];
      for (let i = 1; i < n; i++) {
        offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
      }
      const totalSpan = offsets[n - 1];
      const leftmostCX = cx - totalSpan / 2;
      const childCXs = offsets.map(o => leftmostCX + o);

      // One curved path per child
      for (let ci = 0; ci < n; ci++) {
        paths.push(curvedElbow(cx, y + h, childCXs[ci], rowTopY[depth + 1], 'down'));
        place(realChildren[ci], depth + 1, childCXs[ci]);
      }
    }
  }

  const [leftExt, rightExt] = subtreeExtents(tp, 0);
  const rootCX = PAD + leftExt;
  place(tp, 0, rootCX);

  // ── Unplaced outlines for selected person ────────────────────────────────
  if (selectedPersonId) {
    const selBox = boxes.find(b => b.person.id === selectedPersonId);
    const placedIds = new Set(boxes.map(b => b.person.id));
    if (selBox) {
      const selNode = findPersonInTree(tp, selectedPersonId);
      if (selNode) {
        const selCX = selBox.x + BOX_W / 2;
        const selCY = selBox.y + selBox.h / 2;
        const selIsFemale = selNode.person.sex === 'F';

        function findClearXRect(startX: number, y: number, direction: 1 | -1, boxH: number): number {
          let x = startX;
          const overlaps = () => boxes.some(b =>
            x < b.x + b.w + V_GAP && x + BOX_W + V_GAP > b.x &&
            y < b.y + b.h && y + boxH > b.y
          );
          while (overlaps()) x += direction * (BOX_W + V_GAP);
          return x;
        }

        const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
        for (let i = 0; i < unplacedSpouses.length; i++) {
          const sp = unplacedSpouses[i];
          const sh = hOf(sp);
          const spY = selCY - sh / 2;
          let spX = selIsFemale
            ? selBox.x - BOX_W - V_GAP - i * (BOX_W + V_GAP)
            : selBox.x + BOX_W + V_GAP + i * (BOX_W + V_GAP);
          spX = findClearXRect(spX, spY, selIsFemale ? -1 : 1, sh);
          boxes.push({ person: sp.person, isFocal: false, x: spX, y: spY, w: BOX_W, h: sh });
          // Horizontal curve selected ↔ spouse (dashed) — both at selCY
          const fromX = selIsFemale ? spX + BOX_W : selBox.x + BOX_W;
          const toX = selIsFemale ? selBox.x : spX;
          placeholderPaths.push(curvedElbow(fromX, selCY, toX, selCY, 'right'));
        }

        const unplacedParents = selNode.parents.filter(p => !placedIds.has(p.person.id));
        if (unplacedParents.length > 0) {
          const parentRowMax = Math.max(...unplacedParents.map(p => hOf(p)), MIN_BOX_H);
          // When the selected box is taller than the parent outlines, offset the
          // parent row up so it sits above the selected's notional normal-height
          // top rather than its actual top.
          const heightOffset = Math.max(0, (selBox.h - parentRowMax) / 2);
          const parentY = selBox.y - parentRowMax - GEN_GAP - heightOffset;

          const n = unplacedParents.length;
          const groupW = n * BOX_W + (n - 1) * V_GAP;
          const idealGroupX = selCX - groupW / 2;

          function groupOverlaps(gx: number): boolean {
            for (let i = 0; i < n; i++) {
              const bx = gx + i * (BOX_W + V_GAP);
              if (boxes.some(b =>
                bx < b.x + b.w + V_GAP && bx + BOX_W + V_GAP > b.x &&
                parentY < b.y + b.h && parentY + parentRowMax > b.y
              )) return true;
            }
            return false;
          }

          let groupX = idealGroupX;
          if (groupOverlaps(groupX)) {
            const rowBoxes = boxes
              .filter(b => parentY < b.y + b.h && parentY + parentRowMax > b.y)
              .sort((a, b) => a.x - b.x);
            const candidates: number[] = [idealGroupX];
            for (const b of rowBoxes) {
              candidates.push(b.x + b.w + V_GAP);
              candidates.push(b.x - groupW - V_GAP);
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

          for (let i = 0; i < n; i++) {
            const px = groupX + i * (BOX_W + V_GAP);
            const ph = hOf(unplacedParents[i]);
            boxes.push({ person: unplacedParents[i].person, isFocal: false, x: px, y: parentY, w: BOX_W, h: ph });
            const parentCX = px + BOX_W / 2;
            placeholderPaths.push(curvedElbow(parentCX, parentY + ph, selCX, selBox.y, 'down'));
          }
        }

        const unplacedChildren = selNode.children.filter(c => c.isPlaceholder && !placedIds.has(c.person.id));
        if (unplacedChildren.length > 0) {
          const selDepth = depthOf.get(selectedPersonId) ?? 0;
          const chRowY = selDepth < maxGenerations
            ? rowTopY[selDepth + 1]
            : selBox.y + selBox.h + GEN_GAP;
          for (const ch of unplacedChildren) {
            const chH = hOf(ch);
            const chX = findClearXRect(selCX - BOX_W / 2, chRowY, 1, chH);
            boxes.push({ person: ch.person, isFocal: false, x: chX, y: chRowY, w: BOX_W, h: chH });
            placeholderPaths.push(curvedElbow(selCX, selBox.y + selBox.h, chX + BOX_W / 2, chRowY, 'down'));
          }
        }
      }
    }
  }

  // ── SVG dimensions ───────────────────────────────────────────────────────
  const maxBoxRight = boxes.length > 0 ? Math.max(...boxes.map(b => b.x + b.w)) : BOX_W;
  const maxBoxBottom = boxes.length > 0 ? Math.max(...boxes.map(b => b.y + b.h)) : MIN_BOX_H;
  const minBoxTop = boxes.length > 0 ? Math.min(...boxes.map(b => b.y)) : 0;

  const svgWidth = Math.max(rootCX + rightExt + PAD, maxBoxRight + PAD);
  const viewBoxMinY = Math.min(0, minBoxTop - PAD);
  const svgHeight = (maxBoxBottom + 20 + PAD) + (viewBoxMinY < 0 ? -viewBoxMinY : 0);

  // ── Extract placeholders ─────────────────────────────────────────────────
  const placeholders: PlaceholderBox[] = [];
  const placeholderLines: Line[] = [];

  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (!box.person.id.startsWith(PLACEHOLDER_PREFIX)) continue;
    const pid = box.person.id;
    let role: 'father' | 'mother' | 'child' | 'spouse';
    let childPersonId: string;
    if (pid.startsWith(PLACEHOLDER_PREFIX + 'father_')) {
      role = 'father'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'father_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'mother_')) {
      role = 'mother'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'mother_').length);
    } else if (pid.startsWith(PLACEHOLDER_PREFIX + 'spouse_')) {
      role = 'spouse'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'spouse_').length);
    } else {
      role = 'child'; childPersonId = pid.slice((PLACEHOLDER_PREFIX + 'child_').length);
    }
    placeholders.push({ type: 'placeholder', role, childPersonId, x: box.x, y: box.y });
    boxes.splice(i, 1);
  }

  for (const d of placeholderPaths) paths.push('D:' + d);

  return { boxes, lines: [], paths, svgWidth, svgHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines };
}

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

function findPersonInTree(node: TreePerson, id: string, visited = new Set<string>()): TreePerson | null {
  if (node.person.id === id) return node;
  if (visited.has(node.person.id)) return null;
  visited.add(node.person.id);
  for (const p of node.parents) { const f = findPersonInTree(p, id, visited); if (f) return f; }
  for (const c of node.children) { const f = findPersonInTree(c, id, visited); if (f) return f; }
  for (const s of node.spouses) { const f = findPersonInTree(s, id, visited); if (f) return f; }
  return null;
}
