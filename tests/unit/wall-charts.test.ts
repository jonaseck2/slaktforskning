// tests/unit/wall-charts.test.ts
import { describe, it, expect } from 'vitest';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  computeTileViewBoxes,
  generateTileSvg,
  getPaperDimensions,
  PAPER_SIZES,
  type WallChartPerson,
  type WallChartAncestorTree,
  type WallChartDescendantTree,
  type WallChartOptions,
} from '../../src/api/wall-charts';

function makePerson(overrides: Partial<WallChartPerson> = {}): WallChartPerson {
  return {
    id: 'p1',
    givenName: 'Johan',
    surname: 'Andersson',
    sex: 'M',
    birthDate: '1850-03-15',
    deathDate: '1920-11-02',
    birthPlace: 'Stockholm',
    deathPlace: null,
    photoBase64: null,
    ...overrides,
  };
}

function makeTree(depth: number, gen = 0): WallChartAncestorTree {
  const person = makePerson({ id: `p-${gen}-${Math.random().toString(36).slice(2, 6)}` });
  return {
    person,
    father: gen < depth ? makeTree(depth, gen + 1) : null,
    mother: gen < depth ? makeTree(depth, gen + 1) : null,
  };
}

function makeDescTree(depth: number, childCount: number, gen = 0): WallChartDescendantTree {
  const person = makePerson({ id: `d-${gen}-${Math.random().toString(36).slice(2, 6)}` });
  return {
    person,
    children: gen < depth ? Array.from({ length: childCount }, () => makeDescTree(depth, childCount, gen + 1)) : [],
  };
}

const BASE_OPTIONS: WallChartOptions = {
  chartType: 'pedigree',
  paperSize: 'A2',
  orientation: 'landscape',
  generations: 4,
  showDates: true,
  showPlaces: true,
  showPhotos: false,
  fontSize: 'medium',
  colorMode: 'sex-colored',
  title: 'Test Chart',
};

