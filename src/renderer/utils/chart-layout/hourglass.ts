// Hourglass chart layout algorithm — operates on TreePerson graph directly.
// Focal at center, ancestors above, descendants below. Spouses shown for all nodes.
//
// Pipeline:
// 1. Clone tree (Vue computed may re-run on same ref)
// 2. Inject outlines for selected person (mutates cloned tree)
// 3. Reserve extra width for ALL outlines (spouses, cross-direction)
// 4. Collapse filtering
// 5. Spacing (ancestorWidth / descExtents use extra-extent maps)
// 6. Recursive placement — ALL outlines placed inline (no post-layout)
// 7. SVG dimensions, shift, collapse buttons, extract placeholders

import type { TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD } from './constants';
import { injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

// ── Helpers ──────────────────────────────────────────────────────────────────

function findPersonInTree(node: TreePerson, id: string, visited = new Set<string>()): TreePerson | null {
  if (node.person.id === id) return node;
  if (visited.has(node.person.id)) return null;
  visited.add(node.person.id);
  for (const p of node.parents) { const f = findPersonInTree(p, id, visited); if (f) return f; }
  for (const c of node.children) { const f = findPersonInTree(c, id, visited); if (f) return f; }
  for (const s of node.spouses) { const f = findPersonInTree(s, id, visited); if (f) return f; }
  for (const s of (node.siblings ?? [])) { const f = findPersonInTree(s, id, visited); if (f) return f; }
  return null;
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

/** Deep-clone a TreePerson graph so layout mutations don't affect the source. */
function cloneTree(node: TreePerson, visited = new Map<string, TreePerson>()): TreePerson {
  if (visited.has(node.person.id)) return visited.get(node.person.id)!;
  const clone: TreePerson = { ...node, person: { ...node.person }, parents: [], children: [], spouses: [], siblings: undefined };
  visited.set(node.person.id, clone);
  clone.parents = node.parents.map(p => cloneTree(p, visited));
  clone.children = node.children.map(c => cloneTree(c, visited));
  clone.spouses = node.spouses.map(s => cloneTree(s, visited));
  if (node.siblings) clone.siblings = node.siblings.map(s => cloneTree(s, visited));
  return clone;
}

export function maxDescendantDepthTP(node: TreePerson, visited = new Set<string>()): number {
  if (visited.has(node.person.id)) return 0;
  visited.add(node.person.id);
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(c => maxDescendantDepthTP(c, visited)));
}

export function maxDescendantDepth(node: { children: { children: unknown[] }[] }): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(c => maxDescendantDepth(c as typeof node)));
}

// ── Footprint ─────────────────────────────────────────────────────────────────

export interface Footprint {
  left: number;   // extent left of person's center
  right: number;  // extent right of person's center
}

/** Compute the bounding footprint of a person including spouses and outline placeholders. */
export function computeFootprint(node: TreePerson): Footprint {
  const half = BOX_W / 2;

  // Spouse extent: spouses stack to one side (left for F, right for M/U)
  const spouseW = node.spouses.length * (BOX_W + V_GAP);
  const onLeft = node.person.sex === 'F';
  let left = onLeft ? half + spouseW : half;
  let right = onLeft ? half : half + spouseW;

  // Parent/child placeholder outlines are centered — may be wider than the box
  for (const arr of [
    node.parents.filter(p => p.isPlaceholder),
    node.children.filter(c => c.isPlaceholder),
  ]) {
    if (arr.length > 0) {
      const groupHalf = (arr.length * BOX_W + (arr.length - 1) * V_GAP) / 2;
      left = Math.max(left, groupHalf);
      right = Math.max(right, groupHalf);
    }
  }

  return { left, right };
}

// ── Main layout ──────────────────────────────────────────────────────────────

