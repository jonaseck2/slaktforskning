// src/api/wall-charts.ts
// Pure SVG generation for large-format wall charts.
// No Electron or window dependencies — takes pre-fetched tree data.

export interface WallChartPerson {
  id: string;
  givenName: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  deathPlace: string | null;
  photoBase64: string | null; // data:image/... for embedding
}

export interface WallChartAncestorTree {
  person: WallChartPerson;
  father: WallChartAncestorTree | null;
  mother: WallChartAncestorTree | null;
}

export interface WallChartDescendantTree {
  person: WallChartPerson;
  children: WallChartDescendantTree[];
}

/** Paper sizes in mm */
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
};

export type ChartType = 'pedigree' | 'descendant';
export type Orientation = 'portrait' | 'landscape';
export type FontSizePreset = 'small' | 'medium' | 'large';
export type ColorMode = 'themed' | 'bw' | 'sex-colored';

export interface WallChartOptions {
  chartType: ChartType;
  paperSize: string; // key in PAPER_SIZES or 'custom'
  customWidth?: number; // mm, for custom paper
  customHeight?: number; // mm, for custom paper
  orientation: Orientation;
  generations: number;
  showDates: boolean;
  showPlaces: boolean;
  showPhotos: boolean;
  fontSize: FontSizePreset;
  colorMode: ColorMode;
  title: string;
  /** Theme colors (only used when colorMode === 'themed') */
  themeColors?: {
    accent: string;
    surface: string;
    text: string;
    border: string;
  };
}

/** Get effective paper dimensions in mm, accounting for orientation. */
export function getPaperDimensions(options: WallChartOptions): { width: number; height: number } {
  const base = options.paperSize === 'custom'
    ? { width: options.customWidth ?? 420, height: options.customHeight ?? 594 }
    : PAPER_SIZES[options.paperSize] ?? PAPER_SIZES.A2;

  return options.orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : base;
}

const FONT_SIZES: Record<FontSizePreset, { name: number; dates: number; title: number }> = {
  small: { name: 10, dates: 7, title: 18 },
  medium: { name: 14, dates: 10, title: 24 },
  large: { name: 18, dates: 13, title: 32 },
};

const MM_TO_PX = 3.7795275591; // 1mm = 3.78px at 96dpi

/** Escape XML special characters for SVG text content. */
function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Format a display name from given + surname. */
function displayName(p: WallChartPerson): string {
  return [p.givenName, p.surname].filter(Boolean).join(' ') || '?';
}

/** Format life dates as "(b. YYYY - d. YYYY)". */
function lifeDates(p: WallChartPerson): string {
  const b = p.birthDate?.substring(0, 4) ?? '?';
  const d = p.deathDate?.substring(0, 4);
  if (!d) return b !== '?' ? `b. ${b}` : '';
  return `${b}\u2013${d}`;
}

