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

import type { TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox } from './types';
import { BOX_W, MIN_BOX_H, V_GAP, H_GAP, GEN_GAP, PAD } from './constants';
import { measureBoxHeight } from './measure';
import { curvedElbow } from './connectors';
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

/** Compute the bounding footprint of a person including spouses and outline placeholders.
 *  Used by descExtents and focal row spacing — includes placeholder spouse width.
 *  For ancestor spacing use ancestorFootprint() which excludes placeholder spouses. */
export function computeFootprint(node: TreePerson): Footprint {
  const half = BOX_W / 2;

  // Real spouses go to one side (left for F, right for M/U).
  // Placeholder spouse outline goes to the OPPOSITE side (away from real spouses).
  const realSpouses = node.spouses.filter(s => !s.isPlaceholder);
  const phSpouses = node.spouses.filter(s => s.isPlaceholder);
  const realSpouseW = realSpouses.length * (BOX_W + V_GAP);
  const phSpouseW = phSpouses.length * (BOX_W + V_GAP);
  const realOnLeft = node.person.sex === 'F';
  const left = half + (realOnLeft ? realSpouseW : phSpouseW);
  const right = half + (realOnLeft ? phSpouseW : realSpouseW);

  return { left, right };
}

/** Ancestor-only footprint: real spouses only, no placeholder spouse width.
 *  Prevents selecting a grandparent from inflating ancestorWidth via the
 *  placeholder spouse, which would shift the entire ancestor tree. */
export function ancestorFootprint(node: TreePerson): Footprint {
  const half = BOX_W / 2;
  const realSpouses = node.spouses.filter(s => !s.isPlaceholder);
  const realSpouseW = realSpouses.length * (BOX_W + V_GAP);
  const realOnLeft = node.person.sex === 'F';
  return {
    left: half + (realOnLeft ? realSpouseW : 0),
    right: half + (realOnLeft ? 0 : realSpouseW),
  };
}

// ── Main layout ──────────────────────────────────────────────────────────────