export function computeHourglassLayout(
  inputRoot: TreePerson,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {

  // ── 1. Clone + inject outlines ─────────────────────────────────────────────
  const root = cloneTree(inputRoot);
  if (selectedPersonId) injectOutlines(root, selectedPersonId);

  // ── 2. Placement helpers (used by placeSpouses) ────────────────────────────

  /** Whether spouses go left (true for female). */
  function spousesGoLeft(node: TreePerson): boolean {
    return node.person.sex === 'F';
  }

  // ── 3. Collapse filtering ──────────────────────────────────────────────────
  const originalParentCount = new Map<string, number>();
  const originalChildCount = new Map<string, number>();
  const originalSpouseCount = new Map<string, number>();
  const hasMoreUp = new Map<string, boolean>();
  const hasMoreDown = new Map<string, boolean>();
  const originalSiblingCount = (root.siblings ?? []).length;

  function recordAndPrune(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);

    originalParentCount.set(node.person.id, node.parents.length);
    originalChildCount.set(node.person.id, node.children.length);
    originalSpouseCount.set(node.person.id, node.spouses.length);
    hasMoreUp.set(node.person.id, !!node.hasMoreAncestors);
    hasMoreDown.set(node.person.id, !!node.hasMoreChildren);

    if (collapsed.has(`${node.person.id}:up`)) {
      node.parents = node.parents.filter(p => p.isPlaceholder);
    }

    const downKeys = [...collapsed].filter(k => k.startsWith(`${node.person.id}:down`));
    if (downKeys.length > 0) {
      for (const key of downKeys) {
        const parts = key.split(':');
        if (parts.length === 2) {
          node.children = node.children.filter(c => c.isPlaceholder);
        } else {
          const coParentId = parts[2] === 'solo' ? null : parts[2];
          node.children = node.children.filter(c =>
            c.isPlaceholder || (c.coParentId ?? null) !== coParentId
          );
        }
      }
    }

    if (collapsed.has(`${node.person.id}:right`) || collapsed.has(`${node.person.id}:left`)) {
      node.spouses = node.spouses.filter(s => s.isPlaceholder);
    }

    for (const p of node.parents) recordAndPrune(p, visited);
    for (const c of node.children) recordAndPrune(c, visited);
    for (const s of node.spouses) recordAndPrune(s, visited);
  }
  recordAndPrune(root);

  const focalId = root.person.id;
  const focalIsFemale = root.person.sex === 'F';
  const siblingDir = focalIsFemale ? 'right' : 'left';
  if (collapsed.has(`${focalId}:${siblingDir}:__siblings__`)) {
    root.siblings = (root.siblings ?? []).filter(s => s.isPlaceholder);
  }

  // ── 4. Spacing ─────────────────────────────────────────────────────────────

  function maxAncestorDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    if (node.parents.length === 0) return 0;
    return 1 + Math.max(...node.parents.map(p => maxAncestorDepth(p, visited)));
  }

  function maxDescDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    if (node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(c => maxDescDepth(c, visited)));
  }

  const A = maxAncestorDepth(root);
  const D = maxDescDepth(root);

  const ancestorTopPad = PAD + 8;
  const focalRowY = ancestorTopPad + A * (BOX_H + GEN_GAP);
  const ancestorRowY = (depth: number) => focalRowY - depth * (BOX_H + GEN_GAP);
  const descRowY = (depth: number) => focalRowY + depth * (BOX_H + GEN_GAP);

  // Ancestor subtree width (upward). Uses computeFootprint for outline reservation.
  const ancWidthCache = new Map<string, number>();
  function ancestorWidth(node: TreePerson): number {
    if (ancWidthCache.has(node.person.id)) return ancWidthCache.get(node.person.id)!;
    const fp = computeFootprint(node);
    const nodeW = fp.left + fp.right;
    let w: number;
    if (node.parents.length === 0) {
      w = nodeW;
    } else {
      const parentW = node.parents.reduce((sum, par) => sum + ancestorWidth(par), 0)
        + (node.parents.length - 1) * V_GAP;
      w = Math.max(parentW, nodeW);
    }
    ancWidthCache.set(node.person.id, w);
    return w;
  }

  const ancRelCXCache = new Map<string, number>();
  function ancestorRelCX(node: TreePerson): number {
    if (ancRelCXCache.has(node.person.id)) return ancRelCXCache.get(node.person.id)!;
    const fp = computeFootprint(node);
    let cx: number;
    if (node.parents.length === 0) {
      cx = fp.left;
    } else {
      const parentCXs: number[] = [];
      let x = 0;
      for (const par of node.parents) {
        parentCXs.push(x + ancestorRelCX(par));
        x += ancestorWidth(par) + V_GAP;
      }
      const parentMidCX = parentCXs.reduce((a, b) => a + b, 0) / parentCXs.length;
      const minCX = fp.left;
      const maxCX = ancestorWidth(node) - fp.right;
      cx = Math.max(minCX, Math.min(maxCX, parentMidCX));
    }
    ancRelCXCache.set(node.person.id, cx);
    return cx;
  }

  const focalAncWidth = ancestorWidth(root);
  const focalAncRelCX = ancestorRelCX(root);
  const ancLeftFromFocal = focalAncRelCX;
  const ancRightFromFocal = focalAncWidth - focalAncRelCX;

  // Descendant subtree extents. Uses computeFootprint for outline reservation.
  const descExtCache = new Map<string, [number, number]>();
  function descExtents(node: TreePerson): [number, number] {
    if (descExtCache.has(node.person.id)) return descExtCache.get(node.person.id)!;
    const fp = computeFootprint(node);
    if (node.children.length === 0) {
      const ext: [number, number] = [fp.left, fp.right];
      descExtCache.set(node.person.id, ext);
      return ext;
    }
    const n = node.children.length;
    const childExts = node.children.map(c => descExtents(c));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftExt = Math.max(fp.left, totalSpan / 2 + childExts[0][0]);
    const rightExt = Math.max(fp.right, totalSpan / 2 + childExts[n - 1][1]);
    descExtCache.set(node.person.id, [leftExt, rightExt]);
    return [leftExt, rightExt];
  }

  const [descLeft, descRight] = descExtents(root);

  // Focal spouses + siblings extents (include outline widths)
  const spouseOnLeft = focalIsFemale && root.spouses.length > 0;
  const siblingsOnLeft = !focalIsFemale;
  const siblings: TreePerson[] = root.siblings ?? [];

  // Walk outward from focal, accumulating the CX offset for each spouse/sibling.
  // Uses computeFootprint so toward-focal outlines get proper room.
  const spouseCXOffsets: number[] = [];
  let focalSpouseExtent = 0;
  if (root.spouses.length > 0) {
    let cursor = BOX_W / 2 + H_GAP;
    for (let i = 0; i < root.spouses.length; i++) {
      const fp = computeFootprint(root.spouses[i]);
      const towardFocal = spouseOnLeft ? fp.right : fp.left;
      const awayFromFocal = spouseOnLeft ? fp.left : fp.right;
      cursor += towardFocal;
      spouseCXOffsets.push(cursor);
      cursor += awayFromFocal + V_GAP;
    }
    focalSpouseExtent = cursor - V_GAP;
  }

  const sibCXOffsets: number[] = [];
  let siblingExtent = 0;
  if (siblings.length > 0) {
    let cursor = BOX_W / 2 + H_GAP;
    for (let i = 0; i < siblings.length; i++) {
      const fp = computeFootprint(siblings[i]);
      const towardFocal = siblingsOnLeft ? fp.right : fp.left;
      const awayFromFocal = siblingsOnLeft ? fp.left : fp.right;
      cursor += towardFocal;
      sibCXOffsets.push(cursor);
      cursor += awayFromFocal + V_GAP;
    }
    siblingExtent = cursor - V_GAP;
  }

  // Focal CX
  const leftExtents = [ancLeftFromFocal, descLeft];
  if (spouseOnLeft) leftExtents.push(focalSpouseExtent);
  if (siblingsOnLeft) leftExtents.push(siblingExtent);

  const rightExtents = [ancRightFromFocal, descRight];
  if (!spouseOnLeft && root.spouses.length > 0) rightExtents.push(focalSpouseExtent);
  if (!siblingsOnLeft) rightExtents.push(siblingExtent);

  const focalCX = PAD + Math.max(...leftExtents);
  const rightNeeded = Math.max(...rightExtents);
  const svgWidth = focalCX + rightNeeded + PAD;

  // ── 5. Recursive placement ─────────────────────────────────────────────────
  // ALL outlines are placed inline during the recursive pass.
  // Spacing has already reserved room for spouses and cross-direction outlines.

  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  /** Place real spouse boxes and marriage line beside a node. Does NOT place any outlines. */
  function placeSpouses(node: TreePerson, nodeCX: number, nodeY: number): void {
    if (node.spouses.length === 0) return;
    const onLeft = node.person.sex === 'F';
    const lineY = nodeY + BOX_H / 2;
    for (let i = 0; i < node.spouses.length; i++) {
      const spCX = onLeft
        ? nodeCX - BOX_W / 2 - V_GAP - BOX_W / 2 - i * (BOX_W + V_GAP)
        : nodeCX + BOX_W / 2 + V_GAP + BOX_W / 2 + i * (BOX_W + V_GAP);
      boxes.push({
        person: node.spouses[i].person, isFocal: false,
        x: spCX - BOX_W / 2, y: nodeY, w: BOX_W, h: BOX_H,
      });
    }
    const lastIdx = node.spouses.length - 1;
    const lastCX = onLeft
      ? nodeCX - BOX_W / 2 - V_GAP - BOX_W / 2 - lastIdx * (BOX_W + V_GAP)
      : nodeCX + BOX_W / 2 + V_GAP + BOX_W / 2 + lastIdx * (BOX_W + V_GAP);
    lines.push({
      x1: onLeft ? lastCX - BOX_W / 2 : nodeCX + BOX_W / 2,
      y1: lineY,
      x2: onLeft ? nodeCX - BOX_W / 2 : lastCX + BOX_W / 2,
      y2: lineY,
    });
  }

  function placeAncestors(node: TreePerson, nodeCX: number, depth: number): void {
    const nodeY = ancestorRowY(depth);
    boxes.push({
      person: node.person, isFocal: !!node.isFocal,
      x: nodeCX - BOX_W / 2, y: nodeY, w: BOX_W, h: BOX_H,
    });

    if (!node.isFocal) placeSpouses(node, nodeCX, nodeY);

    if (node.parents.length === 0) return;

    const forkY = nodeY - GEN_GAP / 2;
    const parentWidths = node.parents.map(p => ancestorWidth(p));
    const totalWidth = parentWidths.reduce((s, w) => s + w, 0) + (node.parents.length - 1) * V_GAP;
    let x = nodeCX - totalWidth / 2;

    const parentCXs: number[] = [];
    for (let i = 0; i < node.parents.length; i++) {
      const pcx = x + ancestorRelCX(node.parents[i]);
      parentCXs.push(pcx);
      placeAncestors(node.parents[i], pcx, depth + 1);
      x += parentWidths[i] + V_GAP;
    }

    lines.push({ x1: nodeCX, y1: nodeY, x2: nodeCX, y2: forkY });
    if (parentCXs.length > 1) {
      lines.push({ x1: Math.min(...parentCXs), y1: forkY, x2: Math.max(...parentCXs), y2: forkY });
    }
    const parentRowBottom = ancestorRowY(depth + 1) + BOX_H;
    for (const pcx of parentCXs) {
      lines.push({ x1: pcx, y1: forkY, x2: pcx, y2: parentRowBottom });
    }
  }

  function placeDescendants(node: TreePerson, nodeCX: number, depth: number): void {
    const nodeY = descRowY(depth);
    boxes.push({
      person: node.person, isFocal: !!node.isFocal,
      x: nodeCX - BOX_W / 2, y: nodeY, w: BOX_W, h: BOX_H,
    });

    if (!node.isFocal) placeSpouses(node, nodeCX, nodeY);

    if (node.children.length === 0) return;

    const forkY = nodeY + BOX_H + GEN_GAP / 2;
    lines.push({ x1: nodeCX, y1: nodeY + BOX_H, x2: nodeCX, y2: forkY });

    const n = node.children.length;
    const childExts = node.children.map(c => descExtents(c));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftmostCX = nodeCX - totalSpan / 2;
    const childCXs = offsets.map(o => leftmostCX + o);

    if (n > 1) {
      lines.push({ x1: childCXs[0], y1: forkY, x2: childCXs[n - 1], y2: forkY });
    }
    for (let i = 0; i < n; i++) {
      lines.push({ x1: childCXs[i], y1: forkY, x2: childCXs[i], y2: descRowY(depth + 1) });
      placeDescendants(node.children[i], childCXs[i], depth + 1);
    }
  }

  // Place focal's ancestors
  if (root.parents.length > 0) {
    const forkY = focalRowY - GEN_GAP / 2;
    const parentWidths = root.parents.map(p => ancestorWidth(p));
    const totalWidth = parentWidths.reduce((s, w) => s + w, 0) + (root.parents.length - 1) * V_GAP;
    let x = focalCX - totalWidth / 2;
    const parentCXs: number[] = [];

    for (let i = 0; i < root.parents.length; i++) {
      const pcx = x + ancestorRelCX(root.parents[i]);
      parentCXs.push(pcx);
      placeAncestors(root.parents[i], pcx, 1);
      x += parentWidths[i] + V_GAP;
    }

    lines.push({ x1: focalCX, y1: focalRowY, x2: focalCX, y2: forkY });
    if (parentCXs.length > 1) {
      lines.push({ x1: Math.min(...parentCXs), y1: forkY, x2: Math.max(...parentCXs), y2: forkY });
    }
    const parentRowBottom = ancestorRowY(1) + BOX_H;
    for (const pcx of parentCXs) {
      lines.push({ x1: pcx, y1: forkY, x2: pcx, y2: parentRowBottom });
    }
  }

  /** Place a group of outline nodes (parents above or children below) with collision avoidance. */
  function placeOutlineGroup(nodes: TreePerson[], ownerCX: number, ownerY: number, dir: 'up' | 'down'): void {
    if (nodes.length === 0) return;
    const targetY = dir === 'down' ? ownerY + BOX_H + GEN_GAP : ownerY - BOX_H - GEN_GAP;
    const forkY = dir === 'down' ? ownerY + BOX_H + GEN_GAP / 2 : ownerY - GEN_GAP / 2;
    const n = nodes.length;
    const groupW = n * BOX_W + (n - 1) * V_GAP;

    // Try centered on owner first, then shift to avoid overlaps
    let startX = ownerCX - groupW / 2;
    const collides = (gx: number) => {
      for (let i = 0; i < n; i++) {
        const bx = gx + i * (BOX_W + V_GAP);
        if (boxes.some(b =>
          bx < b.x + b.w + V_GAP && bx + BOX_W + V_GAP > b.x &&
          targetY < b.y + b.h && targetY + BOX_H > b.y
        )) return true;
      }
      return false;
    };
    if (collides(startX)) {
      // Try positions to the left of existing boxes at that row
      const rowBoxes = boxes.filter(b => targetY < b.y + b.h && targetY + BOX_H > b.y).sort((a, b) => a.x - b.x);
      const candidates = [startX];
      for (const b of rowBoxes) {
        candidates.push(b.x + b.w + V_GAP);
        candidates.push(b.x - groupW - V_GAP);
      }
      let bestX: number | null = null;
      let bestDist = Infinity;
      for (const cx of candidates) {
        if (!collides(cx)) {
          const dist = Math.abs((cx + groupW / 2) - ownerCX);
          if (dist < bestDist) { bestDist = dist; bestX = cx; }
        }
      }
      if (bestX !== null) startX = bestX;
    }

    // Connector from owner to fork
    if (dir === 'down') {
      lines.push({ x1: ownerCX, y1: ownerY + BOX_H, x2: ownerCX, y2: forkY });
    } else {
      lines.push({ x1: ownerCX, y1: ownerY, x2: ownerCX, y2: forkY });
    }
    // Place boxes + vertical connectors
    for (let i = 0; i < n; i++) {
      const px = startX + i * (BOX_W + V_GAP);
      const pCX = px + BOX_W / 2;
      boxes.push({ person: nodes[i].person, isFocal: false, x: px, y: targetY, w: BOX_W, h: BOX_H });
      if (dir === 'down') {
        lines.push({ x1: pCX, y1: forkY, x2: pCX, y2: targetY });
      } else {
        lines.push({ x1: pCX, y1: forkY, x2: pCX, y2: targetY + BOX_H });
      }
    }
    // Horizontal fork if multiple
    if (n > 1) {
      lines.push({ x1: startX + BOX_W / 2, y1: forkY, x2: startX + (n - 1) * (BOX_W + V_GAP) + BOX_W / 2, y2: forkY });
    }
  }

  // Place focal box
  boxes.push({
    person: root.person, isFocal: true,
    x: focalCX - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H,
  });

  // Place focal's spouses using pre-computed CX offsets (directional extents)
  function spouseCXOf(i: number): number {
    const offset = spouseCXOffsets[i];
    return spouseOnLeft ? focalCX - offset : focalCX + offset;
  }

  if (root.spouses.length > 0) {
    const lineY = focalRowY + BOX_H / 2;
    const lastCX = spouseCXOf(root.spouses.length - 1);
    lines.push({
      x1: spouseOnLeft ? lastCX - BOX_W / 2 : focalCX + BOX_W / 2,
      y1: lineY,
      x2: spouseOnLeft ? focalCX + BOX_W / 2 : lastCX + BOX_W / 2,
      y2: lineY,
    });
    for (let i = 0; i < root.spouses.length; i++) {
      boxes.push({
        person: root.spouses[i].person, isFocal: false,
        x: spouseCXOf(i) - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H,
      });
    }
  }

  // Place siblings using pre-computed CX offsets
  function siblingCXOf(i: number): number {
    const offset = sibCXOffsets[i];
    return siblingsOnLeft ? focalCX - offset : focalCX + offset;
  }

  if (siblings.length > 0) {
    for (let i = 0; i < siblings.length; i++) {
      boxes.push({
        person: siblings[i].person, isFocal: false,
        x: siblingCXOf(i) - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H,
      });
    }
    // Connect siblings to parents via shared fork
    if (A >= 1) {
      const parentForkY = focalRowY - GEN_GAP / 2;
      const allCXs = [focalCX, ...siblings.map((_, i) => siblingCXOf(i))];
      lines.push({ x1: Math.min(...allCXs), y1: parentForkY, x2: Math.max(...allCXs), y2: parentForkY });
      for (let i = 0; i < siblings.length; i++) {
        const scx = siblingCXOf(i);
        lines.push({ x1: scx, y1: parentForkY, x2: scx, y2: focalRowY });
      }
    }
  }

  // Place focal's descendants
  if (root.children.length > 0) {
    const forkY = focalRowY + BOX_H + GEN_GAP / 2;
    lines.push({ x1: focalCX, y1: focalRowY + BOX_H, x2: focalCX, y2: forkY });

    const n = root.children.length;
    const childExts = root.children.map(c => descExtents(c));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftmostCX = focalCX - totalSpan / 2;
    const childCXs = offsets.map(o => leftmostCX + o);

    if (n > 1) {
      lines.push({ x1: childCXs[0], y1: forkY, x2: childCXs[n - 1], y2: forkY });
    }
    for (let i = 0; i < n; i++) {
      lines.push({ x1: childCXs[i], y1: forkY, x2: childCXs[i], y2: descRowY(1) });
      placeDescendants(root.children[i], childCXs[i], 1);
    }
  }

  // ── 6. SVG dimensions ───────────────────────────────────────────────────────
  const minBoxLeft = boxes.length > 0 ? Math.min(...boxes.map(b => b.x)) : 0;
  if (minBoxLeft < PAD) {
    const shift = PAD - minBoxLeft;
    for (const box of boxes) box.x += shift;
    for (const ln of lines) { ln.x1 += shift; ln.x2 += shift; }
  }

  const maxBoxRight = Math.max(...boxes.map(b => b.x + b.w));
  const maxBoxBottom = Math.max(...boxes.map(b => b.y + b.h));
  const minBoxTop = Math.min(...boxes.map(b => b.y));
  const finalSvgWidth = Math.max(svgWidth, maxBoxRight + PAD);
  const deepestDescRow = D > 0 ? descRowY(D) : focalRowY;
  const svgHeight = Math.max(deepestDescRow + BOX_H + 20 + PAD, maxBoxBottom + 20 + PAD);
  const viewBoxMinY = Math.min(0, minBoxTop - PAD);
  const finalHeight = viewBoxMinY < 0 ? svgHeight + (-viewBoxMinY) : svgHeight;

  // ── 8. Collapse buttons ────────────────────────────────────────────────────
  const collapseButtons: CollapseButton[] = [];

  for (const box of boxes) {
    const pid = box.person.id;
    if (pid.startsWith(PLACEHOLDER_PREFIX)) continue;

    const origParents = originalParentCount.get(pid) ?? 0;
    const origChildren = originalChildCount.get(pid) ?? 0;
    const origSpouses = originalSpouseCount.get(pid) ?? 0;
    const moreUp = hasMoreUp.get(pid) ?? false;
    const moreDown = hasMoreDown.get(pid) ?? false;

    if (origParents > 0) {
      collapseButtons.push({
        personId: pid, direction: 'up',
        cx: box.x + BOX_W / 2, cy: box.y - 10,
        isExpanded: !collapsed.has(`${pid}:up`), isLoadMore: false,
      });
    } else if (moreUp) {
      collapseButtons.push({
        personId: pid, direction: 'up',
        cx: box.x + BOX_W / 2, cy: box.y - 10,
        isExpanded: false, isLoadMore: true,
      });
    }

    if (pid === focalId) {
      const groups = new Map<string | null, TreePerson[]>();
      for (const child of root.children) {
        if (child.isPlaceholder) continue;
        const key = child.coParentId ?? null;
        const arr = groups.get(key);
        if (arr) arr.push(child); else groups.set(key, [child]);
      }
      for (const [coParentId, children] of groups) {
        if (children.length === 0) continue;
        const groupKey = `${focalId}:down:${coParentId ?? 'solo'}`;
        collapseButtons.push({
          personId: focalId, direction: 'down',
          cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
          isExpanded: !collapsed.has(groupKey), isLoadMore: false, coParentId,
        });
      }
      if (groups.size === 0 && moreDown) {
        collapseButtons.push({
          personId: focalId, direction: 'down',
          cx: focalCX, cy: box.y + BOX_H + 10,
          isExpanded: false, isLoadMore: true, coParentId: null,
        });
      }

      if (origSpouses > 0) {
        const spouseDir = focalIsFemale ? 'left' : 'right';
        const btnCX = focalIsFemale ? box.x - 10 : box.x + BOX_W + 10;
        collapseButtons.push({
          personId: pid, direction: spouseDir as 'left' | 'right',
          cx: btnCX, cy: box.y + BOX_H / 2,
          isExpanded: !collapsed.has(`${pid}:right`) && !collapsed.has(`${pid}:left`),
          isLoadMore: false,
        });
      }

      if (originalSiblingCount > 0) {
        const sibBtnCX = siblingsOnLeft ? box.x - 10 : box.x + BOX_W + 10;
        const sibBtnCY = (origSpouses > 0 && siblingsOnLeft === focalIsFemale)
          ? box.y + BOX_H / 2 + 18
          : box.y + BOX_H / 2;
        collapseButtons.push({
          personId: pid, direction: siblingDir as 'left' | 'right',
          cx: sibBtnCX, cy: sibBtnCY,
          isExpanded: !collapsed.has(`${focalId}:${siblingDir}:__siblings__`),
          isLoadMore: false, coParentId: '__siblings__',
        });
      }
    } else if (origChildren > 0) {
      collapseButtons.push({
        personId: pid, direction: 'down',
        cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
        isExpanded: !collapsed.has(`${pid}:down`), isLoadMore: false,
      });
    } else if (moreDown) {
      collapseButtons.push({
        personId: pid, direction: 'down',
        cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
        isExpanded: false, isLoadMore: true,
      });
    }
  }

  // ── 9. Extract placeholders ────────────────────────────────────────────────
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

  return { boxes, lines, svgWidth: finalSvgWidth, svgHeight: finalHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines };
}
