// Hourglass chart layout algorithm — operates on TreePerson graph.
// Converts HourglassTree → TreePerson, injects outlines, then lays out uniformly.

import type { HourglassTree, TreePerson, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD } from './constants';
import { buildHourglassTree, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

/** Find a TreePerson by ID in the graph (cycle-safe). */
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

/** Compute max descendant depth of a DescendantNode tree (used by HourglassChart for lazy loading). */
export function maxDescendantDepth(node: { children: { children: unknown[] }[] }): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(c => maxDescendantDepth(c as typeof node)));
}

export function computeHourglassLayout(
  tree: HourglassTree,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {
  // ── 1. Build TreePerson graph ───────────────────────────────────────────────
  const root = buildHourglassTree(tree);
  if (selectedPersonId) injectOutlines(root, selectedPersonId);

  // ── 2. Collapse filtering ──────────────────────────────────────────────────
  // Record original counts before pruning (for collapse buttons)
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

    // Prune collapsed parents (but never prune placeholders)
    if (collapsed.has(`${node.person.id}:up`)) {
      node.parents = node.parents.filter(p => p.isPlaceholder);
    }

    // Prune collapsed children
    // Support per-coParent collapse: ${id}:down:${coParentId}
    const downKeys = [...collapsed].filter(k => k.startsWith(`${node.person.id}:down`));
    if (downKeys.length > 0) {
      for (const key of downKeys) {
        const parts = key.split(':');
        if (parts.length === 2) {
          // Simple :down — collapse all children
          node.children = node.children.filter(c => c.isPlaceholder);
        } else {
          // :down:coParentId — collapse only children with that coParentId
          const coParentId = parts[2] === 'solo' ? null : parts[2];
          node.children = node.children.filter(c =>
            c.isPlaceholder || (c.coParentId ?? null) !== coParentId
          );
        }
      }
    }

    // Prune collapsed spouses
    if (collapsed.has(`${node.person.id}:right`) || collapsed.has(`${node.person.id}:left`)) {
      node.spouses = node.spouses.filter(s => s.isPlaceholder);
    }

    // Prune siblings (children of focal's parents marked with __siblings__)
    const siblingKey = `${node.person.id}:${node.person.sex === 'F' ? 'right' : 'left'}:__siblings__`;
    if (collapsed.has(siblingKey) && node.isFocal) {
      // Siblings are children of focal's parents — we handle this at the parent level
    }

    // Recurse
    for (const p of node.parents) recordAndPrune(p, visited);
    for (const c of node.children) recordAndPrune(c, visited);
    for (const s of node.spouses) recordAndPrune(s, visited);
  }

  recordAndPrune(root);

  // Handle sibling collapse
  const focalId = root.person.id;
  const focalIsFemale = root.person.sex === 'F';
  const siblingDir = focalIsFemale ? 'right' : 'left';
  if (collapsed.has(`${focalId}:${siblingDir}:__siblings__`)) {
    root.siblings = (root.siblings ?? []).filter(s => s.isPlaceholder);
  }

  // ── 3. Compute geometry ────────────────────────────────────────────────────

  // Max ancestor depth from focal
  function maxAncestorDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    if (node.parents.length === 0) return 0;
    return 1 + Math.max(...node.parents.map(p => maxAncestorDepth(p, visited)));
  }

  // Max descendant depth from focal
  function maxDescDepth(node: TreePerson, visited = new Set<string>()): number {
    if (visited.has(node.person.id)) return 0;
    visited.add(node.person.id);
    if (node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(c => maxDescDepth(c, visited)));
  }

  const A = maxAncestorDepth(root);
  const D = maxDescDepth(root);

  // Row Y helpers
  const ancestorTopPad = PAD + 8;
  const focalRowY = ancestorTopPad + A * (BOX_H + GEN_GAP);
  const ancestorRowY = (depth: number) => focalRowY - depth * (BOX_H + GEN_GAP);
  const descRowY = (depth: number) => focalRowY + depth * (BOX_H + GEN_GAP);

  // ── Ancestor subtree width (upward) ──
  // Leaf ancestors get BOX_W width. Internal nodes = sum of parent widths + gaps.
  const ancWidthCache = new Map<string, number>();
  function ancestorWidth(node: TreePerson): number {
    if (ancWidthCache.has(node.person.id)) return ancWidthCache.get(node.person.id)!;
    let w: number;
    if (node.parents.length === 0) {
      w = BOX_W;
    } else {
      w = node.parents.reduce((sum, p) => sum + ancestorWidth(p), 0)
        + (node.parents.length - 1) * V_GAP;
      w = Math.max(w, BOX_W);
    }
    ancWidthCache.set(node.person.id, w);
    return w;
  }

  // Relative CX of a node within its ancestor subtree
  const ancRelCXCache = new Map<string, number>();
  function ancestorRelCX(node: TreePerson): number {
    if (ancRelCXCache.has(node.person.id)) return ancRelCXCache.get(node.person.id)!;
    let cx: number;
    if (node.parents.length === 0) {
      cx = BOX_W / 2;
    } else {
      const parentCXs: number[] = [];
      let x = 0;
      for (const p of node.parents) {
        parentCXs.push(x + ancestorRelCX(p));
        x += ancestorWidth(p) + V_GAP;
      }
      cx = parentCXs.reduce((a, b) => a + b, 0) / parentCXs.length;
    }
    ancRelCXCache.set(node.person.id, cx);
    return cx;
  }

  const focalAncWidth = ancestorWidth(root);
  const focalAncRelCX = ancestorRelCX(root);
  const ancLeftFromFocal = focalAncRelCX;
  const ancRightFromFocal = focalAncWidth - focalAncRelCX;

  // ── Descendant subtree extents (downward) ──
  // Returns [leftExtent, rightExtent] from the node's center X.
  const descExtCache = new Map<string, [number, number]>();
  function descExtents(node: TreePerson): [number, number] {
    if (descExtCache.has(node.person.id)) return descExtCache.get(node.person.id)!;
    const half = BOX_W / 2;
    if (node.children.length === 0) {
      descExtCache.set(node.person.id, [half, half]);
      return [half, half];
    }
    const n = node.children.length;
    const childExts = node.children.map(c => descExtents(c));
    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];
    const leftExt = Math.max(half, totalSpan / 2 + childExts[0][0]);
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]);
    descExtCache.set(node.person.id, [leftExt, rightExt]);
    return [leftExt, rightExt];
  }

  // Focal's descendant extents — also consider children grouped by co-parent
  const [descLeft, descRight] = descExtents(root);

  // ── Spouse extents ──
  // Spouses go beside the person. Male → right, Female → left.
  function spouseExtent(node: TreePerson): number {
    if (node.spouses.length === 0) return 0;
    return BOX_W + H_GAP + (node.spouses.length - 1) * (BOX_W + V_GAP) + BOX_W / 2;
  }

  // For focal: spouses on one side, siblings (children of parents) on the other
  const spouseOnLeft = focalIsFemale && root.spouses.length > 0;
  const siblingsOnLeft = !focalIsFemale;

  // Siblings from the focal's siblings list (after collapse filtering)
  const siblings: TreePerson[] = root.siblings ?? [];

  const siblingExtent = siblings.length > 0
    ? BOX_W + H_GAP + (siblings.length - 1) * (BOX_W + V_GAP) + BOX_W / 2
    : 0;

  const focalSpouseExtent = spouseExtent(root);

  // ── Focal CX ──
  const leftExtents = [ancLeftFromFocal, descLeft];
  if (spouseOnLeft) leftExtents.push(focalSpouseExtent);
  if (siblingsOnLeft) leftExtents.push(siblingExtent);

  const rightExtents = [ancRightFromFocal, descRight];
  if (!spouseOnLeft && root.spouses.length > 0) rightExtents.push(focalSpouseExtent);
  if (!siblingsOnLeft) rightExtents.push(siblingExtent);

  const focalCX = PAD + Math.max(...leftExtents);
  const rightNeeded = Math.max(...rightExtents);
  const svgWidth = focalCX + rightNeeded + PAD;

  // ── 4. Place boxes and lines ───────────────────────────────────────────────
  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  // Place ancestors recursively (upward from a person)
  function placeAncestors(node: TreePerson, nodeCX: number, depth: number): void {
    // Place this node's box
    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: nodeCX - BOX_W / 2,
      y: ancestorRowY(depth),
      w: BOX_W, h: BOX_H,
    });

    if (node.parents.length === 0) return;

    const nodeY = ancestorRowY(depth);
    const forkY = nodeY - GEN_GAP / 2;

    // Position parents above, centered
    const parentWidths = node.parents.map(p => ancestorWidth(p));
    const totalWidth = parentWidths.reduce((s, w) => s + w, 0) + (node.parents.length - 1) * V_GAP;
    let x = nodeCX - totalWidth / 2;

    const parentCXs: number[] = [];
    for (let i = 0; i < node.parents.length; i++) {
      const pw = parentWidths[i];
      const pcx = x + ancestorRelCX(node.parents[i]);
      parentCXs.push(pcx);
      placeAncestors(node.parents[i], pcx, depth + 1);
      x += pw + V_GAP;
    }

    // Connector lines: node → fork → each parent
    lines.push({ x1: nodeCX, y1: nodeY, x2: nodeCX, y2: forkY });
    if (parentCXs.length > 1) {
      lines.push({ x1: Math.min(...parentCXs), y1: forkY, x2: Math.max(...parentCXs), y2: forkY });
    }
    const parentRowBottom = ancestorRowY(depth + 1) + BOX_H;
    for (const pcx of parentCXs) {
      lines.push({ x1: pcx, y1: forkY, x2: pcx, y2: parentRowBottom });
    }
  }

  // Place descendants recursively (downward from a person)
  function placeDescendants(node: TreePerson, nodeCX: number, depth: number): void {
    boxes.push({
      person: node.person,
      isFocal: !!node.isFocal,
      x: nodeCX - BOX_W / 2,
      y: descRowY(depth),
      w: BOX_W, h: BOX_H,
    });

    if (node.children.length === 0) return;

    const rowY = descRowY(depth);
    const forkY = rowY + BOX_H + GEN_GAP / 2;
    lines.push({ x1: nodeCX, y1: rowY + BOX_H, x2: nodeCX, y2: forkY });

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

  // ── Place focal's ancestors (skip focal box — placed separately) ──
  // Place ancestor parents starting from focal
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

  // ── Place focal box ──
  boxes.push({
    person: root.person,
    isFocal: true,
    x: focalCX - BOX_W / 2,
    y: focalRowY,
    w: BOX_W, h: BOX_H,
  });

  // ── Place focal's spouses ──
  const spouseCXOf = (i: number) => spouseOnLeft
    ? focalCX - BOX_W - H_GAP - i * (BOX_W + V_GAP)
    : focalCX + BOX_W + H_GAP + i * (BOX_W + V_GAP);

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
        person: root.spouses[i].person,
        isFocal: false,
        x: spouseCXOf(i) - BOX_W / 2,
        y: focalRowY,
        w: BOX_W, h: BOX_H,
      });
    }
  }

  // ── Place siblings ──
  const siblingCXOf = (i: number) => siblingsOnLeft
    ? focalCX - BOX_W - H_GAP - i * (BOX_W + V_GAP)
    : focalCX + BOX_W + H_GAP + i * (BOX_W + V_GAP);

  if (siblings.length > 0) {
    for (let i = 0; i < siblings.length; i++) {
      const sibCX = siblingCXOf(i);
      const sib = siblings[i];
      boxes.push({
        person: sib.person,
        isFocal: false,
        x: sibCX - BOX_W / 2,
        y: focalRowY,
        w: BOX_W, h: BOX_H,
      });

      // Place sibling's children (from outline injection)
      if (sib.children.length > 0) {
        const forkY = focalRowY + BOX_H + GEN_GAP / 2;
        lines.push({ x1: sibCX, y1: focalRowY + BOX_H, x2: sibCX, y2: forkY });
        for (let ci = 0; ci < sib.children.length; ci++) {
          const childCX = sibCX + (ci - (sib.children.length - 1) / 2) * (BOX_W + V_GAP);
          lines.push({ x1: childCX, y1: forkY, x2: childCX, y2: descRowY(1) });
          boxes.push({
            person: sib.children[ci].person,
            isFocal: false,
            x: childCX - BOX_W / 2,
            y: descRowY(1),
            w: BOX_W, h: BOX_H,
          });
        }
        if (sib.children.length > 1) {
          const firstCX = sibCX - ((sib.children.length - 1) / 2) * (BOX_W + V_GAP);
          const lastCX = sibCX + ((sib.children.length - 1) / 2) * (BOX_W + V_GAP);
          lines.push({ x1: firstCX, y1: forkY, x2: lastCX, y2: forkY });
        }
      }

      // Place sibling's spouses (from outline injection)
      if (sib.spouses.length > 0) {
        const sibIsFemale = sib.person.sex === 'F';
        for (let si = 0; si < sib.spouses.length; si++) {
          const spCX = sibIsFemale
            ? sibCX - BOX_W - H_GAP - si * (BOX_W + V_GAP)
            : sibCX + BOX_W + H_GAP + si * (BOX_W + V_GAP);
          boxes.push({
            person: sib.spouses[si].person,
            isFocal: false,
            x: spCX - BOX_W / 2,
            y: focalRowY,
            w: BOX_W, h: BOX_H,
          });
          // Marriage line
          const lineY = focalRowY + BOX_H / 2;
          lines.push({
            x1: sibIsFemale ? spCX + BOX_W / 2 : sibCX + BOX_W / 2,
            y1: lineY,
            x2: sibIsFemale ? sibCX - BOX_W / 2 : spCX - BOX_W / 2,
            y2: lineY,
          });
        }
      }
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

  // ── Place focal's descendants ──
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

  // ── Place unplaced outlines for selected person ──
  // placeAncestors only handles parents, placeDescendants only handles children.
  // Spouse/child outlines on ancestors or spouse/parent outlines on descendants
  // would be missed. Place them relative to the selected person's box.
  if (selectedPersonId) {
    const selNode = findPersonInTree(root, selectedPersonId);
    const placedIds = new Set(boxes.map(b => b.person.id));
    const selBox = boxes.find(b => b.person.id === selectedPersonId);

    if (selNode && selBox) {
      const selCX = selBox.x + BOX_W / 2;
      const selIsFemale = selNode.person.sex === 'F';

      // Unplaced spouse outlines — place beyond any existing boxes at the same row
      const unplacedSpouses = selNode.spouses.filter(s => !placedIds.has(s.person.id));
      if (unplacedSpouses.length > 0) {
        // Find the edge of existing boxes at this Y level to avoid overlap
        const sameRowBoxes = boxes.filter(b => b.y === selBox.y);
        const rightEdge = Math.max(...sameRowBoxes.map(b => b.x + b.w));
        const leftEdge = Math.min(...sameRowBoxes.map(b => b.x));

        for (let i = 0; i < unplacedSpouses.length; i++) {
          let spX: number;
          if (selIsFemale) {
            spX = leftEdge - H_GAP - BOX_W - i * (BOX_W + V_GAP);
          } else {
            spX = rightEdge + H_GAP + i * (BOX_W + V_GAP);
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

      // Unplaced child outlines — place below the selected person
      const unplacedChildren = selNode.children.filter(c => !placedIds.has(c.person.id));
      if (unplacedChildren.length > 0) {
        const childY = selBox.y + BOX_H + GEN_GAP;
        const forkY = selBox.y + BOX_H + GEN_GAP / 2;

        // Find existing boxes at childY to avoid overlap
        const childRowBoxes = boxes.filter(b => b.y === childY);
        // Place child outline to the right of any existing boxes at that row,
        // or directly below the selected person if nothing is there
        let childX: number;
        if (childRowBoxes.length > 0) {
          const rightEdge = Math.max(...childRowBoxes.map(b => b.x + b.w));
          childX = rightEdge + V_GAP;
        } else {
          childX = selCX - BOX_W / 2;
        }
        const childCX = childX + BOX_W / 2;

        // Stem from selected person down to fork
        lines.push({ x1: selCX, y1: selBox.y + BOX_H, x2: selCX, y2: forkY });
        for (let i = 0; i < unplacedChildren.length; i++) {
          lines.push({ x1: childCX, y1: forkY, x2: childCX, y2: childY });
          boxes.push({
            person: unplacedChildren[i].person,
            isFocal: false,
            x: childX, y: childY,
            w: BOX_W, h: BOX_H,
          });
        }
      }
    }
  }

  // ── SVG dimensions (recalculated after outline placement) ──
  const maxBoxRight = Math.max(...boxes.map(b => b.x + b.w));
  const maxBoxBottom = Math.max(...boxes.map(b => b.y + b.h));
  const minBoxLeft = Math.min(...boxes.map(b => b.x));
  const finalSvgWidth = Math.max(svgWidth, maxBoxRight + PAD);
  const deepestDescRow = D > 0 ? descRowY(D) : focalRowY;
  const svgHeight = Math.max(deepestDescRow + BOX_H + 20 + PAD, maxBoxBottom + 20 + PAD);
  const viewBoxMinX = Math.min(0, minBoxLeft - PAD);

  // ── 5. Collapse buttons ────────────────────────────────────────────────────
  const collapseButtons: CollapseButton[] = [];

  // Walk all placed boxes and generate buttons
  const allPersonIds = new Set(boxes.map(b => b.person.id));

  for (const box of boxes) {
    const pid = box.person.id;
    if (pid.startsWith(PLACEHOLDER_PREFIX)) continue; // no buttons on placeholders

    const origParents = originalParentCount.get(pid) ?? 0;
    const origChildren = originalChildCount.get(pid) ?? 0;
    const origSpouses = originalSpouseCount.get(pid) ?? 0;
    const moreUp = hasMoreUp.get(pid) ?? false;
    const moreDown = hasMoreDown.get(pid) ?? false;

    // Up button (ancestors)
    if (origParents > 0) {
      collapseButtons.push({
        personId: pid, direction: 'up',
        cx: box.x + BOX_W / 2, cy: box.y - 10,
        isExpanded: !collapsed.has(`${pid}:up`),
        isLoadMore: false,
      });
    } else if (moreUp) {
      collapseButtons.push({
        personId: pid, direction: 'up',
        cx: box.x + BOX_W / 2, cy: box.y - 10,
        isExpanded: false, isLoadMore: true,
      });
    }

    // Down button (descendants) — for focal, one per co-parent group
    if (pid === focalId) {
      // Group children by coParentId
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
          isExpanded: !collapsed.has(groupKey),
          isLoadMore: false, coParentId,
        });
      }
      if (groups.size === 0 && moreDown) {
        collapseButtons.push({
          personId: focalId, direction: 'down',
          cx: focalCX, cy: box.y + BOX_H + 10,
          isExpanded: false, isLoadMore: true, coParentId: null,
        });
      }

      // Spouse button
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

      // Sibling button
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
      // Non-focal with children
      collapseButtons.push({
        personId: pid, direction: 'down',
        cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
        isExpanded: !collapsed.has(`${pid}:down`),
        isLoadMore: false,
      });
    } else if (moreDown) {
      collapseButtons.push({
        personId: pid, direction: 'down',
        cx: box.x + BOX_W / 2, cy: box.y + BOX_H + 10,
        isExpanded: false, isLoadMore: true,
      });
    }
  }

  // ── 6. Extract placeholders ────────────────────────────────────────────────
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
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    if (phCenters.has(`${ln.x1},${ln.y1}`) || phCenters.has(`${ln.x2},${ln.y2}`)) {
      placeholderLines.push(ln);
      lines.splice(i, 1);
    }
  }

  return { boxes, lines, svgWidth: finalSvgWidth, svgHeight, viewBoxMinY: 0, collapseButtons, placeholders, placeholderLines };
}