export function computeHourglassLayout(
  inputRoot: TreePerson,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {

  // ── 1. Clone tree ──────────────────────────────────────────────────────────
  const root = cloneTree(inputRoot);

  // ── 1b. Pre-measure heights for every node in the tree ─────────────────────
  const heightOf = new Map<string, number>();
  function measureAll(node: TreePerson, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    heightOf.set(node.person.id, node.isPlaceholder ? MIN_BOX_H : measureBoxHeight(node.person));
    for (const p of node.parents) measureAll(p, visited);
    for (const c of node.children) measureAll(c, visited);
    for (const s of node.spouses) measureAll(s, visited);
    if (node.siblings) for (const s of node.siblings) measureAll(s, visited);
  }
  measureAll(root);
  const hOf = (node: TreePerson): number => heightOf.get(node.person.id) ?? MIN_BOX_H;

  // ── 2. Placement helpers (used by placeSpouses) ────────────────────────────

  /** Whether spouses go left (true for female). */
  function _spousesGoLeft(node: TreePerson): boolean {
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

    originalParentCount.set(node.person.id, node.parents.filter(p => !p.isPlaceholder).length);
    originalChildCount.set(node.person.id, node.children.filter(c => !c.isPlaceholder).length);
    originalSpouseCount.set(node.person.id, node.spouses.filter(s => !s.isPlaceholder).length);
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

  // Inject outlines after collapse so collapsed nodes (whose parents/children/spouses
  // were just pruned to []) correctly receive placeholder boxes.
  if (selectedPersonId) injectOutlines(root, selectedPersonId);

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
    const realParents = node.parents.filter(p => !p.isPlaceholder);
    if (realParents.length === 0) return 0;
    return 1 + Math.max(...realParents.map(p => maxAncestorDepth(p, visited)));
  }

  function maxDescDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    const realChildren = node.children.filter(c => !c.isPlaceholder);
    if (realChildren.length === 0) return 0;
    return 1 + Math.max(...realChildren.map(c => maxDescDepth(c, visited)));
  }

  const A = maxAncestorDepth(root);
  const D = maxDescDepth(root);

  // Per-row max heights, collected by walking the tree.
  const ancRowMaxH: number[] = new Array(A + 1).fill(MIN_BOX_H);
  const descRowMaxH: number[] = new Array(D + 1).fill(MIN_BOX_H);

  function collectAncestorHeights(node: TreePerson, depth: number, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    if (depth <= A) ancRowMaxH[depth] = Math.max(ancRowMaxH[depth], hOf(node));
    for (const par of node.parents) if (!par.isPlaceholder) collectAncestorHeights(par, depth + 1, visited);
  }
  function collectDescHeights(node: TreePerson, depth: number, visited = new Set<string>()): void {
    if (visited.has(node.person.id)) return;
    visited.add(node.person.id);
    if (depth > 0 && depth <= D) descRowMaxH[depth] = Math.max(descRowMaxH[depth], hOf(node));
    for (const c of node.children) if (!c.isPlaceholder) collectDescHeights(c, depth + 1, visited);
  }
  collectAncestorHeights(root, 0);
  collectDescHeights(root, 0);

  // Focal row height also accounts for focal's spouses and siblings (all on same row).
  let focalRowH = Math.max(ancRowMaxH[0], descRowMaxH[0], MIN_BOX_H, hOf(root));
  for (const sp of root.spouses) focalRowH = Math.max(focalRowH, hOf(sp));
  for (const sib of (root.siblings ?? [])) focalRowH = Math.max(focalRowH, hOf(sib));
  ancRowMaxH[0] = focalRowH;
  descRowMaxH[0] = focalRowH;

  const ancestorTopPad = PAD + 8;
  const ancestorRowTopY: number[] = new Array(A + 1);
  // focalRowY = ancestorTopPad + sum of (anc row h + GEN_GAP) for depths 1..A
  let aboveSum = 0;
  for (let d = 1; d <= A; d++) aboveSum += ancRowMaxH[d] + GEN_GAP;
  const focalRowY = ancestorTopPad + aboveSum;
  ancestorRowTopY[0] = focalRowY;
  for (let d = 1; d <= A; d++) {
    ancestorRowTopY[d] = ancestorRowTopY[d - 1] - GEN_GAP - ancRowMaxH[d];
  }

  const descendantRowTopY: number[] = new Array(D + 1);
  descendantRowTopY[0] = focalRowY;
  for (let d = 1; d <= D; d++) {
    descendantRowTopY[d] = descendantRowTopY[d - 1] + (d === 1 ? focalRowH : descRowMaxH[d - 1]) + GEN_GAP;
  }

  const ancestorRowY = (depth: number) => ancestorRowTopY[depth];
  const descRowY = (depth: number) => descendantRowTopY[depth];

  // Ancestor subtree width (upward). Uses computeFootprint (includes placeholder
  // spouse so there's room for the outline) but skips placeholder parents (those
  // are placed by Pass 4 collision avoidance, not recursive spacing).
  const ancWidthCache = new Map<string, number>();
  function ancestorWidth(node: TreePerson): number {
    if (ancWidthCache.has(node.person.id)) return ancWidthCache.get(node.person.id)!;
    const fp = computeFootprint(node);
    const nodeW = fp.left + fp.right;
    const realParents = node.parents.filter(par => !par.isPlaceholder);
    let w: number;
    if (realParents.length === 0) {
      w = nodeW;
    } else {
      const parentW = realParents.reduce((sum, par) => sum + ancestorWidth(par), 0)
        + (realParents.length - 1) * V_GAP;
      w = Math.max(parentW, nodeW);
    }
    ancWidthCache.set(node.person.id, w);
    return w;
  }

  const ancRelCXCache = new Map<string, number>();
  function ancestorRelCX(node: TreePerson): number {
    if (ancRelCXCache.has(node.person.id)) return ancRelCXCache.get(node.person.id)!;
    const fp = computeFootprint(node);
    const realParents = node.parents.filter(par => !par.isPlaceholder);
    let cx: number;
    if (realParents.length === 0) {
      cx = fp.left;
    } else {
      const parentCXs: number[] = [];
      let x = 0;
      for (const par of realParents) {
        parentCXs.push(x + ancestorRelCX(par));
        x += ancestorWidth(par) + V_GAP;
      }
      const parentMidCX = parentCXs.reduce((a, b) => a + b, 0) / parentCXs.length;
      const totalParentW = realParents.reduce((s, par) => s + ancestorWidth(par), 0)
        + (realParents.length - 1) * V_GAP;
      const halfParent = totalParentW / 2;
      // Must fit both the person's own footprint AND the parent span within the slot
      const minCX = Math.max(fp.left, halfParent);
      const maxCX = Math.min(ancestorWidth(node) - fp.right, ancestorWidth(node) - halfParent);
      cx = Math.max(minCX, Math.min(maxCX, parentMidCX));
    }
    ancRelCXCache.set(node.person.id, cx);
    return cx;
  }

  const focalAncWidth = ancestorWidth(root);
  const focalAncRelCX = ancestorRelCX(root);
  const ancLeftFromFocal = focalAncRelCX;
  const ancRightFromFocal = focalAncWidth - focalAncRelCX;

  // Descendant subtree extents. Uses computeFootprint (includes placeholder spouse
  // for the selected person's row). Skips placeholder children — those are placed
  // by Pass 4 collision avoidance.
  const descExtCache = new Map<string, [number, number]>();
  function descExtents(node: TreePerson): [number, number] {
    if (descExtCache.has(node.person.id)) return descExtCache.get(node.person.id)!;
    const fp = computeFootprint(node);
    const realChildren = node.children.filter(c => !c.isPlaceholder);
    if (realChildren.length === 0) {
      const ext: [number, number] = [fp.left, fp.right];
      descExtCache.set(node.person.id, ext);
      return ext;
    }
    const n = realChildren.length;
    const childExts = realChildren.map(c => descExtents(c));
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

  // Check if outline spouse placeholders need room between focal and sibling sections.
  const focalRealSpouseNodes = root.spouses.filter(s => !s.isPlaceholder);
  const focalPhSpouse = root.spouses.find(s => s.isPlaceholder);

  // Focal's placeholder spouse → toward sibling side?
  const phSpouseOnSiblingSide = focalPhSpouse && (
    (spouseOnLeft && !siblingsOnLeft) || (!spouseOnLeft && siblingsOnLeft)
  );
  // Selected sibling's spouse's placeholder → toward focal side?
  let phSpouseOnFocalSide = false;
  if (selectedPersonId) {
    for (const sib of siblings) {
      for (const sp of sib.spouses) {
        if (!sp.isPlaceholder && sp.person.id === selectedPersonId) {
          const spPhSpouse = sp.spouses.find(s => s.isPlaceholder);
          if (spPhSpouse) {
            const spOutlineGoesRight = sp.person.sex === 'F';
            const goesTowardFocal = siblingsOnLeft ? spOutlineGoesRight : !spOutlineGoesRight;
            if (goesTowardFocal) phSpouseOnFocalSide = true;
          }
        }
      }
    }
  }

  // Compute CX offsets for real focal spouses (on their natural side).
  const realSpouseCXOffsets: number[] = [];
  let focalSpouseExtent = 0;
  if (focalRealSpouseNodes.length > 0) {
    let cursor = BOX_W / 2 + H_GAP;
    for (let i = 0; i < focalRealSpouseNodes.length; i++) {
      const fp = computeFootprint(focalRealSpouseNodes[i]);
      const towardFocal = spouseOnLeft ? fp.right : fp.left;
      const awayFromFocal = spouseOnLeft ? fp.left : fp.right;
      cursor += towardFocal;
      realSpouseCXOffsets.push(cursor);
      cursor += awayFromFocal + V_GAP;
    }
    focalSpouseExtent = cursor - V_GAP;
  }
  // Placeholder spouse offset on OPPOSITE side: F→right, M→left
  let phSpouseOffset = 0;
  if (focalPhSpouse) {
    phSpouseOffset = BOX_W / 2 + V_GAP + BOX_W / 2;
  }
  const sibCXOffsets: number[] = [];
  let siblingExtent = 0;
  if (siblings.length > 0) {
    const extraGap = (phSpouseOnSiblingSide ? BOX_W + V_GAP : 0) + (phSpouseOnFocalSide ? BOX_W + V_GAP : 0);
    let cursor = BOX_W / 2 + H_GAP + extraGap;
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

  // Focal CX — real spouses on their natural side, placeholder spouse on opposite side
  const leftExtents = [ancLeftFromFocal, descLeft];
  if (spouseOnLeft) leftExtents.push(focalSpouseExtent);
  if (siblingsOnLeft) leftExtents.push(siblingExtent);
  // Placeholder spouse on opposite side: F has real left → ph right; M has real right → ph left
  if (focalPhSpouse && !spouseOnLeft) leftExtents.push(phSpouseOffset);

  const rightExtents = [ancRightFromFocal, descRight];
  if (!spouseOnLeft && focalRealSpouseNodes.length > 0) rightExtents.push(focalSpouseExtent);
  if (!siblingsOnLeft) rightExtents.push(siblingExtent);
  if (focalPhSpouse && spouseOnLeft) rightExtents.push(phSpouseOffset);

  const focalCX = PAD + Math.max(...leftExtents);
  const rightNeeded = Math.max(...rightExtents);
  const svgWidth = focalCX + rightNeeded + PAD;

  // ── 5. Recursive placement ─────────────────────────────────────────────────
  // ALL outlines are placed inline during the recursive pass.
  // Spacing has already reserved room for spouses and cross-direction outlines.

  const boxes: BoxLayout[] = [];
  const paths: string[] = [];
  const placeholderPaths: string[] = [];

  /** Place REAL spouse boxes and marriage line beside a node. Skips placeholder spouses (Pass 4 handles those). */
  function placeSpouses(node: TreePerson, nodeCX: number, nodeY: number): void {
    const realSpouses = node.spouses.filter(s => !s.isPlaceholder);
    if (realSpouses.length === 0) return;
    const onLeft = node.person.sex === 'F';
    const nodeH = hOf(node);
    const lineY = nodeY + nodeH / 2;
    for (let i = 0; i < realSpouses.length; i++) {
      const spCX = onLeft
        ? nodeCX - BOX_W / 2 - V_GAP - BOX_W / 2 - i * (BOX_W + V_GAP)
        : nodeCX + BOX_W / 2 + V_GAP + BOX_W / 2 + i * (BOX_W + V_GAP);
      boxes.push({
        person: realSpouses[i].person, isFocal: false,
        x: spCX - BOX_W / 2, y: nodeY, w: BOX_W, h: hOf(realSpouses[i]),
      });
    }
    const lastIdx = realSpouses.length - 1;
    const lastCX = onLeft
      ? nodeCX - BOX_W / 2 - V_GAP - BOX_W / 2 - lastIdx * (BOX_W + V_GAP)
      : nodeCX + BOX_W / 2 + V_GAP + BOX_W / 2 + lastIdx * (BOX_W + V_GAP);
    const fromX = onLeft ? lastCX - BOX_W / 2 : nodeCX + BOX_W / 2;
    const toX = onLeft ? nodeCX - BOX_W / 2 : lastCX + BOX_W / 2;
    paths.push(curvedElbow(fromX, lineY, toX, lineY, 'right'));
  }

  function placeAncestors(node: TreePerson, nodeCX: number, depth: number): void {
    const nodeY = ancestorRowY(depth);
    const nodeH = hOf(node);
    boxes.push({
      person: node.person, isFocal: !!node.isFocal,
      x: nodeCX - BOX_W / 2, y: nodeY, w: BOX_W, h: nodeH,
    });

    if (!node.isFocal) placeSpouses(node, nodeCX, nodeY);

    // Only recurse into real parents — placeholder parent outlines are placed by Pass 4
    const realParents = node.parents.filter(par => !par.isPlaceholder);
    if (realParents.length === 0) return;

    const parentWidths = realParents.map(p => ancestorWidth(p));
    const totalWidth = parentWidths.reduce((s, w) => s + w, 0) + (realParents.length - 1) * V_GAP;
    let x = nodeCX - totalWidth / 2;

    const parentCXs: number[] = [];
    for (let i = 0; i < realParents.length; i++) {
      const pcx = x + ancestorRelCX(realParents[i]);
      parentCXs.push(pcx);
      placeAncestors(realParents[i], pcx, depth + 1);
      x += parentWidths[i] + V_GAP;
    }

    // One curved elbow per parent: from child top → each parent's own bottom.
    // Using the parent's actual bottom (not the row max bottom) so connectors to
    // shorter parents don't terminate below the parent box. A shared midY keeps
    // all horizontal segments on the same line when parents have varying heights.
    const parentRowBottom = ancestorRowY(depth + 1) + ancRowMaxH[depth + 1];
    const sharedMidY = (nodeY + parentRowBottom) / 2;
    for (let i = 0; i < realParents.length; i++) {
      const pcx = parentCXs[i];
      const pBottom = ancestorRowY(depth + 1) + hOf(realParents[i]);
      paths.push(curvedElbow(nodeCX, nodeY, pcx, pBottom, 'down', sharedMidY));
    }
  }

  function placeDescendants(node: TreePerson, nodeCX: number, depth: number): void {
    const nodeY = descRowY(depth);
    const nodeH = hOf(node);
    boxes.push({
      person: node.person, isFocal: !!node.isFocal,
      x: nodeCX - BOX_W / 2, y: nodeY, w: BOX_W, h: nodeH,
    });

    if (!node.isFocal) placeSpouses(node, nodeCX, nodeY);

    // Only recurse into real children — placeholder child outlines are placed by Pass 4
    const realChildren = node.children.filter(c => !c.isPlaceholder);
    if (realChildren.length === 0) return;

    const n = realChildren.length;
    const childExts = realChildren.map(c => descExtents(c));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftmostCX = nodeCX - totalSpan / 2;
    const childCXs = offsets.map(o => leftmostCX + o);

    // One curved elbow per child: from parent bottom → child top
    for (let i = 0; i < n; i++) {
      paths.push(curvedElbow(nodeCX, nodeY + nodeH, childCXs[i], descRowY(depth + 1), 'down'));
      placeDescendants(realChildren[i], childCXs[i], depth + 1);
    }
  }

  // Place focal's ancestors (real parents only — placeholder parent outlines handled by Pass 4)
  const focalRealParents = root.parents.filter(par => !par.isPlaceholder);
  if (focalRealParents.length > 0) {
    const parentWidths = focalRealParents.map(p => ancestorWidth(p));
    const totalWidth = parentWidths.reduce((s, w) => s + w, 0) + (focalRealParents.length - 1) * V_GAP;
    let x = focalCX - totalWidth / 2;
    const parentCXs: number[] = [];

    for (let i = 0; i < focalRealParents.length; i++) {
      const pcx = x + ancestorRelCX(focalRealParents[i]);
      parentCXs.push(pcx);
      placeAncestors(focalRealParents[i], pcx, 1);
      x += parentWidths[i] + V_GAP;
    }

    // One curved elbow per parent: from focal top → each parent's own bottom,
    // sharing the midY so all parents and siblings fork at the same horizontal.
    const parentRowBottom = ancestorRowY(1) + ancRowMaxH[1];
    const sharedMidY = (focalRowY + parentRowBottom) / 2;
    for (let i = 0; i < focalRealParents.length; i++) {
      const pcx = parentCXs[i];
      const pBottom = ancestorRowY(1) + hOf(focalRealParents[i]);
      paths.push(curvedElbow(focalCX, focalRowY, pcx, pBottom, 'down', sharedMidY));
    }
  }

  /** Place a group of outline nodes (parents above or children below) with collision avoidance.
   *  `rowTopHint` / `rowMaxHHint` force alignment to an existing row (so placeholders sit at
   *  the same Y as real boxes in that row). When unset, falls back to owner-relative placement.
   */
  function placeOutlineGroup(
    nodes: TreePerson[],
    ownerCX: number,
    ownerY: number,
    ownerH: number,
    dir: 'up' | 'down',
    rowTopHint?: number,
    rowMaxHHint?: number,
  ): void {
    if (nodes.length === 0) return;
    const n = nodes.length;
    const placeholderMaxH = nodes.reduce((m, nd) => Math.max(m, hOf(nd)), MIN_BOX_H);
    const rowH = rowMaxHHint ?? placeholderMaxH;
    const targetY = rowTopHint ?? (dir === 'down' ? ownerY + ownerH + GEN_GAP : ownerY - rowH - GEN_GAP);
    const groupW = n * BOX_W + (n - 1) * V_GAP;

    // Try centered on owner first, then shift to avoid overlaps
    let startX = ownerCX - groupW / 2;
    const collides = (gx: number) => {
      for (let i = 0; i < n; i++) {
        const bx = gx + i * (BOX_W + V_GAP);
        if (boxes.some(b =>
          bx < b.x + b.w + V_GAP && bx + BOX_W + V_GAP > b.x &&
          targetY < b.y + b.h && targetY + rowH > b.y
        )) return true;
      }
      return false;
    };
    if (collides(startX)) {
      // Try positions to the left of existing boxes at that row
      const rowBoxes = boxes.filter(b => targetY < b.y + b.h && targetY + rowH > b.y).sort((a, b) => a.x - b.x);
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

    // Place outline boxes
    for (let i = 0; i < n; i++) {
      const px = startX + i * (BOX_W + V_GAP);
      const ph = hOf(nodes[i]);
      boxes.push({ person: nodes[i].person, isFocal: false, x: px, y: targetY, w: BOX_W, h: ph });
    }

    // Connectors: one curved elbow per outline box, owner edge → outline box near edge.
    // For upward connectors, share the same midY as the real parent connectors so
    // placeholder and real connector horizontal segments sit on the same line.
    const connectorMidY = (dir === 'up' && rowMaxHHint !== undefined)
      ? (ownerY + targetY + rowMaxHHint) / 2
      : undefined;
    for (let i = 0; i < n; i++) {
      const px = startX + i * (BOX_W + V_GAP);
      const pCX = px + BOX_W / 2;
      const ph = hOf(nodes[i]);
      if (dir === 'down') {
        placeholderPaths.push(curvedElbow(ownerCX, ownerY + ownerH, pCX, targetY, 'down'));
      } else {
        placeholderPaths.push(curvedElbow(pCX, targetY + ph, ownerCX, ownerY, 'down', connectorMidY));
      }
    }
  }

  // Place focal box (focal row height = focalRowH, which accounts for spouses/siblings too)
  const focalH = hOf(root);
  boxes.push({
    person: root.person, isFocal: true,
    x: focalCX - BOX_W / 2, y: focalRowY, w: BOX_W, h: focalH,
  });

  // Place focal's REAL spouses on their natural side using realSpouseCXOffsets.
  // Placeholder spouse is placed by Pass 4 on the opposite side.
  function realSpouseCXAt(i: number): number {
    const offset = realSpouseCXOffsets[i];
    return spouseOnLeft ? focalCX - offset : focalCX + offset;
  }

  if (focalRealSpouseNodes.length > 0) {
    const lineY = focalRowY + focalH / 2;
    const lastCX = realSpouseCXAt(focalRealSpouseNodes.length - 1);
    const fromX = spouseOnLeft ? lastCX - BOX_W / 2 : focalCX + BOX_W / 2;
    const toX = spouseOnLeft ? focalCX - BOX_W / 2 : lastCX + BOX_W / 2;
    paths.push(curvedElbow(fromX, lineY, toX, lineY, 'right'));
    for (let i = 0; i < focalRealSpouseNodes.length; i++) {
      const spCX = realSpouseCXAt(i);
      boxes.push({
        person: focalRealSpouseNodes[i].person, isFocal: false,
        x: spCX - BOX_W / 2, y: focalRowY, w: BOX_W, h: hOf(focalRealSpouseNodes[i]),
      });
      placeSpouses(focalRealSpouseNodes[i], spCX, focalRowY);
    }
  }

  // Place siblings using pre-computed CX offsets
  function siblingCXOf(i: number): number {
    const offset = sibCXOffsets[i];
    return siblingsOnLeft ? focalCX - offset : focalCX + offset;
  }

  if (siblings.length > 0) {
    for (let i = 0; i < siblings.length; i++) {
      const sibCX = siblingCXOf(i);
      boxes.push({
        person: siblings[i].person, isFocal: false,
        x: sibCX - BOX_W / 2, y: focalRowY, w: BOX_W, h: hOf(siblings[i]),
      });
      // Place sibling's real spouses (spacing already reserved via computeFootprint)
      placeSpouses(siblings[i], sibCX, focalRowY);
    }
    // Connect siblings to the parent-generation junction above the focal.
    // All sibling connectors terminate at (focalCX, sharedMidY) — the same
    // horizontal level used by real focal→parent connectors. curvedElbow
    // emits a clean L-shape when customMidY === toY (no degenerate arcs).
    if (A >= 1) {
      const parentRowBottom = ancestorRowY(1) + ancRowMaxH[1];
      const sharedMidY = (focalRowY + parentRowBottom) / 2;
      for (let i = 0; i < siblings.length; i++) {
        const scx = siblingCXOf(i);
        paths.push(curvedElbow(scx, focalRowY, focalCX, sharedMidY, 'down', sharedMidY));
      }
    }
  }

  // Place focal's descendants (real children only — placeholder child outlines handled by Pass 4)
  const focalRealChildren = root.children.filter(c => !c.isPlaceholder);
  if (focalRealChildren.length > 0) {
    const n = focalRealChildren.length;
    const childExts = focalRealChildren.map(c => descExtents(c));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftmostCX = focalCX - totalSpan / 2;
    const childCXs = offsets.map(o => leftmostCX + o);

    // One curved elbow per child: from focal bottom → child top
    for (let i = 0; i < n; i++) {
      paths.push(curvedElbow(focalCX, focalRowY + focalH, childCXs[i], descRowY(1), 'down'));
      placeDescendants(focalRealChildren[i], childCXs[i], 1);
    }
  }

  // ── Pass 4: Place outlines for selected person ──────────────────────────────
  if (selectedPersonId) {
    const selBox = boxes.find(b => b.person.id === selectedPersonId);
    if (selBox) {
      const selNode = findPersonInTree(root, selectedPersonId);
      if (selNode) {
        const selCX = selBox.x + BOX_W / 2;
        const selIsFemale = selNode.person.sex === 'F';

        const placedIds = new Set(boxes.map(b => b.person.id));

        // Spouse outlines — use reserved slot if the selected person is the focal
        // (spouseCXOffsets has a slot for the placeholder). Otherwise use findClearX.
        const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
        const outlineGoesRight = selIsFemale;
        for (let i = 0; i < unplacedSpouses.length; i++) {
          let spX: number;
          const spH = hOf(unplacedSpouses[i]);

          // For focal's placeholder spouse: use the reserved offset on the opposite side
          if (selNode === root && focalPhSpouse && unplacedSpouses[i].person.id === focalPhSpouse.person.id) {
            // Opposite side: F→right, M→left
            const phCX = spouseOnLeft ? focalCX + phSpouseOffset : focalCX - phSpouseOffset;
            spX = phCX - BOX_W / 2;
          } else {
            // No reserved slot — use collision avoidance
            const findClearX = (startX: number, y: number, direction: 1 | -1): number => {
              let x = startX;
              while (boxes.some(b =>
                x < b.x + b.w + V_GAP && x + BOX_W + V_GAP > b.x &&
                y < b.y + b.h && y + spH > b.y
              )) { x += direction * (BOX_W + V_GAP); }
              return x;
            };
            if (outlineGoesRight) {
              spX = findClearX(selBox.x + BOX_W + V_GAP + i * (BOX_W + V_GAP), selBox.y, 1);
            } else {
              spX = findClearX(selBox.x - BOX_W - V_GAP - i * (BOX_W + V_GAP), selBox.y, -1);
            }
          }
          const isRight = spX > selBox.x;
          boxes.push({ person: unplacedSpouses[i].person, isFocal: false, x: spX, y: selBox.y, w: BOX_W, h: spH });
          const spCX = spX + BOX_W / 2;
          const lineY = selBox.y + selBox.h / 2;
          if (isRight) {
            placeholderPaths.push(curvedElbow(selCX + BOX_W / 2, lineY, spCX - BOX_W / 2, lineY, 'right'));
          } else {
            placeholderPaths.push(curvedElbow(spCX + BOX_W / 2, lineY, selCX - BOX_W / 2, lineY, 'right'));
          }
        }

        // Look up which known row the selected box is in so placeholder parents
        // and children snap to the same Y as the adjacent real row (otherwise
        // they would float at a selBox-relative Y that doesn't match the row).
        let rowAboveTop: number | undefined;
        let rowAboveMaxH: number | undefined;
        let rowBelowTop: number | undefined;
        let rowBelowMaxH: number | undefined;

        const yMatches = (a: number, b: number) => Math.abs(a - b) < 0.5;

        if (yMatches(selBox.y, focalRowY)) {
          if (A >= 1) { rowAboveTop = ancestorRowTopY[1]; rowAboveMaxH = ancRowMaxH[1]; }
          if (D >= 1) { rowBelowTop = descendantRowTopY[1]; rowBelowMaxH = descRowMaxH[1]; }
        } else {
          for (let d = 1; d <= A; d++) {
            if (yMatches(selBox.y, ancestorRowTopY[d])) {
              if (d < A) { rowAboveTop = ancestorRowTopY[d + 1]; rowAboveMaxH = ancRowMaxH[d + 1]; }
              if (d === 1) { rowBelowTop = focalRowY; rowBelowMaxH = focalRowH; }
              else { rowBelowTop = ancestorRowTopY[d - 1]; rowBelowMaxH = ancRowMaxH[d - 1]; }
              break;
            }
          }
          for (let d = 1; d <= D; d++) {
            if (yMatches(selBox.y, descendantRowTopY[d])) {
              if (d === 1) { rowAboveTop = focalRowY; rowAboveMaxH = focalRowH; }
              else { rowAboveTop = descendantRowTopY[d - 1]; rowAboveMaxH = descRowMaxH[d - 1]; }
              if (d < D) { rowBelowTop = descendantRowTopY[d + 1]; rowBelowMaxH = descRowMaxH[d + 1]; }
              break;
            }
          }
        }

        const unplacedChildren = selNode.children.filter(c => !placedIds.has(c.person.id));
        placeOutlineGroup(unplacedChildren, selCX, selBox.y, selBox.h, 'down', rowBelowTop, rowBelowMaxH);

        const unplacedParents = selNode.parents.filter(par => !placedIds.has(par.person.id));
        placeOutlineGroup(unplacedParents, selCX, selBox.y, selBox.h, 'up', rowAboveTop, rowAboveMaxH);
      }
    }
  }

  // ── 6. SVG dimensions ───────────────────────────────────────────────────────
  const minBoxLeft = boxes.length > 0 ? Math.min(...boxes.map(b => b.x)) : 0;
  if (minBoxLeft < PAD) {
    const shift = PAD - minBoxLeft;
    for (const box of boxes) box.x += shift;
    // Shift path coordinates by `shift` on the X axis. curvedElbow emits only
    // M x,y / H x / V y / Q x,y x,y — X values are the FIRST number in each
    // coordinate pair, plus the lone number after H. V values are Y only
    // (unchanged). We shift paths token-by-token.
    const shiftPath = (d: string): number[] | string => {
      const tokens = d.split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === 'M' || t === 'Q') {
          // next two tokens are coordinate pairs "x,y" — shift X of each
          for (let j = 1; j <= (t === 'Q' ? 2 : 1); j++) {
            const pair = tokens[i + j];
            if (!pair) break;
            const [x, y] = pair.split(',');
            if (x !== undefined && y !== undefined) tokens[i + j] = `${parseFloat(x) + shift},${y}`;
          }
        } else if (t === 'H') {
          const next = tokens[i + 1];
          if (next !== undefined) tokens[i + 1] = String(parseFloat(next) + shift);
        }
      }
      return tokens.join(' ');
    };
    for (let i = 0; i < paths.length; i++) paths[i] = shiftPath(paths[i]) as string;
    for (let i = 0; i < placeholderPaths.length; i++) placeholderPaths[i] = shiftPath(placeholderPaths[i]) as string;
  }

  const maxBoxRight = Math.max(...boxes.map(b => b.x + b.w));
  const maxBoxBottom = Math.max(...boxes.map(b => b.y + b.h));
  const minBoxTop = Math.min(...boxes.map(b => b.y));
  const finalSvgWidth = Math.max(svgWidth, maxBoxRight + PAD);
  const svgHeight = Math.max(descendantRowTopY[D] + descRowMaxH[D] + 20 + PAD, maxBoxBottom + 20 + PAD);
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
          cx: box.x + BOX_W / 2, cy: box.y + box.h + 10,
          isExpanded: !collapsed.has(groupKey), isLoadMore: false, coParentId,
        });
      }
      if (groups.size === 0 && moreDown) {
        collapseButtons.push({
          personId: focalId, direction: 'down',
          cx: focalCX, cy: box.y + box.h + 10,
          isExpanded: false, isLoadMore: true, coParentId: null,
        });
      }

      if (origSpouses > 0) {
        const spouseDir = focalIsFemale ? 'left' : 'right';
        const btnCX = focalIsFemale ? box.x - 10 : box.x + BOX_W + 10;
        collapseButtons.push({
          personId: pid, direction: spouseDir as 'left' | 'right',
          cx: btnCX, cy: box.y + box.h / 2,
          isExpanded: !collapsed.has(`${pid}:right`) && !collapsed.has(`${pid}:left`),
          isLoadMore: false,
        });
      }

      if (originalSiblingCount > 0) {
        const sibBtnCX = siblingsOnLeft ? box.x - 10 : box.x + BOX_W + 10;
        const sibBtnCY = (origSpouses > 0 && siblingsOnLeft === focalIsFemale)
          ? box.y + box.h / 2 + 18
          : box.y + box.h / 2;
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
        cx: box.x + BOX_W / 2, cy: box.y + box.h + 10,
        isExpanded: !collapsed.has(`${pid}:down`), isLoadMore: false,
      });
    } else if (moreDown) {
      collapseButtons.push({
        personId: pid, direction: 'down',
        cx: box.x + BOX_W / 2, cy: box.y + box.h + 10,
        isExpanded: false, isLoadMore: true,
      });
    }
  }

  // ── 9. Extract placeholders ────────────────────────────────────────────────
  const placeholders: PlaceholderBox[] = [];

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

  return { boxes, lines: [], paths, svgWidth: finalSvgWidth, svgHeight: finalHeight, viewBoxMinY, collapseButtons, placeholders, placeholderLines: [] };
}
