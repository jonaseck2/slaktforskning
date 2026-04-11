// src/api/reports/wall_chart.ts
// Pure SVG generation for wall charts — no Electron, no DOM, no IPC.
// Takes structured tree data and produces self-contained SVG strings.

/** Minimal person info needed for wall chart rendering. */
export interface WallChartPerson {
  id: string;
  givenName: string | null;
  surname: string | null;
  preferredName: string | null;
  birthDate: string | null;
  deathDate: string | null;
  sex: 'M' | 'F' | 'U';
}

/** Ahnentafel-indexed ancestor tree (same shape as PedigreeTree). */
export interface WallChartAncestorTree {
  nodes: Map<number, WallChartPerson>;
  generations: number;
}

/** Recursive descendant tree node. */
export interface WallChartDescendantNode {
  person: WallChartPerson;
  children: WallChartDescendantNode[];
}

export const PAPER_SIZES = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
  A0: { width: 1189, height: 841 },
} as const;

export type PaperSizeName = keyof typeof PAPER_SIZES;

export interface WallChartOptions {
  paperWidth: number;   // mm
  paperHeight: number;  // mm
  generations: number;
}

export interface TileInfo {
  row: number;
  col: number;
  svg: string;
}

// --- Helpers ---

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function displayName(p: WallChartPerson): string {
  const given = p.preferredName ?? p.givenName ?? '';
  const surname = p.surname ?? '';
  return [given, surname].filter(Boolean).join(' ') || '(unknown)';
}

function yearFromDate(d: string | null): string {
  if (!d) return '';
  const m = d.match(/\d{4}/);
  return m ? m[0] : '';
}

function lifespan(p: WallChartPerson): string {
  const b = yearFromDate(p.birthDate);
  const d = yearFromDate(p.deathDate);
  if (b && d) return `${b}\u2013${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return '';
}

function personBoxSvg(
  name: string, dates: string, sex: 'M' | 'F' | 'U',
  x: number, y: number, w: number, h: number,
): string {
  const fill = sex === 'M' ? '#e8f0fe' : sex === 'F' ? '#fce8ef' : '#f0f0f0';
  const stroke = sex === 'M' ? '#4a86c8' : sex === 'F' ? '#c84a6a' : '#888';
  const nameSize = Math.min(14, Math.max(8, w / 12));
  const dateSize = nameSize * 0.8;
  const padding = 4;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" ry="3" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`,
    `<text x="${x + padding}" y="${y + h * 0.42}" font-family="Georgia, serif" font-size="${nameSize}" fill="#222" clip-path="url(#clip)">${escapeXml(name)}</text>`,
    `<text x="${x + padding}" y="${y + h * 0.78}" font-family="Georgia, serif" font-size="${dateSize}" fill="#666">${escapeXml(dates)}</text>`,
  ].join('\n');
}

function connectorPath(x1: number, y1: number, x2: number, y2: number): string {
  // Orthogonal connector: horizontal from start, then vertical, then horizontal to end
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}" fill="none" stroke="#888" stroke-width="0.6"/>`;
}

// --- Pedigree Wall Chart (horizontal: focal left, ancestors right) ---