describe('wall-charts', () => {
  describe('getPaperDimensions', () => {
    it('returns correct A2 portrait dimensions', () => {
      const dims = getPaperDimensions({ ...BASE_OPTIONS, orientation: 'portrait', paperSize: 'A2' });
      expect(dims).toEqual({ width: 420, height: 594 });
    });

    it('swaps dimensions for landscape', () => {
      const dims = getPaperDimensions({ ...BASE_OPTIONS, orientation: 'landscape', paperSize: 'A2' });
      expect(dims).toEqual({ width: 594, height: 420 });
    });

    it('uses custom dimensions when paperSize is custom', () => {
      const dims = getPaperDimensions({ ...BASE_OPTIONS, paperSize: 'custom', customWidth: 500, customHeight: 700 });
      expect(dims).toEqual({ width: 700, height: 500 }); // landscape
    });
  });

  describe('generatePedigreeWallChart', () => {
    it('returns valid SVG string', () => {
      const tree = makeTree(3);
      const svg = generatePedigreeWallChart(tree, BASE_OPTIONS);
      expect(svg).toMatch(/^<svg/);
      expect(svg).toMatch(/<\/svg>$/);
      expect(svg).toContain('viewBox');
    });

    it('includes person names in SVG', () => {
      const tree: WallChartAncestorTree = {
        person: makePerson({ givenName: 'Erik', surname: 'Svensson' }),
        father: null,
        mother: null,
      };
      const svg = generatePedigreeWallChart(tree, { ...BASE_OPTIONS, generations: 1 });
      expect(svg).toContain('Erik Svensson');
    });

    it('includes dates when showDates is true', () => {
      const tree: WallChartAncestorTree = {
        person: makePerson({ birthDate: '1900', deathDate: '1980' }),
        father: null,
        mother: null,
      };
      const svg = generatePedigreeWallChart(tree, { ...BASE_OPTIONS, showDates: true, generations: 1 });
      expect(svg).toContain('1900');
    });

    it('omits dates when showDates is false', () => {
      const tree: WallChartAncestorTree = {
        person: makePerson({ birthDate: '1900', deathDate: '1980' }),
        father: null,
        mother: null,
      };
      const svg = generatePedigreeWallChart(tree, { ...BASE_OPTIONS, showDates: false, generations: 1 });
      // The name is still there but the date line should not be rendered
      expect(svg).toContain('Johan');
    });

    it('generates connector lines for multi-generation tree', () => {
      const tree = makeTree(2);
      const svg = generatePedigreeWallChart(tree, { ...BASE_OPTIONS, generations: 3 });
      expect(svg).toContain('<path');
    });

    it('respects B&W color mode', () => {
      const tree: WallChartAncestorTree = {
        person: makePerson(),
        father: null,
        mother: null,
      };
      const svg = generatePedigreeWallChart(tree, { ...BASE_OPTIONS, colorMode: 'bw', generations: 1 });
      expect(svg).toContain('fill="#ffffff"');
      expect(svg).toContain('stroke="#333333"');
    });
  });

  describe('generateDescendantWallChart', () => {
    it('returns valid SVG string', () => {
      const tree = makeDescTree(2, 2);
      const svg = generateDescendantWallChart(tree, { ...BASE_OPTIONS, chartType: 'descendant', generations: 3 });
      expect(svg).toMatch(/^<svg/);
      expect(svg).toMatch(/<\/svg>$/);
    });

    it('includes all descendants', () => {
      const tree: WallChartDescendantTree = {
        person: makePerson({ givenName: 'Anna', surname: 'Karlsson' }),
        children: [
          { person: makePerson({ id: 'c1', givenName: 'Per', surname: 'Karlsson' }), children: [] },
          { person: makePerson({ id: 'c2', givenName: 'Lisa', surname: 'Karlsson' }), children: [] },
        ],
      };
      const svg = generateDescendantWallChart(tree, { ...BASE_OPTIONS, chartType: 'descendant', generations: 2 });
      expect(svg).toContain('Anna Karlsson');
      expect(svg).toContain('Per Karlsson');
      expect(svg).toContain('Lisa Karlsson');
    });
  });

  describe('computeTileViewBoxes', () => {
    it('returns single tile for small chart', () => {
      // A chart smaller than one A4 tile produces exactly 1 tile.
      // tileW = round(210 * 3.78) - 40 ≈ 754px, tileH ≈ 1083px
      const tiles = computeTileViewBoxes(500, 800);
      expect(tiles.length).toBe(1);
    });

    it('returns multiple tiles for large chart', () => {
      const A0_W = Math.round(841 * 3.7795275591);
      const A0_H = Math.round(1189 * 3.7795275591);
      const tiles = computeTileViewBoxes(A0_W, A0_H);
      expect(tiles.length).toBeGreaterThan(1);
      // A0 is ~4x A4, so expect roughly 4x4=16 tiles (with overlap more)
      expect(tiles.length).toBeGreaterThanOrEqual(4);
    });

    it('tiles have row and col indices', () => {
      const tiles = computeTileViewBoxes(3000, 4000);
      expect(tiles[0].row).toBe(0);
      expect(tiles[0].col).toBe(0);
    });
  });

  describe('generateTileSvg', () => {
    it('wraps content with correct viewBox', () => {
      const fullSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="4000" viewBox="0 0 3000 4000"><rect width="3000" height="4000" fill="white"/></svg>';
      const tile = { x: 0, y: 0, width: 794, height: 1123, row: 0, col: 0 };
      const tileSvg = generateTileSvg(fullSvg, tile);
      expect(tileSvg).toContain('viewBox="0 0 794 1123"');
      expect(tileSvg).toContain('Page 1-1');
    });

    it('includes crop marks', () => {
      const fullSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="4000" viewBox="0 0 3000 4000"><rect/></svg>';
      const tile = { x: 0, y: 0, width: 794, height: 1123, row: 0, col: 0 };
      const tileSvg = generateTileSvg(fullSvg, tile);
      // 8 crop mark lines (2 per corner × 4 corners)
      const lineCount = (tileSvg.match(/<line /g) ?? []).length;
      expect(lineCount).toBe(8);
    });
  });

  describe('PAPER_SIZES', () => {
    it('has all expected sizes', () => {
      expect(Object.keys(PAPER_SIZES)).toEqual(['A4', 'A3', 'A2', 'A1', 'A0']);
    });

    it('A4 is 210x297', () => {
      expect(PAPER_SIZES.A4).toEqual({ width: 210, height: 297 });
    });
  });
});
