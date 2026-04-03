// src/renderer/utils/chartLayout.ts
// Pure layout algorithms for genealogy charts — no IPC, no DOM, fully unit-testable.

export interface PersonNode {
  id: string;
  givenName: string | null;
  surname: string | null;
  preferredName: string | null;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthYear: number | null;
  deathYear: number | null;
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
 */
export interface PedigreeTree {
  nodes: Map<number, PersonNode>;
  generations: number;
}

/** Recursive descendant tree node. */
export interface DescendantNode {
  person: PersonNode;
  children: DescendantNode[];
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
export const BOX_H = 44;
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
    if (collapsed.has(`${person.id}:up`)) {
      removeSubtree(prunedNodes, k * 2);
      removeSubtree(prunedNodes, k * 2 + 1);
    }
  }

  const nodes = prunedNodes;
  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  const totalLeaves = 1 << (G - 1); // 2^(G-1)

  const svgWidth  = PAD + G * BOX_W + (G - 1) * H_GAP + PAD;
  const svgHeight = PAD + totalLeaves * ROW_H - V_GAP + PAD;

  const genXOf = (g: number) => PAD + g * (BOX_W + H_GAP);

  const centerYOf = (k: number): number => {
    const g = Math.floor(Math.log2(k));
    const slotsPerPerson = totalLeaves >> g;
    const pos = k - (1 << g);
    return PAD + ((pos + 0.5) * slotsPerPerson - 0.5) * ROW_H + BOX_H / 2;
  };

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

