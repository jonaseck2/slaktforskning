// src/renderer/utils/chartLayout.ts
// Pure layout algorithms for genealogy charts — no IPC, no DOM, fully unit-testable.

export interface PersonNode {
  id: string;
  givenName: string | null;
  surname: string | null;
  preferredName: string | null;
  nickname: string | null;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthDate: string | null;  // ISO date string e.g. "1850-03-15" or partial "1850"
  deathDate: string | null;
}

/** Extracts the 4-digit year from an ISO date string. Used for timeline positioning. */
export function yearFromDate(d: string | null): number | null {
  if (!d) return null;
  const m = d.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

export interface BoxLayout {
  person: PersonNode;
  isFocal: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CollapseButton {
  personId: string;
  direction: 'up' | 'down' | 'left' | 'right';
  cx: number;
  cy: number;
  isExpanded: boolean;
  isLoadMore?: boolean; // true → click fetches new data; false/absent → toggles visibility
  /** For focal 'down' buttons: which co-parent group this button controls (undefined = non-focal). */
  coParentId?: string | null;
}

export interface PlaceholderBox {
  type: 'placeholder';
  role: 'father' | 'mother';
  childPersonId: string;
  key: number;
  x: number;
  y: number;
}

export interface ChartLayout {
  boxes: BoxLayout[];
  lines: Line[];
  svgWidth: number;
  svgHeight: number;
  collapseButtons: CollapseButton[];
  placeholders: PlaceholderBox[];
  placeholderLines: Line[];
}

/**
 * Ahnentafel-indexed ancestor tree.
 * Key 1 = focal, 2 = father, 3 = mother, 4 = pat.grandfather, …
 * `generations` includes focal (e.g. 5 = focal + 4 ancestor levels).
 * `hasMoreAncestors`: ahnentafel keys where parents exist in DB but are not loaded.
 */
export interface PedigreeTree {
  nodes: Map<number, PersonNode>;
  generations: number;
  hasMoreAncestors?: Set<number>;
}

/** Recursive descendant tree node. */
export interface DescendantNode {
  person: PersonNode;
  children: DescendantNode[];
  hasMoreChildren?: boolean; // children exist in DB but not loaded (meaningful at max depth)
  /** Set on focal's direct children only: which of focal's spouses is the other parent (null = none). */
  coParentId?: string | null;
}

/**
 * Hourglass tree: ancestor section (ahnentafel) above focal,
 * descendant tree below, and spouses displayed to the right of focal.
 * `ancestors.generations` = focal + ancestor levels shown above.
 * `descendantGenerations` = levels below focal.
 */
export interface HourglassTree {
  ancestors: PedigreeTree;
  descendantRoot: DescendantNode;
  descendantGenerations: number;
  spouses: PersonNode[];
  siblings?: PersonNode[];
}

/**
 * Returns the actual maximum depth of a descendant tree (0 = focal only).
 * Used after loadChildrenForNode to update HourglassTree.descendantGenerations.
 */
export function maxDescendantDepth(node: DescendantNode, depth = 0): number {
  if (node.children.length === 0) return depth;
  return Math.max(...node.children.map(c => maxDescendantDepth(c, depth + 1)));
}

export interface BarLayout {
  person: PersonNode;
  isFocal: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  isOpen: boolean;
  hasNoDate: boolean;
}

export interface TickMark {
  x: number;
  year: number;
}

export interface TimelineLayout {
  bars: BarLayout[];
  ticks: TickMark[];
  todayX: number;
  svgWidth: number;
  svgHeight: number;
  axisY: number;
}

export interface TimelineEntry {
  person: PersonNode;
  isFocal: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const BOX_W = 155;
export const BOX_H = 54;
export const V_GAP = 20;   // vertical gap between sibling boxes (pedigree) / horizontal gap (hourglass)
export const H_GAP = 50;   // horizontal gap between pedigree generations
export const GEN_GAP = 60; // vertical gap between hourglass generations
const PAD = 10;
const ROW_H = BOX_H + V_GAP; // 64

// ─── Pedigree ─────────────────────────────────────────────────────────────────

/**
 * Lay out a pedigree chart (focal at left, ancestors going right).
 * Handles any number of generations via ahnentafel numbering.
 */
export function computePedigreeLayout(
  tree: PedigreeTree,
  collapsed: Set<string> = new Set(),
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

  // Generate placeholder ghost boxes for missing parents of leaf nodes.
  // Only shown for leaf nodes that are NOT at the maximum generation depth,
  // and that don't already have a load-more button (hasMoreAncestors).
  const placeholders: PlaceholderBox[] = [];
  const placeholderLines: Line[] = [];
  for (const [k] of nodes) {
    const g = Math.floor(Math.log2(k));
    if (g >= G - 1) continue; // at max depth, don't show placeholders
    const fatherK = k * 2;
    const motherK = k * 2 + 1;
    const hasFather = nodes.has(fatherK);
    const hasMother = nodes.has(motherK);
    // Only add placeholders for leaf nodes missing at least one parent
    // and that don't have a hasMoreAncestors flag (those get load-more buttons instead)
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

  return { boxes, lines, svgWidth, svgHeight, collapseButtons, placeholders, placeholderLines: uniquePlaceholderLines };
}

// ─── Hourglass ────────────────────────────────────────────────────────────────

/**
 * Lay out an hourglass chart.
 * Ancestors fan out upward; descendants fan out downward.
 * Both sections are horizontally centered over the focal person.
 */
export function computeHourglassLayout(
  tree: HourglassTree,
  collapsed: Set<string> = new Set(),
): ChartLayout {
  const { ancestors, descendantRoot, descendantGenerations: M, spouses = [], siblings = [] } = tree;
  const { generations } = ancestors;
  const originalAncestorNodes = ancestors.nodes;
  const focalPerson = originalAncestorNodes.get(1);
  const focalId = focalPerson?.id ?? '';

  // Map personId → ahnentafel key (for button generation and pruning)
  const personToAhnen = new Map<string, number>();
  for (const [k, person] of originalAncestorNodes) {
    personToAhnen.set(person.id, k);
  }

  // Prune collapsed ancestor subtrees
  function removeSubtree(nodes: Map<number, PersonNode>, k: number): void {
    if (!nodes.has(k)) return;
    nodes.delete(k);
    removeSubtree(nodes, k * 2);
    removeSubtree(nodes, k * 2 + 1);
  }

  const prunedAncestorNodes = new Map(originalAncestorNodes);
  for (const [k, person] of originalAncestorNodes) {
    if (k >= 2 && collapsed.has(`${person.id}:up`)) {
      removeSubtree(prunedAncestorNodes, k * 2);
      removeSubtree(prunedAncestorNodes, k * 2 + 1);
    }
  }

  const ancestorNodes = prunedAncestorNodes;
  const focalIsFemale = focalPerson?.sex === 'F';

  // Spouses may be collapsed via :right key (original) or :left key (female focal).
  const effectiveSpouses = (collapsed.has(`${focalId}:right`) || collapsed.has(`${focalId}:left`)) ? [] : spouses;

  // Siblings on left use 'left' direction key, on right use 'right' direction key — with '__siblings__' co-parent marker.
  const siblingDir: 'left' | 'right' = focalIsFemale ? 'right' : 'left';
  const siblingCollapseKey = `${focalId}:${siblingDir}:__siblings__`;
  const effectiveSiblings = collapsed.has(siblingCollapseKey) ? [] : siblings;

  // Group focal's direct children by co-parent ID (set by chartData during fetch).
  const focalChildGroupMap = new Map<string | null, DescendantNode[]>();
  for (const child of descendantRoot.children) {
    const key = child.coParentId ?? null;
    const arr = focalChildGroupMap.get(key);
    if (arr) arr.push(child); else focalChildGroupMap.set(key, [child]);
  }

  // When the focal person is female, place spouses to the LEFT so the convention
  // "male left, female right" holds regardless of who is currently focal.
  const spouseOnLeft = focalIsFemale && effectiveSpouses.length > 0;

  // Siblings go on the opposite side from where spouses would go:
  // Male focal: spouses right → siblings left. Female focal: spouses left → siblings right.
  const siblingsOnLeft = !focalIsFemale;

  const A = generations - 1; // ancestor levels above focal

  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  // ── Ancestor geometry ────────────────────────────────────────────────────
  //
  // Compact horizontal layout: only visible leaf nodes get individual slots,
  // preserving genealogical left-to-right order.  Internal nodes are centred
  // over their children — the same algorithm as the pedigree chart's vertical
  // layout but rotated 90°.  This means parents are never spread wider than
  // their children actually require.

  function virtualAncestorLeafPos(k: number): number {
    const g = Math.floor(Math.log2(k));
    const pos = k - (1 << g);
    return (pos + 0.5) * (1 << (A - g)) - 0.5;
  }

  const isAncestorLeaf = (k: number) => !ancestorNodes.has(k * 2) && !ancestorNodes.has(k * 2 + 1);
  const ancestorLeaves = [...ancestorNodes.keys()]
    .filter(isAncestorLeaf)
    .sort((a, b) => virtualAncestorLeafPos(a) - virtualAncestorLeafPos(b));
  const leafXIndex = new Map<number, number>();
  ancestorLeaves.forEach((k, i) => leafXIndex.set(k, i));

  const numAncestorLeaves = ancestorLeaves.length;
  const ancestorSectionWidth = numAncestorLeaves > 0
    ? numAncestorLeaves * (BOX_W + V_GAP) - V_GAP
    : BOX_W;

  // Relative CX of ancestor k (offset from left edge of ancestor section).
  const relCXCache = new Map<number, number>();
  function ancestorRelCX(k: number): number {
    if (relCXCache.has(k)) return relCXCache.get(k)!;
    const idx = leafXIndex.get(k);
    let relCX: number;
    if (idx !== undefined) {
      relCX = idx * (BOX_W + V_GAP) + BOX_W / 2;
    } else {
      const childCXs: number[] = [];
      if (ancestorNodes.has(k * 2)) childCXs.push(ancestorRelCX(k * 2));
      if (ancestorNodes.has(k * 2 + 1)) childCXs.push(ancestorRelCX(k * 2 + 1));
      relCX = childCXs.length > 0
        ? childCXs.reduce((a, b) => a + b, 0) / childCXs.length
        : BOX_W / 2;
    }
    relCXCache.set(k, relCX);
    return relCX;
  }

  // Focal's offset within the ancestor section, giving asymmetric extents.
  const focalRelCX      = ancestorRelCX(1);
  const ancLeftFromFocal  = focalRelCX;
  const ancRightFromFocal = ancestorSectionWidth - focalRelCX;

  // ── Descendant geometry ──────────────────────────────────────────────────
  //
  // Children are placed by spacing adjacent sibling subtrees just V_GAP apart,
  // then centering the group below the parent.  Leaf nodes take 1 slot (BOX_W).
  // Nodes with children take as much space as their subtree needs.
  //
  // subtreeExtents(node, depth) → [leftExt, rightExt] measured from node's CX.
  // placeDescendants(node, depth, nodeCX) places boxes/lines recursively.
  // Both functions use the same spacing logic so layout and sizing agree.

  function subtreeExtents(node: DescendantNode, depth: number): [number, number] {
    const half = BOX_W / 2;
    if (depth >= M || node.children.length === 0) return [half, half];
    if (depth > 0 && collapsed.has(`${node.person.id}:down`)) return [half, half];

    const n = node.children.length;
    const childExts = node.children.map(c => subtreeExtents(c, depth + 1));

    // Offsets of each child's CX from the leftmost child's CX
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1]; // distance from first to last child CX

    // Group is centred below node: leftmost child at node - totalSpan/2
    const leftExt  = Math.max(half, totalSpan / 2 + childExts[0][0]);
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]);
    return [leftExt, rightExt];
  }

  // Row Y helpers (needed before focalCX is known)
  // Ancestor rows count down from top; focal = PAD + A*(BOX_H+GEN_GAP)
  // Extra 8px at top so the ▲ button (radius 8) on the topmost row isn't clipped.
  const ancestorTopPad = PAD + 8;
  const focalRowY  = ancestorTopPad + A * (BOX_H + GEN_GAP);
  const ancestorRowY = (g: number) => ancestorTopPad + (A - g) * (BOX_H + GEN_GAP);
  const descRowY     = (d: number) => focalRowY + d * (BOX_H + GEN_GAP);

  // Distance from focalCX to the couple-junction for spouse at index i.
  const junctionOffsetOf = (i: number): number =>
    (BOX_W + H_GAP + i * (BOX_W + V_GAP)) / 2;

  // Spouse offset: distance from focalCX to junction for first spouse (used for marriage line).
  const spouseOffset = effectiveSpouses.length > 0 ? junctionOffsetOf(0) : 0;

  // Compute extents of a flat list of focal children (treated as depth-1 subtrees) from their center.
  function computeGroupExtents(groupChildren: DescendantNode[]): [number, number] {
    if (groupChildren.length === 0) return [BOX_W / 2, BOX_W / 2];
    const n = groupChildren.length;
    const childExts = groupChildren.map(c => subtreeExtents(c, 1));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = n > 1 ? offsets[n - 1] : 0;
    return [
      Math.max(BOX_W / 2, totalSpan / 2 + childExts[0][0]),
      Math.max(BOX_W / 2, totalSpan / 2 + childExts[n - 1][1]),
    ];
  }

  // Build relative group infos: anchor offset from focalCX (positive=right, negative=left),
  // sorted left-to-right. Only non-empty, non-collapsed groups affect layout.
  interface RelGroupInfo {
    coParentId: string | null;
    children: DescendantNode[];
    anchorOffset: number; // relative to focalCX (positive=right, negative=left)
    gLeft: number;
    gRight: number;
  }
  const relGroupInfos: RelGroupInfo[] = [...focalChildGroupMap.entries()]
    .filter(([coParentId, ch]) =>
      ch.length > 0 && !collapsed.has(`${focalId}:down:${coParentId ?? 'solo'}`),
    )
    .map(([coParentId, children]) => {
      const spouseIdx = effectiveSpouses.findIndex(s => s.id === coParentId);
      const anchorOffset = spouseIdx >= 0
        ? (spouseOnLeft ? -junctionOffsetOf(spouseIdx) : junctionOffsetOf(spouseIdx))
        : 0;
      const [gLeft, gRight] = computeGroupExtents(children);
      return { coParentId, children, anchorOffset, gLeft, gRight };
    })
    .sort((a, b) => a.anchorOffset - b.anchorOffset);

  // Pack groups left-to-right: each prefers its anchor offset, but shifts right to avoid overlap.
  const relativeCenterOffsets: number[] = [];
  for (let i = 0; i < relGroupInfos.length; i++) {
    const g = relGroupInfos[i];
    let co = g.anchorOffset;
    if (i > 0) {
      const prev = relGroupInfos[i - 1];
      co = Math.max(co, relativeCenterOffsets[i - 1] + prev.gRight + V_GAP + g.gLeft);
    }
    relativeCenterOffsets.push(co);
  }

  // Compute total descendant extents from focalCX using packed positions.
  let descLeftFromFocal = BOX_W / 2;
  let descRightFromFocal = BOX_W / 2;
  for (let i = 0; i < relGroupInfos.length; i++) {
    const { gLeft, gRight } = relGroupInfos[i];
    const co = relativeCenterOffsets[i];
    descLeftFromFocal  = Math.max(descLeftFromFocal,  Math.max(0, gLeft  - co));
    descRightFromFocal = Math.max(descRightFromFocal, Math.max(0, co + gRight));
  }

  // Extra space needed on the spouse side (left or right depending on orientation).
  const spouseBoxesExtent = effectiveSpouses.length > 0
    ? BOX_W + H_GAP + (effectiveSpouses.length - 1) * (BOX_W + V_GAP) + BOX_W / 2
    : 0;

  // Extra space needed for siblings (on opposite side from spouses).
  const siblingBoxesExtent = effectiveSiblings.length > 0
    ? BOX_W + H_GAP + (effectiveSiblings.length - 1) * (BOX_W + V_GAP) + BOX_W / 2
    : 0;

  // Place focal far enough from the left edge that nothing clips.
  // Left side can contain: ancestor extent, descendant extent, spouses (if female), siblings (if male/default).
  const leftExtents = [ancLeftFromFocal, descLeftFromFocal];
  if (spouseOnLeft) leftExtents.push(spouseBoxesExtent);
  if (siblingsOnLeft) leftExtents.push(siblingBoxesExtent);
  const focalCX = PAD + Math.max(...leftExtents);

  const rightExtents = [ancRightFromFocal, descRightFromFocal];
  if (!spouseOnLeft && effectiveSpouses.length > 0) rightExtents.push(spouseBoxesExtent);
  if (!siblingsOnLeft) rightExtents.push(siblingBoxesExtent);
  const rightNeeded = Math.max(...rightExtents);
  const svgWidth = focalCX + rightNeeded + PAD;

  // Absolute CX of ancestor k
  const ancestorCX = (k: number): number => focalCX - focalRelCX + ancestorRelCX(k);

  // ── Place ancestor boxes ─────────────────────────────────────────────────

  for (const [k, person] of ancestorNodes) {
    const g = Math.floor(Math.log2(k));
    boxes.push({
      person,
      isFocal: k === 1,
      x: ancestorCX(k) - BOX_W / 2,
      y: ancestorRowY(g),
      w: BOX_W,
      h: BOX_H,
    });
  }

  // ── Ancestor connector lines ─────────────────────────────────────────────
  // For each non-top ancestor, draw lines from it upward toward its parents.

  for (const [k] of ancestorNodes) {
    const g = Math.floor(Math.log2(k));
    if (g >= A) continue; // top generation has no parents in tree

    const fatherK = k * 2;
    const motherK = k * 2 + 1;
    const father  = ancestorNodes.get(fatherK);
    const mother  = ancestorNodes.get(motherK);
    if (!father && !mother) continue;

    const kCX   = ancestorCX(k);
    const kRowY = ancestorRowY(g);
    // Fork is midway between k's row top and parent's row bottom
    const forkY = kRowY - GEN_GAP / 2;

    // Vertical line upward from k to fork
    lines.push({ x1: kCX, y1: kRowY, x2: kCX, y2: forkY });

    const pCXs = ([father ? ancestorCX(fatherK) : null, mother ? ancestorCX(motherK) : null]
      .filter((cx): cx is number => cx !== null));

    if (pCXs.length > 1) {
      lines.push({ x1: Math.min(...pCXs), y1: forkY, x2: Math.max(...pCXs), y2: forkY });
    }

    const parentRowBottom = ancestorRowY(g + 1) + BOX_H;
    for (const pcx of pCXs) {
      lines.push({ x1: pcx, y1: forkY, x2: pcx, y2: parentRowBottom });
    }
  }

  // ── Descendant subtree layout ────────────────────────────────────────────

  // CX of the i-th spouse. When focal is female the spouse goes LEFT of focal.
  const spouseCXOf = (i: number) => spouseOnLeft
    ? focalCX - BOX_W - H_GAP - i * (BOX_W + V_GAP)
    : focalCX + BOX_W + H_GAP + i * (BOX_W + V_GAP);

  // CX of the couple-junction for spouse at index i (midpoint between focal and that spouse).
  const coupleJunctionCXOf = (i: number) => spouseOnLeft
    ? focalCX - junctionOffsetOf(i)
    : focalCX + junctionOffsetOf(i);

  // placeDescendants: recursively place descendant boxes and connector lines (depth >= 1 only).
  function placeDescendants(node: DescendantNode, depth: number, nodeCX: number): void {
    boxes.push({
      person:  node.person,
      isFocal: false,
      x: nodeCX - BOX_W / 2,
      y: descRowY(depth),
      w: BOX_W,
      h: BOX_H,
    });

    if (depth < M && node.children.length > 0 && !collapsed.has(`${node.person.id}:down`)) {
      const rowY  = descRowY(depth);
      const forkY = rowY + BOX_H + GEN_GAP / 2;

      lines.push({ x1: nodeCX, y1: rowY + BOX_H, x2: nodeCX, y2: forkY });

      const n = node.children.length;
      const childExts = node.children.map(c => subtreeExtents(c, depth + 1));
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
      for (let ci = 0; ci < n; ci++) {
        lines.push({ x1: childCXs[ci], y1: forkY, x2: childCXs[ci], y2: descRowY(depth + 1) });
        placeDescendants(node.children[ci], depth + 1, childCXs[ci]);
      }
    }
  }

  // Place focal child groups using pre-computed packed center offsets (relGroupInfos).
  // When a group is shifted away from its preferred anchor, an L-shaped connector is drawn.
  {
    const forkY = focalRowY + BOX_H + GEN_GAP / 2;
    const bendY = focalRowY + BOX_H + GEN_GAP / 4; // bend point for L-connectors

    for (let gi = 0; gi < relGroupInfos.length; gi++) {
      const g = relGroupInfos[gi];
      const { coParentId, children } = g;
      const spouseIdx  = effectiveSpouses.findIndex(s => s.id === coParentId);
      const anchorCX   = focalCX + g.anchorOffset;
      const lineStartY = spouseIdx >= 0 ? focalRowY + BOX_H / 2 : focalRowY + BOX_H;
      const centerCX   = focalCX + relativeCenterOffsets[gi];

      // Connector from anchor down to group's actual center (straight or L-shaped).
      if (Math.abs(anchorCX - centerCX) > 1) {
        lines.push({ x1: anchorCX, y1: lineStartY, x2: anchorCX, y2: bendY });
        lines.push({ x1: anchorCX, y1: bendY,      x2: centerCX, y2: bendY });
        lines.push({ x1: centerCX, y1: bendY,      x2: centerCX, y2: forkY });
      } else {
        lines.push({ x1: centerCX, y1: lineStartY, x2: centerCX, y2: forkY });
      }

      // Place children centred at centerCX.
      const n = children.length;
      const childExts = children.map(c => subtreeExtents(c, 1));
      const offsets: number[] = [0];
      for (let i = 1; i < n; i++) {
        offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
      }
      const totalSpan  = n > 1 ? offsets[n - 1] : 0;
      const leftmostCX = centerCX - totalSpan / 2;
      const childCXs   = offsets.map(o => leftmostCX + o);

      if (n > 1) {
        lines.push({ x1: childCXs[0], y1: forkY, x2: childCXs[n - 1], y2: forkY });
      }
      for (let ci = 0; ci < n; ci++) {
        lines.push({ x1: childCXs[ci], y1: forkY, x2: childCXs[ci], y2: descRowY(1) });
        placeDescendants(children[ci], 1, childCXs[ci]);
      }
    }
  }

  if (effectiveSpouses.length > 0) {
    const lineY = focalRowY + BOX_H / 2;
    const lastSpouseCX = spouseCXOf(effectiveSpouses.length - 1);
    // Horizontal marriage line: spans from focal edge to outermost spouse edge.
    lines.push({
      x1: spouseOnLeft ? lastSpouseCX - BOX_W / 2 : focalCX + BOX_W / 2,
      y1: lineY,
      x2: spouseOnLeft ? focalCX + BOX_W / 2 : lastSpouseCX + BOX_W / 2,
      y2: lineY,
    });
    for (let i = 0; i < effectiveSpouses.length; i++) {
      boxes.push({
        person:  effectiveSpouses[i],
        isFocal: false,
        x: spouseCXOf(i) - BOX_W / 2,
        y: focalRowY,
        w: BOX_W,
        h: BOX_H,
      });
    }
  }

  // ── Sibling placement ─────────────────────────────────────────────────────
  // Siblings go on the opposite side from spouses, at the same row as focal.
  // Connected to parents above via the parent fork.

  // CX of the i-th sibling.
  const siblingCXOf = (i: number) => siblingsOnLeft
    ? focalCX - BOX_W - H_GAP - i * (BOX_W + V_GAP)
    : focalCX + BOX_W + H_GAP + i * (BOX_W + V_GAP);

  if (effectiveSiblings.length > 0) {
    for (let i = 0; i < effectiveSiblings.length; i++) {
      boxes.push({
        person:  effectiveSiblings[i],
        isFocal: false,
        x: siblingCXOf(i) - BOX_W / 2,
        y: focalRowY,
        w: BOX_W,
        h: BOX_H,
      });
    }

    // Connect siblings + focal to parents via a shared fork.
    // The fork goes from the parent row bottom → forkY (midpoint) → fans to all children at focal row.
    if (A >= 1) {
      const parentForkY = focalRowY - GEN_GAP / 2;
      const allChildCXs = [focalCX];
      for (let i = 0; i < effectiveSiblings.length; i++) {
        allChildCXs.push(siblingCXOf(i));
      }
      const minCX = Math.min(...allChildCXs);
      const maxCX = Math.max(...allChildCXs);

      // Horizontal line spanning all children at fork level
      lines.push({ x1: minCX, y1: parentForkY, x2: maxCX, y2: parentForkY });

      // Vertical drops from fork to each sibling box top
      for (let i = 0; i < effectiveSiblings.length; i++) {
        const scx = siblingCXOf(i);
        lines.push({ x1: scx, y1: parentForkY, x2: scx, y2: focalRowY });
      }
    }
  }

  // ── SVG height ───────────────────────────────────────────────────────────

  const deepestDescRow = M > 0 && descendantRoot.children.length > 0
    ? descRowY(M)
    : focalRowY;
  // Add 20px below deepest box: 10px to button centre + ~8px button radius + 2px margin.
  const svgHeight = deepestDescRow + BOX_H + 20 + PAD;

  // ── Collapse buttons ─────────────────────────────────────────────────────

  // Index all descendant nodes for button generation
  const descNodeMap = new Map<string, DescendantNode>();
  function indexDescendants(node: DescendantNode): void {
    descNodeMap.set(node.person.id, node);
    for (const child of node.children) indexDescendants(child);
  }
  indexDescendants(descendantRoot);

  const ancestorHasMore = tree.ancestors.hasMoreAncestors ?? new Set<number>();
  const collapseButtons: CollapseButton[] = [];

  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k !== undefined) {
      // Ancestor or focal box
      if (k === 1) {
        // Focal: one ↓ button per child group, positioned at the group's anchor CX.
        for (const [coParentId, groupChildren] of focalChildGroupMap) {
          if (groupChildren.length === 0) continue;
          const spouseIdx = effectiveSpouses.findIndex(s => s.id === coParentId);
          const btnCX = spouseIdx >= 0 ? coupleJunctionCXOf(spouseIdx) : focalCX;
          const groupKey = `${focalId}:down:${coParentId ?? 'solo'}`;
          collapseButtons.push({
            personId: focalId, direction: 'down',
            cx: btnCX, cy: box.y + BOX_H + 10,
            isExpanded: !collapsed.has(groupKey),
            isLoadMore: false,
            coParentId,
          });
        }
        if (focalChildGroupMap.size === 0 && descendantRoot.hasMoreChildren) {
          collapseButtons.push({
            personId: focalId, direction: 'down',
            cx: focalCX, cy: box.y + BOX_H + 10,
            isExpanded: false,
            isLoadMore: true,
            coParentId: null,
          });
        }
        if (spouses.length > 0) {
          const spouseDir = focalIsFemale ? 'left' : 'right';
          const spouseBtnCX = focalIsFemale ? box.x - 10 : box.x + BOX_W + 10;
          collapseButtons.push({
            personId: box.person.id, direction: spouseDir,
            cx: spouseBtnCX, cy: box.y + BOX_H / 2,
            isExpanded: !collapsed.has(`${box.person.id}:right`) && !collapsed.has(`${box.person.id}:left`),
            isLoadMore: false,
          });
        }
        if (siblings.length > 0) {
          const sibBtnCX = siblingsOnLeft ? box.x - 10 : box.x + BOX_W + 10;
          // If spouse button already occupies this side, offset sibling button vertically.
          const sibBtnCY = (spouses.length > 0 && siblingsOnLeft === focalIsFemale)
            ? box.y + BOX_H / 2 + 18  // below the spouse button
            : box.y + BOX_H / 2;
          collapseButtons.push({
            personId: box.person.id, direction: siblingDir,
            cx: sibBtnCX, cy: sibBtnCY,
            isExpanded: !collapsed.has(siblingCollapseKey),
            isLoadMore: false,
            coParentId: '__siblings__',
          });
        }
      } else {
        // Ancestor: ↑ if parents exist in original tree, or load-more if hasMoreAncestors
        const hasParents = originalAncestorNodes.has(k * 2) || originalAncestorNodes.has(k * 2 + 1);
        if (hasParents) {
          collapseButtons.push({
            personId: box.person.id, direction: 'up',
            cx: box.x + BOX_W / 2, cy: box.y - 10,
            isExpanded: !collapsed.has(`${box.person.id}:up`),
            isLoadMore: false,
          });
        } else if (ancestorHasMore.has(k)) {
          collapseButtons.push({
            personId: box.person.id, direction: 'up',
            cx: box.x + BOX_W / 2, cy: box.y - 10,
            isExpanded: false,
            isLoadMore: true,
          });
        }
      }
    } else {
      // Descendant box
      const descNode = descNodeMap.get(box.person.id);
      if (descNode) {
        if (descNode.children.length > 0) {
          collapseButtons.push({
            personId: box.person.id, direction: 'down',
            cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
            isExpanded: !collapsed.has(`${box.person.id}:down`),
            isLoadMore: false,
          });
        } else if (descNode.hasMoreChildren) {
          collapseButtons.push({
            personId: box.person.id, direction: 'down',
            cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
            isExpanded: false,
            isLoadMore: true,
          });
        }
      }
    }
  }

  return { boxes, lines, svgWidth, svgHeight, collapseButtons, placeholders: [], placeholderLines: [] };
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

