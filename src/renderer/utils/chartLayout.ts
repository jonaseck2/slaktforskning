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
}

export interface ChartLayout {
  boxes: BoxLayout[];
  lines: Line[];
  svgWidth: number;
  svgHeight: number;
  collapseButtons: CollapseButton[];
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

  const svgWidth = PAD + G * BOX_W + (G - 1) * H_GAP + PAD;

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

  return { boxes, lines, svgWidth, svgHeight, collapseButtons };
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
  const { ancestors, descendantRoot, descendantGenerations: M, spouses = [] } = tree;
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

  const effectiveDescRoot = collapsed.has(`${focalId}:down`)
    ? { person: descendantRoot.person, children: [] as DescendantNode[] }
    : descendantRoot;
  // Spouses may be collapsed via :right key (original) or :left key (female focal).
  const effectiveSpouses = (collapsed.has(`${focalId}:right`) || collapsed.has(`${focalId}:left`)) ? [] : spouses;

  // When the focal person is female, place spouses to the LEFT so the convention
  // "male left, female right" holds regardless of who is currently focal.
  const spouseOnLeft = focalIsFemale && effectiveSpouses.length > 0;

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
  const focalRowY  = PAD + A * (BOX_H + GEN_GAP);
  const ancestorRowY = (g: number) => PAD + (A - g) * (BOX_H + GEN_GAP);
  const descRowY     = (d: number) => focalRowY + d * (BOX_H + GEN_GAP);

  // Compute descendant extents relative to the couple-junction.
  const [compactLeftFromCJ, compactRightFromCJ] =
    M > 0 ? subtreeExtents(effectiveDescRoot, 0) : [BOX_W / 2, BOX_W / 2];

  // Spouse offset: couple-junction sits midway between focal and first spouse.
  const spouseOffset = effectiveSpouses.length > 0 ? (BOX_W + H_GAP) / 2 : 0;

  // Convert to distances from focalCX.
  // When spouseOnLeft the couple-junction is LEFT of focal, so:
  //   descLeft  = spouseOffset + compactLeftFromCJ  (same — junction is left-of-focal)
  //   descRight = compactRightFromCJ - spouseOffset (junction is left, so right shrinks)
  const descLeftFromFocal  = spouseOffset + compactLeftFromCJ;
  const descRightFromFocal = spouseOnLeft
    ? Math.max(BOX_W / 2, compactRightFromCJ - spouseOffset)
    : spouseOffset + compactRightFromCJ;

  // Extra space needed on the spouse side (left or right depending on orientation).
  const spouseBoxesExtent = effectiveSpouses.length > 0
    ? BOX_W + H_GAP + (effectiveSpouses.length - 1) * (BOX_W + V_GAP) + BOX_W / 2
    : 0;

  // Place focal far enough from the left edge that nothing clips.
  // When spouseOnLeft we also need room for the spouse boxes on the left.
  const focalCX = PAD + (spouseOnLeft
    ? Math.max(ancLeftFromFocal, descLeftFromFocal, spouseBoxesExtent)
    : Math.max(ancLeftFromFocal, descLeftFromFocal));
  const rightNeeded = spouseOnLeft
    ? Math.max(ancRightFromFocal, descRightFromFocal)
    : Math.max(ancRightFromFocal, descRightFromFocal, spouseBoxesExtent);
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

  // Couple-junction: midway between focal and first spouse.
  const coupleJunctionX = spouseOnLeft
    ? focalCX - spouseOffset
    : focalCX + spouseOffset;

  // placeDescendants: spaces children using actual subtree extents so that
  // adjacent sibling subtrees never overlap (always exactly V_GAP apart).
  function placeDescendants(node: DescendantNode, depth: number, nodeCX: number, depth0StartY?: number): void {
    // Focal box is already placed by the ancestor loop; skip depth === 0
    if (depth > 0) {
      boxes.push({
        person:  node.person,
        isFocal: false,
        x: nodeCX - BOX_W / 2,
        y: descRowY(depth),
        w: BOX_W,
        h: BOX_H,
      });
    }

    if (depth < M && node.children.length > 0) {
      const childrenCollapsed = depth > 0 && collapsed.has(`${node.person.id}:down`);
      if (!childrenCollapsed) {
        const rowY  = depth === 0 ? focalRowY : descRowY(depth);
        const forkY = rowY + BOX_H + GEN_GAP / 2;
        const lineStartY = depth === 0 && depth0StartY !== undefined ? depth0StartY : rowY + BOX_H;

        lines.push({ x1: nodeCX, y1: lineStartY, x2: nodeCX, y2: forkY });

        const n = node.children.length;
        const childExts = node.children.map(c => subtreeExtents(c, depth + 1));

        // Compute child CX positions: pack subtrees with V_GAP between edges
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
  }

  const descStartX = coupleJunctionX;
  // When there's a spouse, the marriage line is at BOX_H/2; start the children
  // connector there so it visually meets the marriage line without a gap.
  const coupleLineY = effectiveSpouses.length > 0 ? focalRowY + BOX_H / 2 : undefined;
  placeDescendants(effectiveDescRoot, 0, descStartX, coupleLineY); // descStartX = coupleJunctionX

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

  // ── SVG height ───────────────────────────────────────────────────────────

  const deepestDescRow = M > 0 && effectiveDescRoot.children.length > 0
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

  const collapseButtons: CollapseButton[] = [];

  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k !== undefined) {
      // Ancestor or focal box
      if (k === 1) {
        // Focal: ↓ for children, → for spouses
        if (descendantRoot.children.length > 0) {
          collapseButtons.push({
            personId: box.person.id, direction: 'down',
            cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
            isExpanded: !collapsed.has(`${box.person.id}:down`),
          });
        }
        if (spouses.length > 0) {
          // When focal is female the spouse panel is to the LEFT — use :left key.
          const spouseDir = focalIsFemale ? 'left' : 'right';
          const spouseBtnCX = focalIsFemale ? box.x - 10 : box.x + BOX_W + 10;
          collapseButtons.push({
            personId: box.person.id, direction: spouseDir,
            cx: spouseBtnCX, cy: box.y + BOX_H / 2,
            isExpanded: !collapsed.has(`${box.person.id}:right`) && !collapsed.has(`${box.person.id}:left`),
          });
        }
      } else {
        // Ancestor: ↑ if parents exist in original tree
        const hasParents = originalAncestorNodes.has(k * 2) || originalAncestorNodes.has(k * 2 + 1);
        if (hasParents) {
          collapseButtons.push({
            personId: box.person.id, direction: 'up',
            cx: box.x + BOX_W / 2, cy: box.y - 10,
            isExpanded: !collapsed.has(`${box.person.id}:up`),
          });
        }
      }
    } else {
      // Descendant box (spouses are not in descNodeMap, so they're skipped)
      const descNode = descNodeMap.get(box.person.id);
      if (descNode && descNode.children.length > 0) {
        collapseButtons.push({
          personId: box.person.id, direction: 'down',
          cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
          isExpanded: !collapsed.has(`${box.person.id}:down`),
        });
      }
    }
  }

  return { boxes, lines, svgWidth, svgHeight, collapseButtons };
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
