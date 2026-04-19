import { describe, it, expect } from 'vitest';
import {
  PAPER_SIZES,
  getPaperDimensions,
  computeTileViewBoxes,
  generateTileSvg,
  type PaperSize,
  type Orientation,
  type ColorMode,
} from '../../src/api/chart-export';

describe('getPaperDimensions', () => {
  it('returns A4 portrait dimensions by default', () => {
    expect(getPaperDimensions({ paperSize: 'A4', orientation: 'portrait' }))
      .toEqual({ width: 210, height: 297 });
  });
  it('swaps width and height for landscape', () => {
    expect(getPaperDimensions({ paperSize: 'A4', orientation: 'landscape' }))
      .toEqual({ width: 297, height: 210 });
  });
  it('returns A2 dimensions when A2 is selected', () => {
    const dims = getPaperDimensions({ paperSize: 'A2', orientation: 'portrait' });
    expect(dims).toEqual({ width: 420, height: 594 });
  });
  it('returns custom dimensions when paperSize is custom', () => {
    const dims = getPaperDimensions({
      paperSize: 'custom',
      orientation: 'portrait',
      customWidth: 500,
      customHeight: 700,
    });
    expect(dims).toEqual({ width: 500, height: 700 });
  });
});

describe('computeTileViewBoxes', () => {
  it('returns a single tile when SVG fits on one A4 page', () => {
    const tiles = computeTileViewBoxes(500, 700);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].row).toBe(0);
    expect(tiles[0].col).toBe(0);
  });
  it('produces a grid for oversize SVG', () => {
    const tiles = computeTileViewBoxes(2000, 3000);
    expect(tiles.length).toBeGreaterThan(1);
    const cols = Math.max(...tiles.map(t => t.col)) + 1;
    const rows = Math.max(...tiles.map(t => t.row)) + 1;
    expect(cols * rows).toBe(tiles.length);
  });
});

describe('generateTileSvg', () => {
  it('wraps inner content in a new viewBox with crop marks', () => {
    const fullSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100"/></svg>';
    const tile = { x: 0, y: 0, width: 794, height: 1123, row: 0, col: 0 };
    const out = generateTileSvg(fullSvg, tile);
    expect(out).toContain('<svg');
    expect(out).toContain('viewBox="0 0 794 1123"');
    expect(out).toContain('<rect');
    expect(out).toContain('stroke="#000"'); // crop marks
  });
});