const TL_LEFT_MARGIN = 164;
const TL_RIGHT_MARGIN = 30;
const TL_TOP_PAD = 20;
const TL_BAR_H = 22;
const TL_ROW_H = 36;
const TL_SVG_W = 800;
const TL_AXIS_H = 30;

export function computeTimelineLayout(entries: TimelineEntry[], currentYear: number): TimelineLayout {
  const years = entries
    .flatMap(e => [yearFromDate(e.person.birthDate), yearFromDate(e.person.deathDate)])
    .filter((y): y is number => y !== null);

  let minYear: number;
  let maxYear: number;
  if (years.length === 0) {
    minYear = currentYear - 50;
    maxYear = currentYear;
  } else if (years.length === 1) {
    minYear = years[0] - 10;
    maxYear = Math.max(currentYear, years[0] + 10);
  } else {
    minYear = Math.min(...years) - 5;
    maxYear = Math.max(...years, currentYear) + 5;
  }

  minYear = Math.floor(minYear / 10) * 10;
  maxYear = Math.ceil(maxYear / 10) * 10;

  const sorted = [...entries].sort((a, b) => {
    const ay = yearFromDate(a.person.birthDate) ?? Infinity;
    const by = yearFromDate(b.person.birthDate) ?? Infinity;
    return ay - by;
  });

  const chartW = TL_SVG_W - TL_LEFT_MARGIN - TL_RIGHT_MARGIN;
  const scale = chartW / (maxYear - minYear);
  const xOfYear = (year: number) => TL_LEFT_MARGIN + (year - minYear) * scale;

  const bars: BarLayout[] = sorted.map((entry, i) => {
    const birthYear = yearFromDate(entry.person.birthDate);
    const deathYear = yearFromDate(entry.person.deathDate);
    const isOpen = deathYear === null;
    const hasNoDate = birthYear === null;
    const startYear = birthYear ?? minYear;
    const endYear = isOpen ? currentYear : (deathYear ?? currentYear);
    const x = xOfYear(startYear);
    const endX = xOfYear(endYear);
    return {
      person: entry.person,
      isFocal: entry.isFocal,
      x, y: TL_TOP_PAD + i * TL_ROW_H,
      w: Math.max(endX - x, 4),
      h: TL_BAR_H,
      isOpen,
      hasNoDate,
    };
  });

  const ticks: TickMark[] = [];
  for (let y = minYear; y <= maxYear; y += 10) {
    ticks.push({ x: xOfYear(y), year: y });
  }

  const axisY = TL_TOP_PAD + sorted.length * TL_ROW_H + 10;
  const todayX = xOfYear(currentYear);
  const svgHeight = axisY + TL_AXIS_H;

  return { bars, ticks, todayX, svgWidth: TL_SVG_W, svgHeight, axisY };
}