  // Generate collapse buttons: ↑ button on right side of each box with parents in original tree
  const collapseButtons: CollapseButton[] = [];
  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k === undefined) continue;
    const hasParents = originalNodes.has(k * 2) || originalNodes.has(k * 2 + 1);
    if (hasParents) {
      collapseButtons.push({
        personId: box.person.id,
        direction: 'up',
        cx: box.x + BOX_W + 10,
        cy: box.y + BOX_H / 2,
        isExpanded: !collapsed.has(`${box.person.id}:up`),
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
  const effectiveDescRoot = collapsed.has(`${focalId}:down`)
    ? { person: descendantRoot.person, children: [] as DescendantNode[] }
    : descendantRoot;
  const effectiveSpouses = collapsed.has(`${focalId}:right`) ? [] : spouses;

  const A = generations - 1; // ancestor levels above focal

  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  // ── Ancestor geometry ────────────────────────────────────────────────────

  const totalAncestorLeaves = 1 << A; // 2^A
  // Width of the ancestor section (content, no padding)
  const ancestorSectionWidth = totalAncestorLeaves * (BOX_W + V_GAP) - V_GAP;

  // ── Descendant geometry ──────────────────────────────────────────────────

  function leafCount(node: DescendantNode, depth: number): number {
    if (depth >= M || node.children.length === 0) return 1;
    return node.children.reduce((sum, child) => sum + leafCount(child, depth + 1), 0);
  }

  const totalDescLeaves  = M > 0 ? leafCount(effectiveDescRoot, 0) : 1;
  const descSectionWidth = totalDescLeaves * (BOX_W + V_GAP) - V_GAP;

  // ── SVG dimensions ───────────────────────────────────────────────────────

  // baseSvgWidth centres the ancestor/descendant layout; focalCX is fixed at its midpoint.
  // svgWidth may be wider if spouses extend past the right edge.
  const baseSvgWidth = Math.max(ancestorSectionWidth, descSectionWidth) + 2 * PAD;

  // Shift the narrower section so both are centered at baseSvgWidth/2
  const ancestorOffset = (baseSvgWidth - 2 * PAD - ancestorSectionWidth) / 2;

  // Row Y helpers
  // Ancestor rows count down from top; focal = PAD + A*(BOX_H+GEN_GAP)
  const focalRowY = PAD + A * (BOX_H + GEN_GAP);
  const ancestorRowY = (g: number) => PAD + (A - g) * (BOX_H + GEN_GAP);
  const descRowY     = (d: number) => focalRowY + d * (BOX_H + GEN_GAP);

  // Center X of ancestor with ahnentafel k
  const ancestorCX = (k: number): number => {
    const g = Math.floor(Math.log2(k));
    const slotsPerPerson = totalAncestorLeaves >> g;
    const pos = k - (1 << g);
    const centerSlot = (pos + 0.5) * slotsPerPerson - 0.5;
    return PAD + ancestorOffset + centerSlot * (BOX_W + V_GAP) + BOX_W / 2;
  };

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

  const focalCX = baseSvgWidth / 2;

  // CX of the i-th spouse (0-indexed): one H_GAP from focal, then V_GAP between.
  // Defined here so coupleJunctionX can reference it before the spouse-box loop.
  const spouseCXOf = (i: number) => focalCX + BOX_W + H_GAP + i * (BOX_W + V_GAP);

  function placeDescendants(node: DescendantNode, depth: number, leftX: number, depth0StartY?: number): void {
    const subWidth = leafCount(node, depth) * (BOX_W + V_GAP) - V_GAP;
    const nodeCX   = leftX + subWidth / 2;

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
      const rowY  = depth === 0 ? focalRowY : descRowY(depth);
      const forkY = rowY + BOX_H + GEN_GAP / 2;
      // At depth 0 with a spouse, connect from the marriage line (mid-box) not the box bottom
      const lineStartY = depth === 0 && depth0StartY !== undefined ? depth0StartY : rowY + BOX_H;

      lines.push({ x1: nodeCX, y1: lineStartY, x2: nodeCX, y2: forkY });

      // Compute child center Xs
      const childCXs: number[] = [];
      let cLeft = leftX;
      for (const child of node.children) {
        const cWidth = leafCount(child, depth + 1) * (BOX_W + V_GAP) - V_GAP;
        childCXs.push(cLeft + cWidth / 2);
        cLeft += cWidth + V_GAP;
      }

      if (childCXs.length > 1) {
        lines.push({ x1: childCXs[0], y1: forkY, x2: childCXs[childCXs.length - 1], y2: forkY });
      }

      cLeft = leftX;
      for (let ci = 0; ci < node.children.length; ci++) {
        const child  = node.children[ci];
        const cWidth = leafCount(child, depth + 1) * (BOX_W + V_GAP) - V_GAP;
        lines.push({ x1: childCXs[ci], y1: forkY, x2: childCXs[ci], y2: descRowY(depth + 1) });
        placeDescendants(child, depth + 1, cLeft);
        cLeft += cWidth + V_GAP;
      }
    }
  }

  // When a single spouse is present, drop the descendant tree from the midpoint
  // between focal and that spouse (standard genealogy-tree convention: children
  // come from the couple line, not from one parent alone).
  const coupleJunctionX = effectiveSpouses.length > 0
    ? (focalCX + spouseCXOf(0)) / 2
    : focalCX;
  const descStartX = coupleJunctionX - descSectionWidth / 2;
  // When there's a spouse, the marriage line is at BOX_H/2; start the children
  // connector there so it visually meets the marriage line without a gap.
  const coupleLineY = effectiveSpouses.length > 0 ? focalRowY + BOX_H / 2 : undefined;
  placeDescendants(effectiveDescRoot, 0, descStartX, coupleLineY);

  // ── Spouse boxes and connectors ──────────────────────────────────────────
  // Spouses are placed to the right of focal at the same row, connected by a
  // horizontal line. Each marriage is a separate box; multiple spouses chain
  // rightward so the history of remarriages reads left-to-right.

  const spouseRightEdge = effectiveSpouses.length > 0
    ? spouseCXOf(effectiveSpouses.length - 1) + BOX_W / 2 + PAD
    : 0;

  const svgWidth = Math.max(baseSvgWidth, spouseRightEdge);

  if (effectiveSpouses.length > 0) {
    const lineY = focalRowY + BOX_H / 2;
    // Single horizontal line from focal's right edge through all spouse centres
    lines.push({
      x1: focalCX + BOX_W / 2,
      y1: lineY,
      x2: spouseCXOf(effectiveSpouses.length - 1) + BOX_W / 2,
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
  const svgHeight = deepestDescRow + BOX_H + PAD;

  // ── Collapse buttons ─────────────────────────────────────────────────────

  const collapseButtons: CollapseButton[] = [];

  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k === undefined) continue; // spouse box

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
        collapseButtons.push({
          personId: box.person.id, direction: 'right',
          cx: box.x + BOX_W + 10, cy: box.y + BOX_H / 2,
          isExpanded: !collapsed.has(`${box.person.id}:right`),
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
    .flatMap(e => [e.person.birthYear, e.person.deathYear])
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
    const ay = a.person.birthYear ?? Infinity;
    const by = b.person.birthYear ?? Infinity;
    return ay - by;
  });

  const chartW = TL_SVG_W - TL_LEFT_MARGIN - TL_RIGHT_MARGIN;
  const scale = chartW / (maxYear - minYear);
  const xOfYear = (year: number) => TL_LEFT_MARGIN + (year - minYear) * scale;

  const bars: BarLayout[] = sorted.map((entry, i) => {
    const { birthYear, deathYear } = entry.person;
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
