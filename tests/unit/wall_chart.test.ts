import { describe, it, expect } from 'vitest';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  splitIntoTiles,
  expectedPedigreeBoxCount,
  PAPER_SIZES,
  type WallChartPerson,
  type WallChartAncestorTree,
  type WallChartDescendantNode,
} from '../../src/api/reports/wall_chart';

function makePerson(id: string, given: string, surname: string, sex: 'M' | 'F' | 'U' = 'U'): WallChartPerson {
  return { id, givenName: given, surname, preferredName: null, birthDate: '1900-01-01', deathDate: '1980-12-31', sex };
}

describe('wall_chart', () => {
  describe('generatePedigreeWallChart', () => {
    it('generates SVG with correct number of person boxes for 3 generations', () => {
      const nodes = new Map<number, WallChartPerson>();
      // 3 generations: 1 focal + 2 parents + 4 grandparents = 7 persons
      nodes.set(1, makePerson('1', 'Anna', 'Svensson', 'F'));
      nodes.set(2, makePerson('2', 'Erik', 'Svensson', 'M'));
      nodes.set(3, makePerson('3', 'Maria', 'Eriksson', 'F'));
      nodes.set(4, makePerson('4', 'Olof', 'Svensson', 'M'));
      nodes.set(5, makePerson('5', 'Karin', 'Nilsson', 'F'));
      nodes.set(6, makePerson('6', 'Per', 'Eriksson', 'M'));
      nodes.set(7, makePerson('7', 'Britta', 'Larsson', 'F'));

      const tree: WallChartAncestorTree = { nodes, generations: 3 };
      const svg = generatePedigreeWallChart(tree, {
        paperWidth: PAPER_SIZES.A3.width,
        paperHeight: PAPER_SIZES.A3.height,
        generations: 3,
      });

      expect(svg).toContain('<?xml');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('Anna Svensson');
      expect(svg).toContain('Erik Svensson');
      expect(svg).toContain('Britta Larsson');

      // Count <rect> elements = one per person box
      const rectCount = (svg.match(/<rect /g) || []).length;
      expect(rectCount).toBe(7);
    });

    it('handles missing persons (sparse tree)', () => {
      const nodes = new Map<number, WallChartPerson>();
      nodes.set(1, makePerson('1', 'Anna', 'Svensson'));
      nodes.set(2, makePerson('2', 'Erik', 'Svensson', 'M'));
      // Mother (3) is unknown — skip

      const tree: WallChartAncestorTree = { nodes, generations: 2 };
      const svg = generatePedigreeWallChart(tree, {
        paperWidth: PAPER_SIZES.A4.width,
        paperHeight: PAPER_SIZES.A4.height,
        generations: 2,
      });

      const rectCount = (svg.match(/<rect /g) || []).length;
      expect(rectCount).toBe(2);
      expect(svg).toContain('Anna Svensson');
      expect(svg).toContain('Erik Svensson');
    });

    it('includes birth and death years in output', () => {
      const nodes = new Map<number, WallChartPerson>();
      nodes.set(1, makePerson('1', 'Anna', 'Svensson'));

      const tree: WallChartAncestorTree = { nodes, generations: 1 };
      const svg = generatePedigreeWallChart(tree, {
        paperWidth: PAPER_SIZES.A4.width,
        paperHeight: PAPER_SIZES.A4.height,
        generations: 1,
      });

      expect(svg).toContain('1900');
      expect(svg).toContain('1980');
    });

    it('uses correct paper dimensions in SVG', () => {
      const nodes = new Map<number, WallChartPerson>();
      nodes.set(1, makePerson('1', 'Test', 'Person'));

      const tree: WallChartAncestorTree = { nodes, generations: 1 };

      for (const [name, dims] of Object.entries(PAPER_SIZES)) {
        const svg = generatePedigreeWallChart(tree, {
          paperWidth: dims.width,
          paperHeight: dims.height,
          generations: 1,
        });
        expect(svg).toContain(`width="${dims.width}mm"`);
        expect(svg).toContain(`height="${dims.height}mm"`);
      }
    });

    it('colors boxes by sex', () => {
      const nodes = new Map<number, WallChartPerson>();
      nodes.set(1, makePerson('1', 'Anna', 'S', 'F'));
      nodes.set(2, makePerson('2', 'Erik', 'S', 'M'));

      const tree: WallChartAncestorTree = { nodes, generations: 2 };
      const svg = generatePedigreeWallChart(tree, {
        paperWidth: 297, paperHeight: 210, generations: 2,
      });

      expect(svg).toContain('fill="#fce8ef"'); // female
      expect(svg).toContain('fill="#e8f0fe"'); // male
    });
  });

  describe('generateDescendantWallChart', () => {
    it('generates SVG with correct number of boxes', () => {
      const root: WallChartDescendantNode = {
        person: makePerson('1', 'Anna', 'Svensson', 'F'),
        children: [
          {
            person: makePerson('2', 'Erik', 'Svensson', 'M'),
            children: [
              { person: makePerson('4', 'Olof', 'Svensson', 'M'), children: [] },
            ],
          },
          {
            person: makePerson('3', 'Maria', 'Svensson', 'F'),
            children: [],
          },
        ],
      };

      const svg = generateDescendantWallChart(root, {
        paperWidth: PAPER_SIZES.A3.width,
        paperHeight: PAPER_SIZES.A3.height,
        generations: 3,
      });

      expect(svg).toContain('<?xml');
      expect(svg).toContain('<svg');
      const rectCount = (svg.match(/<rect /g) || []).length;
      expect(rectCount).toBe(4);
      expect(svg).toContain('Anna Svensson');
      expect(svg).toContain('Olof Svensson');
    });

    it('handles single person (no children)', () => {
      const root: WallChartDescendantNode = {
        person: makePerson('1', 'Anna', 'Svensson'),
        children: [],
      };

      const svg = generateDescendantWallChart(root, {
        paperWidth: PAPER_SIZES.A4.width,
        paperHeight: PAPER_SIZES.A4.height,
        generations: 1,
      });

      const rectCount = (svg.match(/<rect /g) || []).length;
      expect(rectCount).toBe(1);
    });
  });

  describe('splitIntoTiles', () => {
    it('splits large SVG content into multiple tiles', () => {
      const content = '<rect x="0" y="0" width="420" height="297" fill="white"/>';
      const tiles = splitIntoTiles(content, 420, 297);

      // A3 (420x297) should need 2 columns and 2 rows with A4 tiles
      expect(tiles.length).toBeGreaterThan(1);
      expect(tiles.every(t => t.svg.includes('<svg'))).toBe(true);
      expect(tiles.every(t => t.svg.includes('</svg>'))).toBe(true);
    });

    it('includes crop marks in tiles', () => {
      const content = '<rect x="0" y="0" width="420" height="297" fill="white"/>';
      const tiles = splitIntoTiles(content, 420, 297);

      // Each tile should have crop mark lines
      for (const tile of tiles) {
        expect(tile.svg).toContain('stroke-width="0.3"');
      }
    });

    it('includes tile position label', () => {
      const content = '<rect x="0" y="0" width="600" height="400" fill="white"/>';
      const tiles = splitIntoTiles(content, 600, 400);

      expect(tiles.some(t => t.svg.includes('1-1'))).toBe(true);
      expect(tiles.some(t => t.row > 0 || t.col > 0)).toBe(true);
    });

    it('returns single tile for content smaller than tile step', () => {
      // Step size is TILE_WIDTH - OVERLAP = 277 - 10 = 267
      // Content must be <= 267 wide and <= 180 tall to fit in one tile
      const content = '<rect x="0" y="0" width="200" height="150" fill="white"/>';
      const tiles = splitIntoTiles(content, 200, 150);

      expect(tiles.length).toBe(1);
      expect(tiles[0].row).toBe(0);
      expect(tiles[0].col).toBe(0);
    });
  });

  describe('paper sizes', () => {
    it('has correct standard dimensions', () => {
      expect(PAPER_SIZES.A4).toEqual({ width: 297, height: 210 });
      expect(PAPER_SIZES.A3).toEqual({ width: 420, height: 297 });
      expect(PAPER_SIZES.A0).toEqual({ width: 1189, height: 841 });
    });
  });

  describe('expectedPedigreeBoxCount', () => {
    it('calculates correct count for various generations', () => {
      expect(expectedPedigreeBoxCount(1)).toBe(1);   // just focal
      expect(expectedPedigreeBoxCount(2)).toBe(3);   // focal + 2 parents
      expect(expectedPedigreeBoxCount(3)).toBe(7);   // + 4 grandparents
      expect(expectedPedigreeBoxCount(4)).toBe(15);  // + 8 great-grandparents
      expect(expectedPedigreeBoxCount(5)).toBe(31);
    });
  });
});