/** Generate pedigree wall chart SVG (horizontal: focal left, ancestors right). */
export function generatePedigreeWallChart(
  tree: WallChartAncestorTree,
  options: WallChartOptions,
): string {
  const paper = getPaperDimensions(options);
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const fonts = FONT_SIZES[options.fontSize];
  const MARGIN = 40;
  const TITLE_H = 50;

  // Collect all nodes by generation
  const generations: WallChartAncestorTree[][] = [];
  function collectByGen(node: WallChartAncestorTree | null, gen: number) {
    if (!node || gen > options.generations) return;
    if (!generations[gen]) generations[gen] = [];
    generations[gen].push(node);
    collectByGen(node.father, gen + 1);
    collectByGen(node.mother, gen + 1);
  }
  collectByGen(tree, 0);

  const numGens = generations.length;
  const chartW = W - MARGIN * 2;
  const chartH = H - MARGIN * 2 - TITLE_H;
  const genWidth = chartW / numGens;

  const boxes: string[] = [];
  const lines: string[] = [];

  // Position each person
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();

  for (let g = 0; g < numGens; g++) {
    const gen = generations[g];
    if (!gen) continue;
    const count = gen.length;
    const slotH = chartH / count;
    const boxW = genWidth * 0.8;
    const boxH = Math.min(slotH * 0.7, 80);

    for (let i = 0; i < count; i++) {
      const node = gen[i];
      const x = MARGIN + g * genWidth + (genWidth - boxW) / 2;
      const y = MARGIN + TITLE_H + i * slotH + (slotH - boxH) / 2;
      positions.set(node.person.id, { x, y, w: boxW, h: boxH });

      const fill = getBoxFill(node.person.sex, options);
      const stroke = getBoxStroke(options);
      const textColor = getTextColor(options);

      boxes.push(`<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);

      const nameStr = escXml(displayName(node.person));
      boxes.push(`<text x="${x + boxW / 2}" y="${y + boxH * 0.4}" text-anchor="middle" font-size="${fonts.name}" fill="${textColor}" font-weight="bold">${nameStr}</text>`);

      if (options.showDates) {
        const dates = escXml(lifeDates(node.person));
        if (dates) {
          boxes.push(`<text x="${x + boxW / 2}" y="${y + boxH * 0.7}" text-anchor="middle" font-size="${fonts.dates}" fill="${textColor}">${dates}</text>`);
        }
      }

      if (options.showPlaces && node.person.birthPlace) {
        boxes.push(`<text x="${x + boxW / 2}" y="${y + boxH * 0.9}" text-anchor="middle" font-size="${fonts.dates}" fill="${textColor}" opacity="0.7">${escXml(node.person.birthPlace)}</text>`);
      }
    }
  }

  // Draw connector lines
  function drawLines(node: WallChartAncestorTree | null) {
    if (!node) return;
    const pos = positions.get(node.person.id);
    if (!pos) return;

    for (const child of [node.father, node.mother]) {
      if (!child) continue;
      const childPos = positions.get(child.person.id);
      if (!childPos) continue;

      const x1 = pos.x + pos.w;
      const y1 = pos.y + pos.h / 2;
      const x2 = childPos.x;
      const y2 = childPos.y + childPos.h / 2;
      const mx = (x1 + x2) / 2;

      lines.push(`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${getLineColor(options)}" stroke-width="1.5"/>`);
      drawLines(child);
    }
  }
  drawLines(tree);

  // Title
  const titleStr = escXml(options.title);
  const titleSvg = `<text x="${W / 2}" y="${MARGIN + 30}" text-anchor="middle" font-size="${fonts.title}" font-weight="bold" fill="${getTextColor(options)}">${titleStr}</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${getBackgroundColor(options)}"/>`,
    `<style>text { font-family: 'Segoe UI', system-ui, sans-serif; }</style>`,
    titleSvg,
    `<g>${lines.join('\n')}</g>`,
    `<g>${boxes.join('\n')}</g>`,
    `</svg>`,
  ].join('\n');
}

