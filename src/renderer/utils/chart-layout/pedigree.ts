// Pedigree chart layout algorithm — operates on TreePerson graph.
// Focal at left, ancestors expand rightward. Supports N parents per node.

import type { PedigreeTree, TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, MIN_BOX_H, V_GAP, H_GAP, PAD } from './constants';
import { measureBoxHeight } from './measure';
import { curvedElbow } from './connectors';
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
  const root = buildPedigreeTreePerson(tree);
  if (selectedPersonId) injectOutlines(root, selectedPersonId);

  // ── Collapse filtering ──────────────────────────────────────────────────
  const originalParentCount = new Map<string, number>();
  const hasMoreUp = new Map<string, boolean>();

  function recordAndPrune(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    originalParentCount.set(node.person.id, node.parents.length);
    hasMoreUp.set(node.person.id, !!node.hasMoreAncestors);

    if (collapsed.has(`${node.person.id}:right`)) {
      node.parents = node.parents.filter(p => p.isPlaceholder);
    }

    for (const p of node.parents) recordAndPrune(p, visited);
  }
  recordAndPrune(root);

  // ── Pre-measure heights ────────────────────────────────────────────────
  const heightOf = new Map<string, number>();
  function measureAll(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    const h = node.isPlaceholder ? MIN_BOX_H : measureBoxHeight(node.person);
    heightOf.set(node.person.id, h);
    for (const p of node.parents) measureAll(p, visited);
    for (const s of node.spouses) measureAll(s, visited);
    for (const c of node.children) measureAll(c, visited);
  }
  measureAll(root);
  const hOf = (node: TreePerson): number => heightOf.get(node.person.id) ?? MIN_BOX_H;

  // ── Geometry ───────────────────────────────────────────────────────────

  function maxDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    if (node.parents.length === 0) return 0;
    return 1 + Math.max(...node.parents.map(p => maxDepth(p, visited)));
  }

  const G = maxDepth(root) + 1;
  const genXOf = (g: number) => PAD + g * (BOX_W + H_GAP);

  // Leaf Y assignment via running cumulative cursor — replaces fixed-height slot math.
  const leafCY = new Map<string, number>();
  let cursorY = PAD;

  function assignLeafYs(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    if (node.parents.length === 0) {
      const h = hOf(node);
      leafCY.set(node.person.id, cursorY + h / 2);
      cursorY += h + V_GAP;
      if (selectedPersonId && node.person.id === selectedPersonId) {
        for (const sp of node.spouses) {
          if (sp.isPlaceholder) {
            const sh = hOf(sp);
            leafCY.set(sp.person.id, cursorY + sh / 2);
            cursorY += sh + V_GAP;
          }
        }
      }
      return;
    }
    for (const p of node.parents) assignLeafYs(p, visited);
    if (selectedPersonId && node.person.id === selectedPersonId) {
      for (const sp of node.spouses) {
        if (sp.isPlaceholder) {
          const sh = hOf(sp);
          leafCY.set(sp.person.id, cursorY + sh / 2);
          cursorY += sh + V_GAP;
        }
      }
    }
  }
  assignLeafYs(root);

  const totalLeafExtent = Math.max(cursorY - V_GAP, MIN_BOX_H);

  const cyCache = new Map<string, number>();
  function centerYOf(node: TreePerson): number {
    if (cyCache.has(node.person.id)) return cyCache.get(node.person.id)!;
    let cy: number;
    const leafY = leafCY.get(node.person.id);
    if (leafY !== undefined) {
      cy = leafY;
    } else {
      const parentCYs = node.parents.map(p => centerYOf(p));
      cy = parentCYs.length > 0
        ? parentCYs.reduce((a, b) => a + b, 0) / parentCYs.length
        : PAD + hOf(node) / 2;
    }
    cyCache.set(node.person.id, cy);
    return cy;
  }

  const depthMap = new Map<string, number>();
  function nodeDepth(node: TreePerson, depth: number, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    depthMap.set(node.person.id, depth);
    for (const p of node.parents) nodeDepth(p, depth + 1, visited);
  }
  nodeDepth(root, 0);

  // ── Place boxes and curved paths ───────────────────────────────────────
  const boxes: BoxLayout[] = [];
  const paths: string[] = [];

  function placeNodes(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    const g = depthMap.get(node.person.id) ?? 0;
    const cy = centerYOf(node);
    const h = hOf(node);

    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: genXOf(g),
      y: cy - h / 2,
      w: BOX_W, h,
    });

    const childRightX = genXOf(g) + BOX_W;
    const parentLeftX = genXOf(g + 1);
    for (const p of node.parents) {
      const pcy = centerYOf(p);
      paths.push(curvedElbow(childRightX, cy, parentLeftX, pcy, 'right'));
    }

    for (const p of node.parents) placeNodes(p, visited);
  }
  placeNodes(root);

  // ── Unplaced outlines for selected person ──────────────────────────────
  const placeholderPaths: string[] = [];

  if (selectedPersonId) {
    const selBox = boxes.find(b => b.person.id === selectedPersonId);
    const placedIds = new Set(boxes.map(b => b.person.id));

    if (selBox) {
      const selNode = findPersonInTree(root, selectedPersonId);
      if (selNode) {
        const selCX = selBox.x + BOX_W / 2;
        const selCY = selBox.y + selBox.h / 2;

        function findClearYRect(x: number, startY: number, direction: 1 | -1, boxH: number): number {
          let y = startY;
          const overlaps = () => boxes.some(b =>
            x < b.x + b.w && x + BOX_W > b.x &&
            y < b.y + b.h + V_GAP && y + boxH + V_GAP > b.y
          );
          while (overlaps()) {
            y += direction * (boxH + V_GAP);
          }
          return y;
        }

        const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
        if (unplacedSpouses.length > 0) {
          const selDepth = depthMap.get(selectedPersonId) ?? 0;
          let spTop = selBox.y + selBox.h + V_GAP;
          for (const sp of unplacedSpouses) {
            const sh = hOf(sp);
            boxes.push({
              person: sp.person,
              isFocal: false,
              x: genXOf(selDepth), y: spTop,
              w: BOX_W, h: sh,
            });
            placeholderPaths.push(
              curvedElbow(selCX, selBox.y + selBox.h, selCX, spTop, 'down'),
            );
            spTop += sh + V_GAP;
          }
        }

        const unplacedChildren = selNode.children.filter(c => !placedIds.has(c.person.id));
        if (unplacedChildren.length > 0) {
          const childX = selBox.x - BOX_W - H_GAP;
          let nextY = findClearYRect(childX, selBox.y, 1, MIN_BOX_H);
          for (const ch of unplacedChildren) {
            const chH = hOf(ch);
            const childY = nextY;
            const childCY = childY + chH / 2;
            boxes.push({
              person: ch.person,
              isFocal: false,
              x: childX, y: childY,
              w: BOX_W, h: chH,
            });
            placeholderPaths.push(
              curvedElbow(selBox.x, selCY, childX + BOX_W, childCY, 'right'),
            );
            nextY = childY + chH + V_GAP;
          }
        }
      }
    }
  }

  // ── SVG dimensions ─────────────────────────────────────────────────────
  const maxBoxRight = boxes.length > 0 ? Math.max(...boxes.map(b => b.x + b.w)) : BOX_W;
  const maxBoxBottom = boxes.length > 0 ? Math.max(...boxes.map(b => b.y + b.h)) : MIN_BOX_H;
  const minBoxTop = boxes.length > 0 ? Math.min(...boxes.map(b => b.y)) : 0;

  const svgWidth = Math.max(PAD + G * BOX_W + (G - 1) * H_GAP + PAD + 20, maxBoxRight + PAD);
  const svgHeight = Math.max(PAD + totalLeafExtent + PAD, maxBoxBottom + PAD);
  const viewBoxMinY = Math.min(0, minBoxTop - PAD);
  const finalHeight = viewBoxMinY < 0 ? svgHeight + (-viewBoxMinY) : svgHeight;

  // ── Collapse buttons ───────────────────────────────────────────────────
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
        cy: box.y + box.h / 2,
        isExpanded: !collapsed.has(`${pid}:right`),
        isLoadMore: false,
      });
    } else if (moreUp) {
      collapseButtons.push({
        personId: pid, direction: 'right',
        cx: box.x + BOX_W + 10,
        cy: box.y + box.h / 2,
        isExpanded: false, isLoadMore: true,
      });
    }
  }

  // ── Extract placeholders ───────────────────────────────────────────────
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

  for (const d of placeholderPaths) paths.push('D:' + d);

  return {
    boxes,
    lines: [],
    paths,
    svgWidth,
    svgHeight: finalHeight,
    viewBoxMinY,
    collapseButtons,
    placeholders,
    placeholderLines,
  };
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