export function generatePedigreeWallChart(
  tree: WallChartAncestorTree,
  options: WallChartOptions,
): string {
  const { paperWidth, paperHeight, generations } = options;
  const margin = 10; // mm
  const usableW = paperWidth - 2 * margin;
  const usableH = paperHeight - 2 * margin;

  // One column per generation
  const colWidth = usableW / generations;
  const boxPadX = colWidth * 0.08;
  const boxW = colWidth - 2 * boxPadX;

  const svgParts: string[] = [];
  const lines: string[] = [];

  // For each generation, lay out boxes evenly in vertical space
  for (let gen = 0; gen < generations; gen++) {
    const startAhn = 1 << gen; // 1, 2, 4, 8...
    const slotsInGen = startAhn;
    const slotH = usableH / slotsInGen;
    const boxH = Math.min(slotH * 0.7, 18); // cap box height at 18mm

    for (let i = 0; i < slotsInGen; i++) {
      const ahnNum = startAhn + i;
      const person = tree.nodes.get(ahnNum);
      if (!person) continue;

      const x = margin + gen * colWidth + boxPadX;
      const y = margin + i * slotH + (slotH - boxH) / 2;

      svgParts.push(personBoxSvg(displayName(person), lifespan(person), person.sex, x, y, boxW, boxH));

      // Connector line to child (ahnNum/2)
      if (gen > 0) {
        const childAhn = Math.floor(ahnNum / 2);
        const childGen = gen - 1;
        const childSlotsInGen = 1 << childGen;
        const childSlotH = usableH / childSlotsInGen;
        const childBoxH = Math.min(childSlotH * 0.7, 18);
        const childI = childAhn - (1 << childGen);
        const childX = margin + childGen * colWidth + boxPadX + boxW;
        const childY = margin + childI * childSlotH + (childSlotH - childBoxH) / 2 + childBoxH / 2;

        lines.push(connectorPath(childX, childY, x, y + boxH / 2));
      }
    }
  }

  const title = tree.nodes.get(1) ? `Pedigree Chart \u2014 ${displayName(tree.nodes.get(1)!)}` : 'Pedigree Chart';
  return wrapSvg(paperWidth, paperHeight, title, [...lines, ...svgParts].join('\n'));
}

// --- Descendant Wall Chart (vertical: focal top, descendants below) ---

interface DescLayout {
  person: WallChartPerson;
  x: number;
  y: number;
  w: number;
  h: number;
  children: DescLayout[];
}