/** Generate descendant wall chart SVG (vertical: focal top, descendants down). */
export function generateDescendantWallChart(
  tree: WallChartDescendantTree,
  options: WallChartOptions,
): string {
  const paper = getPaperDimensions(options);
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const fonts = FONT_SIZES[options.fontSize];
  const MARGIN = 40;
  const TITLE_H = 50;

  // Collect by generation using BFS
  const generations: WallChartDescendantTree[][] = [];
  function collectByGen(node: WallChartDescendantTree, gen: number) {
    if (gen >= options.generations + 1) return;
    if (!generations[gen]) generations[gen] = [];
    generations[gen].push(node);
    for (const child of node.children) {
      collectByGen(child, gen + 1);
    }
  }
  collectByGen(tree, 0);

  const numGens = generations.length;
  const chartW = W - MARGIN * 2;
  const chartH = H - MARGIN * 2 - TITLE_H;
  const genHeight = chartH / numGens;

  const boxes: string[] = [];
  const lines: string[] = [];
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();

  for (let g = 0; g < numGens; g++) {
    const gen = generations[g];
    if (!gen) continue;
    const count = gen.length;
    const slotW = chartW / count;
    const boxW = Math.min(slotW * 0.8, 180);
    const boxH = Math.min(genHeight * 0.6, 70);

    for (let i = 0; i < count; i++) {
      const node = gen[i];
      const x = MARGIN + i * slotW + (slotW - boxW) / 2;
      const y = MARGIN + TITLE_H + g * genHeight + (genHeight - boxH) / 2;
      positions.set(node.person.id, { x, y, w: boxW, h: boxH });

      const fill = getBoxFill(node.person.sex, options);
      const stroke = getBoxStroke(options);
      const textColor = getTextColor(options);

      boxes.push(`<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);

      const nameStr = escXml(displayName(node.person));
      boxes.push(`<text x="${x + boxW / 2}" y="${y + boxH * 0.4}" text-anchor="middle" font-size="${fonts.name}" fill="${textColor}" font-weight="bold">${nameStr}</text>`);

      if (options.showDates) {
        const dates = escXml(lifeDates(node.person));
        if (dates) {
          boxes.push(`<text x="${x + boxW / 2}" y="${y + boxH * 0.7}" text-anchor="middle" font-size="${fonts.dates}" fill="${textColor}">${dates}</text>`);
        }
      }
    }
  }

  // Draw connector lines
  function drawLines(node: WallChartDescendantTree) {
    const pos = positions.get(node.person.id);
    if (!pos) return;
    for (const child of node.children) {
      const childPos = positions.get(child.person.id);
      if (!childPos) continue;
      const x1 = pos.x + pos.w / 2;
      const y1 = pos.y + pos.h;
      const x2 = childPos.x + childPos.w / 2;
      const y2 = childPos.y;
      const my = (y1 + y2) / 2;
      lines.push(`<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" fill="none" stroke="${getLineColor(options)}" stroke-width="1.5"/>`);
      drawLines(child);
    }
  }
  drawLines(tree);

  const titleStr = escXml(options.title);
  const titleSvg = `<text x="${W / 2}" y="${MARGIN + 30}" text-anchor="middle" font-size="${fonts.title}" font-weight="bold" fill="${getTextColor(options)}">${titleStr}</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${getBackgroundColor(options)}"/>`,
    `<style>text { font-family: 'Segoe UI', system-ui, sans-serif; }</style>`,
    titleSvg,
    `<g>${lines.join('\n')}</g>`,
    `<g>${boxes.join('\n')}</g>`,
    `</svg>`,
  ].join('\n');
}

// ── Color helpers ──

function getBoxFill(sex: string, options: WallChartOptions): string {
  if (options.colorMode === 'bw') return '#ffffff';
  if (options.colorMode === 'sex-colored') {
    if (sex === 'M') return '#dbeafe';
    if (sex === 'F') return '#fce7f3';
    return '#f3f4f6';
  }
  return options.themeColors?.surface ?? '#f8f9fa';
}

function getBoxStroke(options: WallChartOptions): string {
  if (options.colorMode === 'bw') return '#333333';
  return options.themeColors?.border ?? '#d1d5db';
}

function getTextColor(options: WallChartOptions): string {
  if (options.colorMode === 'bw') return '#000000';
  return options.themeColors?.text ?? '#1f2937';
}

function getLineColor(options: WallChartOptions): string {
  if (options.colorMode === 'bw') return '#666666';
  return options.themeColors?.border ?? '#9ca3af';
}

function getBackgroundColor(_options: WallChartOptions): string {
  return '#ffffff';
}

