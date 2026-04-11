// Hourglass chart layout algorithm.
// Internally converts HourglassTree → TreePerson graph, then lays out the graph.

import type { PersonNode, DescendantNode, HourglassTree, ChartLayout, BoxLayout, CollapseButton, PlaceholderBox, Line } from './types';
import { BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP, PAD } from './constants';
import { buildHourglassTree, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';

/**
 * Lay out an hourglass chart.
 * Ancestors fan out upward; descendants fan out downward.
 * Both sections are horizontally centered over the focal person.
 */
export function computeHourglassLayout(
  tree: HourglassTree,
  collapsed: Set<string> = new Set(),
  selectedPersonId?: string | null,
): ChartLayout {
  const { ancestors, descendantGenerations: M, spouses = [], siblings = [] } = tree;
  const { generations } = ancestors;
  const originalAncestorNodes = ancestors.nodes;
  const focalPerson = originalAncestorNodes.get(1);
  const focalId = focalPerson?.id ?? '';
  const ancestorHasMore = tree.ancestors.hasMoreAncestors ?? new Set<number>();

  // ── Build TreePerson graph from HourglassTree ──────────────────────────────
  const root = buildHourglassTree(tree);

  // Inject placeholders for the selected person
  if (selectedPersonId) {
    injectOutlines(root, selectedPersonId);
  }

  // ── Map personId → ahnentafel key (for button generation and pruning) ──────
  const personToAhnen = new Map<string, number>();
  for (const [k, person] of originalAncestorNodes) {
    personToAhnen.set(person.id, k);
  }

  // ── Derive outline injections from TreePerson graph into old data structures ──
  // The TreePerson graph has the correct outlines. We extract what was injected
  // and feed it into the ahnentafel/descendant/spouse structures that the layout uses.
  // Future: migrate layout to operate directly on TreePerson.

  const focalIsFemale = focalPerson?.sex === 'F';

  // Spouses may be collapsed via :right key (original) or :left key (female focal).
  const spouseCollapsed = collapsed.has(`${focalId}:right`) || collapsed.has(`${focalId}:left`);
  const effectiveSpouses: PersonNode[] = spouseCollapsed ? [] : [...spouses];

  // Inject spouse placeholder for the selected person
  if (selectedPersonId && !spouseCollapsed) {
    // Find which person in the tree is selected and add spouse outline next to them
    // For now, spouse outlines only render for the focal person (since the old layout
    // only supports spouses for the focal). Non-focal spouse outlines require TreePerson layout.
    if (selectedPersonId === focalId) {
      const spousePh: PersonNode = {
        id: PLACEHOLDER_PREFIX + 'spouse_' + selectedPersonId,
        givenName: null, surname: null, preferredName: null, nickname: null,
        sex: focalIsFemale ? 'M' : 'F', living: false, birthDate: null, deathDate: null,
      };
      if (focalIsFemale) {
        effectiveSpouses.unshift(spousePh); // left for female
      } else {
        effectiveSpouses.push(spousePh); // right for male
      }
    }
  }

  // Siblings on left use 'left' direction key, on right use 'right' direction key — with '__siblings__' co-parent marker.
  const siblingDir: 'left' | 'right' = focalIsFemale ? 'right' : 'left';
  const siblingCollapseKey = `${focalId}:${siblingDir}:__siblings__`;
  const effectiveSiblings = collapsed.has(siblingCollapseKey) ? [] : [...siblings];

  // Group focal's direct children by co-parent ID (set by chartData during fetch).
  const descendantRoot = tree.descendantRoot;
  const focalChildGroupMap = new Map<string | null, DescendantNode[]>();
  for (const child of descendantRoot.children) {
    const key = child.coParentId ?? null;
    const arr = focalChildGroupMap.get(key);
    if (arr) arr.push(child); else focalChildGroupMap.set(key, [child]);
  }

  // Deep-clone descendant tree so child placeholder injection doesn't mutate the original
  function cloneDescTree(node: DescendantNode): DescendantNode {
    return { ...node, children: node.children.map(c => cloneDescTree(c)) };
  }
  const layoutDescRoot: DescendantNode = cloneDescTree(descendantRoot);

  // Inject child placeholder for the selected person into descendant tree
  let childPlaceholderId: string | null = null;
  if (selectedPersonId) {
    childPlaceholderId = PLACEHOLDER_PREFIX + 'child_' + selectedPersonId;
    const phChild: DescendantNode = {
      person: {
        id: childPlaceholderId,
        givenName: null, surname: null, preferredName: null, nickname: null,
        sex: 'U', living: false, birthDate: null, deathDate: null,
      },
      children: [],
    };

    function injectChild(node: DescendantNode): boolean {
      if (node.person.id === selectedPersonId) {
        node.children = [...node.children, phChild];
        return true;
      }
      return node.children.some(c => injectChild(c));
    }
    if (!injectChild(layoutDescRoot)) {
      // Not in descendant tree — add as focal child so it appears below
      layoutDescRoot.children = [...layoutDescRoot.children, phChild];
    }
  }

  // Rebuild focalChildGroupMap from the layout descendant root (with placeholders)
  const layoutFocalChildGroupMap = new Map<string | null, DescendantNode[]>();
  for (const child of layoutDescRoot.children) {
    const key = child.coParentId ?? null;
    const arr = layoutFocalChildGroupMap.get(key);
    if (arr) arr.push(child); else layoutFocalChildGroupMap.set(key, [child]);
  }

  // When the focal person is female, place spouses to the LEFT so the convention
  // "male left, female right" holds regardless of who is currently focal.
  const spouseOnLeft = focalIsFemale && effectiveSpouses.length > 0;

  // Siblings go on the opposite side from where spouses would go:
  // Male focal: spouses right → siblings left. Female focal: spouses left → siblings right.
  const siblingsOnLeft = !focalIsFemale;

  // ── Ancestor geometry (using ahnentafel from original tree) ─────────────────
  // We still use the ahnentafel structure for ancestor layout since it gives
  // stable, predictable positioning. The TreePerson graph is used for placeholder
  // injection (handled above via injectOutlines).

  // Prune collapsed ancestor subtrees from ahnentafel map
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

  // Inject placeholder ancestor nodes for selected person's missing parents
  const placeholderKeys = new Set<number>();
  let effectiveGenerations = generations;

  if (selectedPersonId) {
    const selectedK = [...ancestorNodes.entries()].find(([, p]) => p.id === selectedPersonId)?.[0];
    if (selectedK !== undefined && !ancestorHasMore.has(selectedK)) {
      const g = Math.floor(Math.log2(selectedK));
      if (g >= effectiveGenerations - 1) {
        effectiveGenerations = g + 2;
      }
      if (!ancestorNodes.has(selectedK * 2)) {
        const k = selectedK * 2;
        placeholderKeys.add(k);
        ancestorNodes.set(k, {
          id: PLACEHOLDER_PREFIX + 'father_' + selectedPersonId,
          givenName: null, surname: null, preferredName: null, nickname: null,
          sex: 'M', living: false, birthDate: null, deathDate: null,
        });
      }
      if (!ancestorNodes.has(selectedK * 2 + 1)) {
        const k = selectedK * 2 + 1;
        placeholderKeys.add(k);
        ancestorNodes.set(k, {
          id: PLACEHOLDER_PREFIX + 'mother_' + selectedPersonId,
          givenName: null, surname: null, preferredName: null, nickname: null,
          sex: 'F', living: false, birthDate: null, deathDate: null,
        });
      }
    }
  }

  const A = effectiveGenerations - 1; // ancestor levels above focal

  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  // ── Ancestor geometry ────────────────────────────────────────────────────
  //
  // Compact horizontal layout: only visible leaf nodes get individual slots,
  // preserving genealogical left-to-right order. Internal nodes are centred
  // over their children.

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
  // then centering the group below the parent.

  function subtreeExtents(node: DescendantNode, depth: number): [number, number] {
    const half = BOX_W / 2;
    if (depth >= M || node.children.length === 0) return [half, half];
    if (depth > 0 && collapsed.has(`${node.person.id}:down`)) return [half, half];

    const n = node.children.length;
    const childExts = node.children.map(c => subtreeExtents(c, depth + 1));

    const offsets: number[] = [0];
    for (let i = 1; i < n; i++) {
      offsets.push(offsets[i - 1] + childExts[i - 1][1] + V_GAP + childExts[i][0]);
    }
    const totalSpan = offsets[n - 1];

    const leftExt  = Math.max(half, totalSpan / 2 + childExts[0][0]);
    const rightExt = Math.max(half, totalSpan / 2 + childExts[n - 1][1]);
    return [leftExt, rightExt];
  }

  // Row Y helpers
  const ancestorTopPad = PAD + 8;
  const focalRowY  = ancestorTopPad + A * (BOX_H + GEN_GAP);
  const ancestorRowY = (g: number) => ancestorTopPad + (A - g) * (BOX_H + GEN_GAP);
  const descRowY     = (d: number) => focalRowY + d * (BOX_H + GEN_GAP);

  // Distance from focalCX to the couple-junction for spouse at index i.
  const junctionOffsetOf = (i: number): number =>
    (BOX_W + H_GAP + i * (BOX_W + V_GAP)) / 2;

  // Spouse offset: distance from focalCX to junction for first spouse.
  const spouseOffset = effectiveSpouses.length > 0 ? junctionOffsetOf(0) : 0;
  void spouseOffset;

  // Compute extents of a flat list of focal children from their center.
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

  // Build relative group infos for child placement
  interface RelGroupInfo {
    coParentId: string | null;
    children: DescendantNode[];
    anchorOffset: number;
    gLeft: number;
    gRight: number;
  }
  const relGroupInfos: RelGroupInfo[] = [...layoutFocalChildGroupMap.entries()]
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

  // Pack groups left-to-right
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

  // Compute total descendant extents from focalCX
  let descLeftFromFocal = BOX_W / 2;
  let descRightFromFocal = BOX_W / 2;
  for (let i = 0; i < relGroupInfos.length; i++) {
    const { gLeft, gRight } = relGroupInfos[i];
    const co = relativeCenterOffsets[i];
    descLeftFromFocal  = Math.max(descLeftFromFocal,  Math.max(0, gLeft  - co));
    descRightFromFocal = Math.max(descRightFromFocal, Math.max(0, co + gRight));
  }

  // Extra space needed on the spouse side
  const spouseBoxesExtent = effectiveSpouses.length > 0
    ? BOX_W + H_GAP + (effectiveSpouses.length - 1) * (BOX_W + V_GAP) + BOX_W / 2
    : 0;

  // Extra space needed for siblings
  const siblingBoxesExtent = effectiveSiblings.length > 0
    ? BOX_W + H_GAP + (effectiveSiblings.length - 1) * (BOX_W + V_GAP) + BOX_W / 2
    : 0;

  // Place focal far enough from the left edge
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

  for (const [k] of ancestorNodes) {
    const g = Math.floor(Math.log2(k));
    if (g >= A) continue;

    const fatherK = k * 2;
    const motherK = k * 2 + 1;
    const father  = ancestorNodes.get(fatherK);
    const mother  = ancestorNodes.get(motherK);
    if (!father && !mother) continue;

    const kCX   = ancestorCX(k);
    const kRowY = ancestorRowY(g);
    const forkY = kRowY - GEN_GAP / 2;

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

  const spouseCXOf = (i: number) => spouseOnLeft
    ? focalCX - BOX_W - H_GAP - i * (BOX_W + V_GAP)
    : focalCX + BOX_W + H_GAP + i * (BOX_W + V_GAP);

  const coupleJunctionCXOf = (i: number) => spouseOnLeft
    ? focalCX - junctionOffsetOf(i)
    : focalCX + junctionOffsetOf(i);

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

  // Place focal child groups using pre-computed packed center offsets
  {
    const forkY = focalRowY + BOX_H + GEN_GAP / 2;
    const bendY = focalRowY + BOX_H + GEN_GAP / 4;

    for (let gi = 0; gi < relGroupInfos.length; gi++) {
      const g = relGroupInfos[gi];
      const { coParentId, children } = g;
      const spouseIdx  = effectiveSpouses.findIndex(s => s.id === coParentId);
      const anchorCX   = focalCX + g.anchorOffset;
      const lineStartY = spouseIdx >= 0 ? focalRowY + BOX_H / 2 : focalRowY + BOX_H;
      const centerCX   = focalCX + relativeCenterOffsets[gi];

      if (Math.abs(anchorCX - centerCX) > 1) {
        lines.push({ x1: anchorCX, y1: lineStartY, x2: anchorCX, y2: bendY });
        lines.push({ x1: anchorCX, y1: bendY,      x2: centerCX, y2: bendY });
        lines.push({ x1: centerCX, y1: bendY,      x2: centerCX, y2: forkY });
      } else {
        lines.push({ x1: centerCX, y1: lineStartY, x2: centerCX, y2: forkY });
      }

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

    if (A >= 1) {
      const parentForkY = focalRowY - GEN_GAP / 2;
      const allChildCXs = [focalCX];
      for (let i = 0; i < effectiveSiblings.length; i++) {
        allChildCXs.push(siblingCXOf(i));
      }
      const minCX = Math.min(...allChildCXs);
      const maxCX = Math.max(...allChildCXs);

      lines.push({ x1: minCX, y1: parentForkY, x2: maxCX, y2: parentForkY });

      for (let i = 0; i < effectiveSiblings.length; i++) {
        const scx = siblingCXOf(i);
        lines.push({ x1: scx, y1: parentForkY, x2: scx, y2: focalRowY });
      }
    }
  }

  // ── SVG height ───────────────────────────────────────────────────────────

  const deepestDescRow = M > 0 && layoutDescRoot.children.length > 0
    ? descRowY(M)
    : focalRowY;
  const svgHeight = deepestDescRow + BOX_H + 20 + PAD;

  // ── Collapse buttons ─────────────────────────────────────────────────────

  const descNodeMap = new Map<string, DescendantNode>();
  function indexDescendants(node: DescendantNode): void {
    descNodeMap.set(node.person.id, node);
    for (const child of node.children) indexDescendants(child);
  }
  indexDescendants(layoutDescRoot);

  const collapseButtons: CollapseButton[] = [];

  for (const box of boxes) {
    const k = personToAhnen.get(box.person.id);
    if (k !== undefined) {
      if (k === 1) {
        // Focal: one down button per child group
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
          const sibBtnCY = (spouses.length > 0 && siblingsOnLeft === focalIsFemale)
            ? box.y + BOX_H / 2 + 18
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
        // Ancestor: up button if parents exist, or load-more if hasMoreAncestors
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

  // ── Extract placeholder boxes from layout ─────────────────────────────────
  const placeholders: PlaceholderBox[] = [];
  const placeholderLines: Line[] = [];
  const placeholderPersonIds = new Set<string>();

  for (const k of placeholderKeys) {
    const person = ancestorNodes.get(k);
    if (person) placeholderPersonIds.add(person.id);
  }
  if (childPlaceholderId) placeholderPersonIds.add(childPlaceholderId);

  // Convert placeholder boxes and remove from regular boxes
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
    placeholders.push({
      type: 'placeholder', role, childPersonId,
      x: box.x, y: box.y,
    });
    boxes.splice(i, 1);
  }

  // Convert solid connector lines touching placeholder boxes into dashed lines.
  const phCenters = new Set<string>();
  for (const ph of placeholders) {
    const cx = ph.x + BOX_W / 2;
    const top = ph.y;
    const bottom = ph.y + BOX_H;
    phCenters.add(`${cx},${top}`);
    phCenters.add(`${cx},${bottom}`);
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    const touchesStart = phCenters.has(`${ln.x1},${ln.y1}`) || phCenters.has(`${ln.x2},${ln.y2}`);
    if (touchesStart) {
      placeholderLines.push(ln);
      lines.splice(i, 1);
    }
  }

  return { boxes, lines, svgWidth, svgHeight, viewBoxMinY: 0, collapseButtons, placeholders, placeholderLines };
}
