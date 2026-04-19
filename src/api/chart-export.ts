// src/api/chart-export.ts
// Paper size/orientation utilities and SVG tiling helpers for chart export.

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'custom';
export type Orientation = 'portrait' | 'landscape';
export type ColorMode = 'themed' | 'bw' | 'sex-colored';

export interface PaperConfig {
  paperSize: PaperSize;
  orientation: Orientation;
  customWidth?: number;  // mm, required when paperSize === 'custom'
  customHeight?: number; // mm, required when paperSize === 'custom'
}

/** Paper sizes in mm */
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
};

export const MM_TO_PX = 3.7795275591; // 1mm = 3.78px at 96dpi

/** Get effective paper dimensions in mm, accounting for orientation. */
export function getPaperDimensions(cfg: PaperConfig): { width: number; height: number } {
  const base = cfg.paperSize === 'custom'
    ? { width: cfg.customWidth ?? 420, height: cfg.customHeight ?? 594 }
    : PAPER_SIZES[cfg.paperSize] ?? PAPER_SIZES.A2;
  return cfg.orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : base;
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