/** Split an SVG into A4-sized tile viewBoxes for printing on standard paper. */
export function computeTileViewBoxes(
  svgWidth: number,
  svgHeight: number,
  overlap: number = 20,
): Array<{ x: number; y: number; width: number; height: number; row: number; col: number }> {
  const A4_W = Math.round(210 * MM_TO_PX);
  const A4_H = Math.round(297 * MM_TO_PX);
  const tileW = A4_W - overlap * 2;
  const tileH = A4_H - overlap * 2;

  const cols = Math.ceil(svgWidth / tileW);
  const rows = Math.ceil(svgHeight / tileH);
  const tiles: Array<{ x: number; y: number; width: number; height: number; row: number; col: number }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        x: c * tileW - overlap,
        y: r * tileH - overlap,
        width: A4_W,
        height: A4_H,
        row: r,
        col: c,
      });
    }
  }
  return tiles;
}

/**
 * Generate a tiled SVG page (one A4-sized SVG that shows a portion of the full chart).
 * Adds crop marks at corners for alignment when assembling the tiles.
 */
export function generateTileSvg(
  fullSvg: string,
  tile: { x: number; y: number; width: number; height: number; row: number; col: number },
): string {
  // Re-wrap the inner SVG content within a new viewBox
  // Extract inner content between <svg ...> and </svg>
  const innerMatch = fullSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const inner = innerMatch?.[1] ?? '';

  const MARK_LEN = 15;
  const MARK_OFFSET = 20; // matches overlap

  const cropMarks = [
    // Top-left
    `<line x1="${tile.x + MARK_OFFSET}" y1="${tile.y}" x2="${tile.x + MARK_OFFSET}" y2="${tile.y + MARK_LEN}" stroke="#000" stroke-width="0.5"/>`,
    `<line x1="${tile.x}" y1="${tile.y + MARK_OFFSET}" x2="${tile.x + MARK_LEN}" y2="${tile.y + MARK_OFFSET}" stroke="#000" stroke-width="0.5"/>`,
    // Top-right
    `<line x1="${tile.x + tile.width - MARK_OFFSET}" y1="${tile.y}" x2="${tile.x + tile.width - MARK_OFFSET}" y2="${tile.y + MARK_LEN}" stroke="#000" stroke-width="0.5"/>`,
    `<line x1="${tile.x + tile.width}" y1="${tile.y + MARK_OFFSET}" x2="${tile.x + tile.width - MARK_LEN}" y2="${tile.y + MARK_OFFSET}" stroke="#000" stroke-width="0.5"/>`,
    // Bottom-left
    `<line x1="${tile.x + MARK_OFFSET}" y1="${tile.y + tile.height}" x2="${tile.x + MARK_OFFSET}" y2="${tile.y + tile.height - MARK_LEN}" stroke="#000" stroke-width="0.5"/>`,
    `<line x1="${tile.x}" y1="${tile.y + tile.height - MARK_OFFSET}" x2="${tile.x + MARK_LEN}" y2="${tile.y + tile.height - MARK_OFFSET}" stroke="#000" stroke-width="0.5"/>`,
    // Bottom-right
    `<line x1="${tile.x + tile.width - MARK_OFFSET}" y1="${tile.y + tile.height}" x2="${tile.x + tile.width - MARK_OFFSET}" y2="${tile.y + tile.height - MARK_LEN}" stroke="#000" stroke-width="0.5"/>`,
    `<line x1="${tile.x + tile.width}" y1="${tile.y + tile.height - MARK_OFFSET}" x2="${tile.x + tile.width - MARK_LEN}" y2="${tile.y + tile.height - MARK_OFFSET}" stroke="#000" stroke-width="0.5"/>`,
  ].join('\n');

  // Page label
  const label = `<text x="${tile.x + tile.width - 5}" y="${tile.y + 12}" text-anchor="end" font-size="8" fill="#999" font-family="sans-serif">Page ${tile.row + 1}-${tile.col + 1}</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile.width}" height="${tile.height}" viewBox="${tile.x} ${tile.y} ${tile.width} ${tile.height}">`,
    `<rect x="${tile.x}" y="${tile.y}" width="${tile.width}" height="${tile.height}" fill="white"/>`,
    inner,
    cropMarks,
    label,
    `</svg>`,
  ].join('\n');
}