function countLeaves(node: WallChartDescendantNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function layoutDescendant(
  node: WallChartDescendantNode,
  x: number, y: number,
  availableWidth: number, rowH: number, boxH: number, boxPadY: number,
): DescLayout {
  const boxW = Math.min(availableWidth * 0.8, 60); // cap box width
  const totalLeaves = countLeaves(node);

  const childLayouts: DescLayout[] = [];
  let childX = x;
  for (const child of node.children) {
    const childLeaves = countLeaves(child);
    const childWidth = (childLeaves / totalLeaves) * availableWidth;
    childLayouts.push(layoutDescendant(child, childX, y + rowH, childWidth, rowH, boxH, boxPadY));
    childX += childWidth;
  }

  // Center this node over its children (or in its available width if leaf)
  let cx: number;
  if (childLayouts.length > 0) {
    const firstChild = childLayouts[0];
    const lastChild = childLayouts[childLayouts.length - 1];
    cx = (firstChild.x + firstChild.w / 2 + lastChild.x + lastChild.w / 2) / 2;
  } else {
    cx = x + availableWidth / 2;
  }

  return {
    person: node.person,
    x: cx - boxW / 2,
    y: y + boxPadY,
    w: boxW,
    h: boxH,
    children: childLayouts,
  };
}

function renderDescLayout(layout: DescLayout): string {
  const parts: string[] = [];
  parts.push(personBoxSvg(
    displayName(layout.person), lifespan(layout.person), layout.person.sex,
    layout.x, layout.y, layout.w, layout.h,
  ));

  // Connector lines to children
  const parentCx = layout.x + layout.w / 2;
  const parentBy = layout.y + layout.h;
  for (const child of layout.children) {
    const childCx = child.x + child.w / 2;
    const childTy = child.y;
    const midY = (parentBy + childTy) / 2;
    parts.push(`<path d="M${parentCx},${parentBy} L${parentCx},${midY} L${childCx},${midY} L${childCx},${childTy}" fill="none" stroke="#888" stroke-width="0.6"/>`);
  }

  for (const child of layout.children) {
    parts.push(renderDescLayout(child));
  }
  return parts.join('\n');
}

export function generateDescendantWallChart(
  root: WallChartDescendantNode,
  options: WallChartOptions,
): string {
  const { paperWidth, paperHeight, generations } = options;
  const margin = 10;
  const usableW = paperWidth - 2 * margin;
  const usableH = paperHeight - 2 * margin;

  const rowH = usableH / generations;
  const boxH = Math.min(rowH * 0.5, 18);
  const boxPadY = (rowH - boxH) / 2 * 0.3;

  const layout = layoutDescendant(root, margin, margin, usableW, rowH, boxH, boxPadY);
  const content = renderDescLayout(layout);

  const title = `Descendant Chart \u2014 ${displayName(root.person)}`;
  return wrapSvg(paperWidth, paperHeight, title, content);
}

// --- SVG wrapper ---

function wrapSvg(wMm: number, hMm: number, title: string, content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${wMm} ${hMm}">
  <title>${escapeXml(title)}</title>
  <style>
    text { dominant-baseline: auto; }
  </style>
  ${content}
</svg>`;
}

// --- Tiling for home printers ---

const TILE_WIDTH = 277;  // A4 landscape usable (297 - 2*10 margin)
const TILE_HEIGHT = 190;  // A4 landscape usable (210 - 2*10 margin)
const OVERLAP = 10; // mm overlap between tiles

export function splitIntoTiles(svgContent: string, totalW: number, totalH: number): TileInfo[] {
  const stepX = TILE_WIDTH - OVERLAP;
  const stepY = TILE_HEIGHT - OVERLAP;
  const cols = Math.ceil(totalW / stepX);
  const rows = Math.ceil(totalH / stepY);
  const tiles: TileInfo[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const vbX = col * stepX;
      const vbY = row * stepY;
      const vbW = Math.min(TILE_WIDTH, totalW - vbX);
      const vbH = Math.min(TILE_HEIGHT, totalH - vbY);

      // Crop marks at corners
      const cropLen = 5;
      const cropMarks = [
        // top-left
        `<line x1="${vbX}" y1="${vbY}" x2="${vbX + cropLen}" y2="${vbY}" stroke="#000" stroke-width="0.3"/>`,
        `<line x1="${vbX}" y1="${vbY}" x2="${vbX}" y2="${vbY + cropLen}" stroke="#000" stroke-width="0.3"/>`,
        // top-right
        `<line x1="${vbX + vbW}" y1="${vbY}" x2="${vbX + vbW - cropLen}" y2="${vbY}" stroke="#000" stroke-width="0.3"/>`,
        `<line x1="${vbX + vbW}" y1="${vbY}" x2="${vbX + vbW}" y2="${vbY + cropLen}" stroke="#000" stroke-width="0.3"/>`,
        // bottom-left
        `<line x1="${vbX}" y1="${vbY + vbH}" x2="${vbX + cropLen}" y2="${vbY + vbH}" stroke="#000" stroke-width="0.3"/>`,
        `<line x1="${vbX}" y1="${vbY + vbH}" x2="${vbX}" y2="${vbY + vbH - cropLen}" stroke="#000" stroke-width="0.3"/>`,
        // bottom-right
        `<line x1="${vbX + vbW}" y1="${vbY + vbH}" x2="${vbX + vbW - cropLen}" y2="${vbY + vbH}" stroke="#000" stroke-width="0.3"/>`,
        `<line x1="${vbX + vbW}" y1="${vbY + vbH}" x2="${vbX + vbW}" y2="${vbY + vbH - cropLen}" stroke="#000" stroke-width="0.3"/>`,
      ].join('\n');

      const tileSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
  <title>Tile ${row + 1}-${col + 1}</title>
  <style>
    text { dominant-baseline: auto; }
  </style>
  ${svgContent}
  ${cropMarks}
  <text x="${vbX + 2}" y="${vbY + 4}" font-family="sans-serif" font-size="3" fill="#999">${row + 1}-${col + 1}</text>
</svg>`;
      tiles.push({ row, col, svg: tileSvg });
    }
  }
  return tiles;
}

/** Count boxes in a pedigree tree for a given number of generations. */
export function expectedPedigreeBoxCount(generations: number): number {
  // 2^0 + 2^1 + ... + 2^(g-1) = 2^g - 1
  return (1 << generations) - 1;
}
