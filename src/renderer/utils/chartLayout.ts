// src/renderer/utils/chartLayout.ts
// Pure layout algorithms for genealogy charts — no IPC, no DOM, fully unit-testable.

export interface PersonNode {
  id: string;
  givenName: string | null;
  surname: string | null;
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

export interface ChartLayout {
  boxes: BoxLayout[];
  lines: Line[];
  svgWidth: number;
  svgHeight: number;
}

export interface PedigreeTree {
  focal: PersonNode;
  // parents[0] and parents[1] (either may be null)
  parents: [PersonNode | null, PersonNode | null];
  // grandparents[0,1] = parents[0]'s parents; grandparents[2,3] = parents[1]'s parents
  grandparents: [PersonNode | null, PersonNode | null, PersonNode | null, PersonNode | null];
}

export interface HourglassTree extends PedigreeTree {
  children: PersonNode[];
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
export const V_GAP = 20;   // vertical gap between sibling boxes
export const H_GAP = 50;   // horizontal gap between pedigree generations
export const GEN_GAP = 60; // vertical gap between hourglass generations
const PAD = 10;
const ROW_H = BOX_H + V_GAP; // 64

// ─── Pedigree ─────────────────────────────────────────────────────────────────

export function computePedigreeLayout(tree: PedigreeTree): ChartLayout {
  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  const genX = [PAD, PAD + BOX_W + H_GAP, PAD + 2 * (BOX_W + H_GAP)];
  // genX = [10, 215, 420]

  const gpSlotY = [0, 1, 2, 3].map(i => PAD + i * ROW_H);
  const gpSlotCY = gpSlotY.map(y => y + BOX_H / 2);
  // gpSlotCY = [32, 96, 160, 224]

  const parentSlotCY = [
    (gpSlotCY[0] + gpSlotCY[1]) / 2, // 64
    (gpSlotCY[2] + gpSlotCY[3]) / 2, // 192
  ];

  const focalCY = (parentSlotCY[0] + parentSlotCY[1]) / 2; // 128

  const svgWidth = genX[2] + BOX_W + PAD;       // 585
  const svgHeight = PAD + 4 * ROW_H - V_GAP + PAD; // 256

  boxes.push({ person: tree.focal, isFocal: true, x: genX[0], y: focalCY - BOX_H / 2, w: BOX_W, h: BOX_H });

  const forkX01 = genX[0] + BOX_W + H_GAP / 2; // 190

  const activePCYs = tree.parents
    .map((p, i) => (p ? parentSlotCY[i] : null))
    .filter((cy): cy is number => cy !== null);

  if (activePCYs.length > 0) {
    lines.push({ x1: genX[0] + BOX_W, y1: focalCY, x2: forkX01, y2: focalCY });
    lines.push({ x1: forkX01, y1: Math.min(...activePCYs), x2: forkX01, y2: Math.max(...activePCYs) });
  }

  for (let pi = 0; pi < 2; pi++) {
    const parent = tree.parents[pi];
    if (!parent) continue;
    const pcy = parentSlotCY[pi];
    boxes.push({ person: parent, isFocal: false, x: genX[1], y: pcy - BOX_H / 2, w: BOX_W, h: BOX_H });
    lines.push({ x1: forkX01, y1: pcy, x2: genX[1], y2: pcy });

    const forkX12 = genX[1] + BOX_W + H_GAP / 2; // 395

    const activeGPCYs = [tree.grandparents[pi * 2], tree.grandparents[pi * 2 + 1]]
      .map((gp, gi) => (gp ? gpSlotCY[pi * 2 + gi] : null))
      .filter((cy): cy is number => cy !== null);

    if (activeGPCYs.length > 0) {
      lines.push({ x1: genX[1] + BOX_W, y1: pcy, x2: forkX12, y2: pcy });
      lines.push({ x1: forkX12, y1: Math.min(...activeGPCYs), x2: forkX12, y2: Math.max(...activeGPCYs) });
    }

    for (let gi = 0; gi < 2; gi++) {
      const gp = tree.grandparents[pi * 2 + gi];
      if (!gp) continue;
      const gpIdx = pi * 2 + gi;
      lines.push({ x1: forkX12, y1: gpSlotCY[gpIdx], x2: genX[2], y2: gpSlotCY[gpIdx] });
      boxes.push({ person: gp, isFocal: false, x: genX[2], y: gpSlotY[gpIdx], w: BOX_W, h: BOX_H });
    }
  }

  return { boxes, lines, svgWidth, svgHeight };
}

// ─── Hourglass ────────────────────────────────────────────────────────────────

export function computeHourglassLayout(tree: HourglassTree): ChartLayout {
  const GP_INNER_GAP = 10;
  const FAMILY_GAP = 60;
  const svgWidth = 4 * BOX_W + 2 * GP_INNER_GAP + FAMILY_GAP + 2 * PAD;
  // svgWidth = 720

  const boxes: BoxLayout[] = [];
  const lines: Line[] = [];

  const gpX = [
    PAD,
    PAD + BOX_W + GP_INNER_GAP,
    PAD + 2 * BOX_W + GP_INNER_GAP + FAMILY_GAP,
    PAD + 3 * BOX_W + 2 * GP_INNER_GAP + FAMILY_GAP,
  ]; // [10, 175, 390, 555]

  const gpCX = gpX.map(x => x + BOX_W / 2); // [87.5, 252.5, 467.5, 632.5]

  const parentCX = [
    (gpCX[0] + gpCX[1]) / 2, // 170
    (gpCX[2] + gpCX[3]) / 2, // 550
  ];

  const focalCX = svgWidth / 2; // 360

  const gpRowY      = PAD;                            // 10
  const parentRowY  = PAD + BOX_H + GEN_GAP;          // 114
  const focalRowY   = PAD + 2 * (BOX_H + GEN_GAP);   // 218
  const childRowY   = PAD + 3 * (BOX_H + GEN_GAP);   // 322

  const forkY_gp_parent    = gpRowY + BOX_H + GEN_GAP / 2;    // 84
  const forkY_parent_focal = parentRowY + BOX_H + GEN_GAP / 2; // 188
  const forkY_focal_child  = focalRowY + BOX_H + GEN_GAP / 2;  // 292

  // Grandparent boxes
  for (let i = 0; i < 4; i++) {
    const gp = tree.grandparents[i];
    if (!gp) continue;
    boxes.push({ person: gp, isFocal: false, x: gpX[i], y: gpRowY, w: BOX_W, h: BOX_H });
  }

  // Parent boxes + GP→Parent connectors
  for (let pi = 0; pi < 2; pi++) {
    const gp0 = tree.grandparents[pi * 2];
    const gp1 = tree.grandparents[pi * 2 + 1];
    const activeGPCXs = [gp0, gp1]
      .map((gp, gi) => (gp ? gpCX[pi * 2 + gi] : null))
      .filter((cx): cx is number => cx !== null);

    if (activeGPCXs.length > 0) {
      for (const cx of activeGPCXs) {
        lines.push({ x1: cx, y1: gpRowY + BOX_H, x2: cx, y2: forkY_gp_parent });
      }
      lines.push({ x1: Math.min(...activeGPCXs), y1: forkY_gp_parent, x2: Math.max(...activeGPCXs), y2: forkY_gp_parent });
      if (tree.parents[pi]) {
        lines.push({ x1: parentCX[pi], y1: forkY_gp_parent, x2: parentCX[pi], y2: parentRowY });
      }
    }

    const parent = tree.parents[pi];
    if (!parent) continue;
    boxes.push({ person: parent, isFocal: false, x: parentCX[pi] - BOX_W / 2, y: parentRowY, w: BOX_W, h: BOX_H });
  }

  // Focal box
  boxes.push({ person: tree.focal, isFocal: true, x: focalCX - BOX_W / 2, y: focalRowY, w: BOX_W, h: BOX_H });

  // Parent→Focal connectors
  const activeParentCXs = tree.parents
    .map((p, i) => (p ? parentCX[i] : null))
    .filter((cx): cx is number => cx !== null);

  if (activeParentCXs.length > 0) {
    for (const cx of activeParentCXs) {
      lines.push({ x1: cx, y1: parentRowY + BOX_H, x2: cx, y2: forkY_parent_focal });
    }
    lines.push({ x1: Math.min(...activeParentCXs), y1: forkY_parent_focal, x2: Math.max(...activeParentCXs), y2: forkY_parent_focal });
    lines.push({ x1: focalCX, y1: forkY_parent_focal, x2: focalCX, y2: focalRowY });
  }

  // Focal→Children connectors + child boxes
  let svgHeight = focalRowY + BOX_H + PAD;

  if (tree.children.length > 0) {
    const count = tree.children.length;
    const totalW = count * BOX_W + (count - 1) * V_GAP;
    const startX = (svgWidth - totalW) / 2;

    lines.push({ x1: focalCX, y1: focalRowY + BOX_H, x2: focalCX, y2: forkY_focal_child });
    if (count > 1) {
      const firstCX = startX + BOX_W / 2;
      const lastCX = startX + (count - 1) * (BOX_W + V_GAP) + BOX_W / 2;
      lines.push({ x1: firstCX, y1: forkY_focal_child, x2: lastCX, y2: forkY_focal_child });
    }

    for (let ci = 0; ci < count; ci++) {
      const cx = startX + ci * (BOX_W + V_GAP) + BOX_W / 2;
      lines.push({ x1: cx, y1: forkY_focal_child, x2: cx, y2: childRowY });
      boxes.push({ person: tree.children[ci], isFocal: false, x: startX + ci * (BOX_W + V_GAP), y: childRowY, w: BOX_W, h: BOX_H });
    }

    svgHeight = childRowY + BOX_H + PAD;
  }

  return { boxes, lines, svgWidth, svgHeight };
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
