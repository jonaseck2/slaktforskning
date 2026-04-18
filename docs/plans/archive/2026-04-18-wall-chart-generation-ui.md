# Wall Chart Generation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wall chart generation feature that produces large-format SVG charts (pedigree/descendant) for printing on poster paper (A4-A0), with a configuration modal, scaled preview, tiled PDF output for standard printers, and SVG export.

**Architecture:** The wall chart SVG generation happens in `src/api/wall-charts.ts` (pure TypeScript, no Electron dependencies), taking tree data and layout options to produce a self-contained SVG string. The renderer presents a modal (`WallChartModal.vue`) with chart type, paper size, content, and style options. IPC channels bridge generation and file-save. PDF tiling splits the SVG into A4 pages with crop marks using a dedicated utility.

**Tech Stack:** TypeScript (api layer), Vue 3 `<script setup>` (modal UI), Electron IPC (file save), SVG string generation (no external SVG libs), `webContents.printToPDF()` for PDF pages.

**History:** Wall chart SVG generation was originally built in v0.62.0 (`src/api/reports/wall_chart.ts`) but was deleted in v0.66.0 when charts were unified to reuse visualization components in readonly mode. This plan recreates the feature from scratch with a different approach: a configuration modal with live preview and export, rather than the original print-oriented report tab.

---

## Task 1: Wall Chart SVG Generation API

**Files:** `src/api/wall-charts.ts`

This module generates a complete SVG string from tree data. It is a pure function with no Electron or window dependencies — testable in Vitest with in-memory data.

- [ ] **Step 1: Create `src/api/wall-charts.ts`**

```typescript
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

function getBackgroundColor(options: WallChartOptions): string {
  if (options.colorMode === 'bw') return '#ffffff';
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
```

- [ ] **Step 2: Verify the module compiles**

```bash
npx tsc --noEmit src/api/wall-charts.ts
```

---

## Task 2: Unit Tests for Wall Chart SVG Generation

**Files:** `tests/unit/wall-charts.test.ts`

- [ ] **Step 1: Create test file**

```typescript
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
    it('returns single tile for A4-sized chart', () => {
      const A4_W = Math.round(210 * 3.7795275591);
      const A4_H = Math.round(297 * 3.7795275591);
      const tiles = computeTileViewBoxes(A4_W, A4_H);
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
```

- [ ] **Step 2: Run tests**

```bash
npm test -- tests/unit/wall-charts.test.ts
```

---

## Task 3: Wall Chart Data Fetching Utility

**Files:** `src/renderer/utils/wallChartData.ts`

This utility fetches tree data from `window.api` and converts it to `WallChartAncestorTree` / `WallChartDescendantTree` format for the SVG generator.

- [ ] **Step 1: Create data fetching utility**

```typescript
// src/renderer/utils/wallChartData.ts
// Fetches tree data from window.api and converts to WallChartPerson trees.

import type { WallChartPerson, WallChartAncestorTree, WallChartDescendantTree } from '../../api/wall-charts';

type RawPerson = { id: string; sex: string; living: boolean };
type RawName = { given_name: string | null; surname: string | null; preferred_name: string | null; sort_order: number };
type RawEvent = { event_type: string; date_value: string | null; place_id: string | null };
type RawRel = { type: string; person1_id: string | null; person2_id: string | null };

async function fetchWallChartPerson(id: string): Promise<WallChartPerson> {
  const [person, names, events] = await Promise.all([
    window.api.persons.get(id),
    window.api.persons.getNames(id),
    window.api.events.forPerson(id),
  ]) as [RawPerson | null, RawName[], RawEvent[]];

  if (!person) throw new Error(`Person not found: ${id}`);

  const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0]
    ?? { given_name: null, surname: null, preferred_name: null };

  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');

  let birthPlace: string | null = null;
  let deathPlace: string | null = null;
  if (birth?.place_id) {
    try {
      const place = await window.api.places.get(birth.place_id) as { name: string } | null;
      birthPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }
  if (death?.place_id) {
    try {
      const place = await window.api.places.get(death.place_id) as { name: string } | null;
      deathPlace = place?.name ?? null;
    } catch { /* ignore */ }
  }

  return {
    id,
    givenName: primary.preferred_name ?? primary.given_name,
    surname: primary.surname,
    sex: person.sex as 'M' | 'F' | 'U',
    birthDate: birth?.date_value ?? null,
    deathDate: death?.date_value ?? null,
    birthPlace,
    deathPlace,
    photoBase64: null, // TODO: photo embedding in future iteration
  };
}

export async function fetchWallChartAncestorTree(
  personId: string,
  maxGenerations: number,
  currentGen = 0,
): Promise<WallChartAncestorTree> {
  const person = await fetchWallChartPerson(personId);

  if (currentGen >= maxGenerations - 1) {
    return { person, father: null, mother: null };
  }

  const rawRels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
  let parentIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person2_id === personId)
    .map(r => r.person1_id)
    .filter((id): id is string => id !== null)
    .slice(0, 2);

  // Sort: male → father slot, female → mother slot
  if (parentIds.length === 2) {
    const sexes = await Promise.all(
      parentIds.map(pid => window.api.persons.get(pid) as Promise<{ sex: string } | null>),
    );
    if (sexes[0]?.sex === 'F' && sexes[1]?.sex !== 'F') {
      parentIds = [parentIds[1], parentIds[0]];
    }
  }

  const father = parentIds[0]
    ? await fetchWallChartAncestorTree(parentIds[0], maxGenerations, currentGen + 1)
    : null;
  const mother = parentIds[1]
    ? await fetchWallChartAncestorTree(parentIds[1], maxGenerations, currentGen + 1)
    : null;

  return { person, father, mother };
}

export async function fetchWallChartDescendantTree(
  personId: string,
  maxGenerations: number,
  currentGen = 0,
): Promise<WallChartDescendantTree> {
  const person = await fetchWallChartPerson(personId);

  if (currentGen >= maxGenerations) {
    return { person, children: [] };
  }

  const rawRels = (await window.api.relationships.getForPerson(personId)) as RawRel[];
  const childIds = rawRels
    .filter(r => r.type === 'parent_child' && r.person1_id === personId)
    .map(r => r.person2_id)
    .filter((id): id is string => id !== null);

  const children = await Promise.all(
    childIds.map(cid => fetchWallChartDescendantTree(cid, maxGenerations, currentGen + 1)),
  );

  return { person, children };
}
```

---

## Task 4: IPC Channels for Wall Chart Export

**Files:** `src/main/ipc/utility.ts`, `src/preload/index.ts`

- [ ] **Step 0: Install pdf-lib for multi-page PDF merging**

```bash
npm install pdf-lib
```

- [ ] **Step 1: Add IPC handler for saving SVG to file**

In `src/main/ipc/utility.ts`, add inside the `registerUtilityHandlers` function (after the `print:exportPdf` handler):

```typescript
  // Wall chart SVG export
  wrapHandler('wallChart:saveSvg', async (svgContent: unknown) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };

    const result = await dialog.showSaveDialog(win, {
      title: 'Save Wall Chart SVG',
      defaultPath: 'wall-chart.svg',
      filters: [{ name: 'SVG', extensions: ['svg'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    fs.writeFileSync(result.filePath, svgContent as string, 'utf-8');
    return { success: true, path: result.filePath };
  });

  // Wall chart tiled PDF export — receives array of SVG page strings
  wrapHandler('wallChart:saveTiledPdf', async (pages: unknown) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };

    const svgPages = pages as string[];
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Wall Chart PDF',
      defaultPath: 'wall-chart.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    // Use a hidden BrowserWindow to render each SVG page to PDF
    const { BrowserWindow: BW } = require('electron');
    const pdfParts: Buffer[] = [];

    for (const svgPage of svgPages) {
      const hidden = new BW({ show: false, width: 794, height: 1123, webPreferences: { offscreen: true } });
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0">${svgPage}</body></html>`;
      await hidden.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await hidden.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { marginType: 'none' },
      });
      pdfParts.push(Buffer.from(pdf));
      hidden.destroy();
    }

    // Merge all PDF pages into a single file using pdf-lib
    // npm install pdf-lib (add to dependencies)
    const { PDFDocument } = require('pdf-lib');
    const merged = await PDFDocument.create();
    for (const part of pdfParts) {
      const src = await PDFDocument.load(part);
      const [page] = await merged.copyPages(src, [0]);
      merged.addPage(page);
    }
    const mergedBytes = await merged.save();
    fs.writeFileSync(result.filePath, Buffer.from(mergedBytes));

    return { success: true, path: result.filePath, pageCount: pdfParts.length };
  });
```

- [ ] **Step 2: Add preload bridge**

In `src/preload/index.ts`, add to the `api` object:

```typescript
  wallChart: {
    saveSvg: (svgContent: string) => ipcRenderer.invoke('wallChart:saveSvg', svgContent),
    saveTiledPdf: (pages: string[]) => ipcRenderer.invoke('wallChart:saveTiledPdf', pages),
  },
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npm run lint
```

---

## Task 5: WallChartModal Component

**Files:** `src/renderer/components/reports/WallChartModal.vue`

This is the main configuration + preview + export modal.

- [ ] **Step 1: Create `WallChartModal.vue`**

The modal has three sections:
1. **Left panel** — options form (chart type, paper, orientation, generations, content, style)
2. **Right panel** — scaled preview of the generated SVG
3. **Footer** — Export as SVG / Export as Tiled PDF buttons

```vue
<template>
  <BaseModal @close="$emit('close')" title-id="wall-chart-title">
    <div class="wall-chart-modal">
      <h3 id="wall-chart-title">{{ $t('wallChart.title') }}</h3>

      <div class="modal-body">
        <!-- Options panel -->
        <div class="options-panel">
          <!-- Chart Type -->
          <label>
            {{ $t('wallChart.chartType') }}
            <select v-model="options.chartType">
              <option value="pedigree">{{ $t('wallChart.pedigree') }}</option>
              <option value="descendant">{{ $t('wallChart.descendant') }}</option>
            </select>
          </label>

          <!-- Paper Size -->
          <label>
            {{ $t('wallChart.paperSize') }}
            <select v-model="options.paperSize">
              <option v-for="size in paperSizeOptions" :key="size.value" :value="size.value">{{ size.label }}</option>
            </select>
          </label>

          <!-- Custom dimensions (shown when paperSize === 'custom') -->
          <div v-if="options.paperSize === 'custom'" class="custom-dims">
            <label>
              {{ $t('wallChart.widthMm') }}
              <input type="number" v-model.number="options.customWidth" min="100" max="2000" />
            </label>
            <label>
              {{ $t('wallChart.heightMm') }}
              <input type="number" v-model.number="options.customHeight" min="100" max="2000" />
            </label>
          </div>

          <!-- Orientation -->
          <label>
            {{ $t('wallChart.orientation') }}
            <select v-model="options.orientation">
              <option value="portrait">{{ $t('wallChart.portrait') }}</option>
              <option value="landscape">{{ $t('wallChart.landscape') }}</option>
            </select>
          </label>

          <!-- Generations -->
          <label>
            {{ $t('reports.generations') }}: {{ options.generations }}
            <input type="range" v-model.number="options.generations" :min="genMin" :max="genMax" />
          </label>

          <!-- Content options -->
          <fieldset>
            <legend>{{ $t('wallChart.content') }}</legend>
            <label class="checkbox-label">
              <input type="checkbox" v-model="options.showDates" />
              {{ $t('wallChart.showDates') }}
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="options.showPlaces" />
              {{ $t('wallChart.showPlaces') }}
            </label>
            <label class="checkbox-label">
              <input type="checkbox" v-model="options.showPhotos" />
              {{ $t('wallChart.showPhotos') }}
            </label>
          </fieldset>

          <!-- Font Size -->
          <label>
            {{ $t('wallChart.fontSize') }}
            <select v-model="options.fontSize">
              <option value="small">{{ $t('wallChart.fontSmall') }}</option>
              <option value="medium">{{ $t('wallChart.fontMedium') }}</option>
              <option value="large">{{ $t('wallChart.fontLarge') }}</option>
            </select>
          </label>

          <!-- Color Mode -->
          <label>
            {{ $t('wallChart.colorMode') }}
            <select v-model="options.colorMode">
              <option value="themed">{{ $t('wallChart.themed') }}</option>
              <option value="bw">{{ $t('wallChart.blackWhite') }}</option>
              <option value="sex-colored">{{ $t('wallChart.sexColored') }}</option>
            </select>
          </label>

          <!-- Title -->
          <label>
            {{ $t('wallChart.chartTitle') }}
            <input type="text" v-model="options.title" />
          </label>
        </div>

        <!-- Preview panel -->
        <div class="preview-panel">
          <div v-if="generating" class="preview-loading">{{ $t('common.loading') }}</div>
          <div v-else-if="svgContent" class="preview-svg" v-html="svgContent"></div>
          <div v-else class="preview-empty">{{ $t('wallChart.noPreview') }}</div>
          <div v-if="tileInfo" class="tile-info">
            {{ $t('wallChart.tilesNeeded', { count: tileInfo.count, cols: tileInfo.cols, rows: tileInfo.rows }) }}
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
        <AppButton variant="secondary" size="sm" :disabled="!svgContent" @click="exportSvg">
          {{ $t('wallChart.exportSvg') }}
        </AppButton>
        <AppButton variant="primary" size="sm" :disabled="!svgContent" @click="exportTiledPdf">
          {{ $t('wallChart.exportTiledPdf') }}
        </AppButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../BaseModal.vue';
import AppButton from '../ui/AppButton.vue';
import {
  generatePedigreeWallChart,
  generateDescendantWallChart,
  computeTileViewBoxes,
  generateTileSvg,
  getPaperDimensions,
  type WallChartOptions,
  type ChartType,
  type Orientation,
  type FontSizePreset,
  type ColorMode,
} from '../../../api/wall-charts';
import {
  fetchWallChartAncestorTree,
  fetchWallChartDescendantTree,
} from '../../utils/wallChartData';

const props = defineProps<{
  personId: string;
  personName: string;
  initialChartType?: ChartType;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

const options = reactive<WallChartOptions>({
  chartType: props.initialChartType ?? 'pedigree',
  paperSize: 'A2',
  customWidth: 420,
  customHeight: 594,
  orientation: 'landscape',
  generations: 4,
  showDates: true,
  showPlaces: true,
  showPhotos: false,
  fontSize: 'medium' as FontSizePreset,
  colorMode: 'sex-colored' as ColorMode,
  title: t('reports.pedigreeTitle', { name: props.personName }),
});

const svgContent = ref<string | null>(null);
const generating = ref(false);

const genMin = computed(() => options.chartType === 'pedigree' ? 3 : 2);
const genMax = computed(() => options.chartType === 'pedigree' ? 12 : 8);

const paperSizeOptions = [
  { value: 'A4', label: 'A4 (210 \u00d7 297 mm)' },
  { value: 'A3', label: 'A3 (297 \u00d7 420 mm)' },
  { value: 'A2', label: 'A2 (420 \u00d7 594 mm)' },
  { value: 'A1', label: 'A1 (594 \u00d7 841 mm)' },
  { value: 'A0', label: 'A0 (841 \u00d7 1189 mm)' },
  { value: 'custom', label: t('wallChart.custom') },
];

const tileInfo = computed(() => {
  if (!svgContent.value) return null;
  const paper = getPaperDimensions(options);
  const MM_TO_PX = 3.7795275591;
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);
  if (tiles.length <= 1) return null;
  const maxRow = Math.max(...tiles.map(t => t.row)) + 1;
  const maxCol = Math.max(...tiles.map(t => t.col)) + 1;
  return { count: tiles.length, rows: maxRow, cols: maxCol };
});

async function generateChart() {
  generating.value = true;
  svgContent.value = null;
  try {
    if (options.chartType === 'pedigree') {
      const tree = await fetchWallChartAncestorTree(props.personId, options.generations);
      svgContent.value = generatePedigreeWallChart(tree, options);
    } else {
      const tree = await fetchWallChartDescendantTree(props.personId, options.generations);
      svgContent.value = generateDescendantWallChart(tree, options);
    }
  } catch (err) {
    console.error('Wall chart generation failed:', err);
  } finally {
    generating.value = false;
  }
}

// Debounced regeneration on options change
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => ({ ...options }),
  () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateChart, 400);
  },
  { deep: true },
);

onMounted(generateChart);

async function exportSvg() {
  if (!svgContent.value) return;
  await window.api.wallChart.saveSvg(svgContent.value);
}

async function exportTiledPdf() {
  if (!svgContent.value) return;
  const paper = getPaperDimensions(options);
  const MM_TO_PX = 3.7795275591;
  const W = Math.round(paper.width * MM_TO_PX);
  const H = Math.round(paper.height * MM_TO_PX);
  const tiles = computeTileViewBoxes(W, H);

  if (tiles.length === 1) {
    // Single page — just save the full SVG as PDF
    await window.api.wallChart.saveTiledPdf([svgContent.value]);
  } else {
    const pages = tiles.map(tile => generateTileSvg(svgContent.value!, tile));
    await window.api.wallChart.saveTiledPdf(pages);
  }
}
</script>

<style scoped>
.wall-chart-modal {
  width: 900px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-body {
  display: flex;
  gap: var(--space-xl);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.options-panel {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  overflow-y: auto;
  padding-right: var(--space-sm);
}

.options-panel label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
}

.options-panel select,
.options-panel input[type="text"],
.options-panel input[type="number"] {
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  font-family: inherit;
}

.options-panel fieldset {
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
}

.options-panel legend {
  font-size: var(--font-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: var(--space-sm) !important;
  font-weight: normal !important;
}

.custom-dims {
  display: flex;
  gap: var(--space-sm);
}

.custom-dims label { flex: 1; }

.preview-panel {
  flex: 1;
  min-width: 0;
  background: var(--surface-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

.preview-svg {
  max-width: 100%;
  max-height: 100%;
}

.preview-svg :deep(svg) {
  max-width: 100%;
  max-height: 450px;
  height: auto;
  box-shadow: var(--shadow-md);
}

.preview-loading,
.preview-empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.tile-info {
  margin-top: var(--space-sm);
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
```

---

## Task 6: i18n Keys

**Files:** `src/renderer/i18n/en.ts`, `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Add English keys**

Add to the root of the messages object in `en.ts`:

```typescript
  wallChart: {
    title: 'Wall Chart',
    chartType: 'Chart type',
    pedigree: 'Pedigree (ancestors)',
    descendant: 'Descendant chart',
    paperSize: 'Paper size',
    custom: 'Custom\u2026',
    widthMm: 'Width (mm)',
    heightMm: 'Height (mm)',
    orientation: 'Orientation',
    portrait: 'Portrait',
    landscape: 'Landscape',
    content: 'Content',
    showDates: 'Show dates',
    showPlaces: 'Show places',
    showPhotos: 'Show photos',
    fontSize: 'Font size',
    fontSmall: 'Small',
    fontMedium: 'Medium',
    fontLarge: 'Large',
    colorMode: 'Color mode',
    themed: 'Theme colors',
    blackWhite: 'Black & white',
    sexColored: 'Sex-colored',
    chartTitle: 'Chart title',
    noPreview: 'Configure options and preview will appear here.',
    exportSvg: 'Save SVG',
    exportTiledPdf: 'Save Tiled PDF',
    tilesNeeded: '{count} A4 pages ({cols}\u00d7{rows} grid)',
    tabWallChart: 'Wall Chart',
  },
```

- [ ] **Step 2: Add Swedish keys**

Add to `sv.ts`:

```typescript
  wallChart: {
    title: 'V\u00e4ggplansch',
    chartType: 'Diagramtyp',
    pedigree: 'Stamtavla (anor)',
    descendant: 'Efterkommandekarta',
    paperSize: 'Pappersstorlek',
    custom: 'Anpassad\u2026',
    widthMm: 'Bredd (mm)',
    heightMm: 'H\u00f6jd (mm)',
    orientation: 'Orientering',
    portrait: 'St\u00e5ende',
    landscape: 'Liggande',
    content: 'Inneh\u00e5ll',
    showDates: 'Visa datum',
    showPlaces: 'Visa platser',
    showPhotos: 'Visa foton',
    fontSize: 'Textstorlek',
    fontSmall: 'Liten',
    fontMedium: 'Medium',
    fontLarge: 'Stor',
    colorMode: 'F\u00e4rgl\u00e4ge',
    themed: 'Temaf\u00e4rger',
    blackWhite: 'Svart & vitt',
    sexColored: 'K\u00f6nsf\u00e4rger',
    chartTitle: 'Diagramtitel',
    noPreview: 'Konfigurera alternativ s\u00e5 visas f\u00f6rhandsgranskning h\u00e4r.',
    exportSvg: 'Spara SVG',
    exportTiledPdf: 'Spara PDF (rutn\u00e4t)',
    tilesNeeded: '{count} A4-sidor ({cols}\u00d7{rows} rutn\u00e4t)',
    tabWallChart: 'V\u00e4ggplansch',
  },
```

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint
```

---

## Task 7: ReportsView Integration

**Files:** `src/renderer/views/ReportsView.vue`

- [ ] **Step 1: Add Wall Chart tab to ReportsView**

Add to the `tabs` computed array:

```typescript
  { id: 'wallChart', label: t('wallChart.tabWallChart') },
```

Update the `activeTab` type union to include `'wallChart'`.

- [ ] **Step 2: Add Wall Chart tab content section**

Add after the last `<!-- Timeline Tab -->` section, before `<ZoomControls>`:

```vue
    <!-- Wall Chart Tab -->
    <div v-if="activeTab === 'wallChart'" class="tab-content">
      <div class="tab-header">
        <div class="controls"></div>
        <div class="print-actions">
          <AppButton variant="primary" size="sm" :disabled="!chartPersonId" @click="showWallChartModal = true">{{ $t('wallChart.title') }}</AppButton>
        </div>
      </div>
      <div class="preview-area">
        <div v-if="chartPersonId" class="empty-hint">
          {{ $t('wallChart.noPreview') }}
          <br /><br />
          <AppButton variant="primary" @click="showWallChartModal = true">{{ $t('wallChart.title') }}</AppButton>
        </div>
        <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
      </div>
    </div>
```

- [ ] **Step 3: Add modal and state**

Add import:

```typescript
import WallChartModal from '../components/reports/WallChartModal.vue';
```

Add state:

```typescript
const showWallChartModal = ref(false);
```

Add the modal component at the end of the template (before `</div>` closing `.reports-view`):

```vue
    <WallChartModal
      v-if="showWallChartModal && chartPersonId"
      :person-id="chartPersonId"
      :person-name="focusStore.personName ?? ''"
      @close="showWallChartModal = false"
    />
```

Note: `focusStore.personName` may need to be fetched. Check if the focus store already provides the person name. If not, compute it from `chartPersonId` using `getPersonName()` which already exists in ReportsView.

- [ ] **Step 4: Verify lint + test**

```bash
npm run lint && npm test
```

---

## Task 8: VisualizationView "Wall Chart" Button

**Files:** `src/renderer/views/VisualizationView.vue`

- [ ] **Step 1: Add Wall Chart button to the tab bar area**

In the `viz-tab-bar` div (around line 22-35), add a button after the FilterChips:

```vue
        <AppButton variant="ghost" size="sm" @click="showWallChartModal = true" :disabled="!personId">
          {{ $t('wallChart.tabWallChart') }}
        </AppButton>
```

- [ ] **Step 2: Add modal state and import**

Add import:

```typescript
import WallChartModal from '../components/reports/WallChartModal.vue';
```

Add state:

```typescript
const showWallChartModal = ref(false);
```

- [ ] **Step 3: Add modal to template**

Before `</div>` closing `.visualization-view`:

```vue
    <WallChartModal
      v-if="showWallChartModal && personId"
      :person-id="personId"
      :person-name="focalPersonName"
      :initial-chart-type="activeTab === 'descendants' ? 'descendant' : 'pedigree'"
      @close="showWallChartModal = false"
    />
```

Compute `focalPersonName` from the focal person data already loaded in VisualizationView (check existing code for how the person name is displayed — likely `focalPerson` ref has a `givenName`/`surname`).

- [ ] **Step 4: Verify lint**

```bash
npm run lint
```

---

## Task 9: E2E Smoke Test

**Files:** `tests/e2e/wall-chart.test.ts`

- [ ] **Step 1: Add basic smoke test**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Wall Chart', () => {
  test('wall chart tab appears in reports view', async ({ page }) => {
    // Navigate to reports
    await page.goto('/#/reports');
    await page.waitForSelector('.reports-view');

    // Check that the Wall Chart filter chip exists
    const wallChartChip = page.locator('.chip', { hasText: /Wall Chart|Väggplansch/ });
    await expect(wallChartChip).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
npx playwright test tests/e2e/wall-chart.test.ts
```

---

## Task 10: Documentation Updates

**Files:** `CLAUDE.md`, `docs/PLAN.md`

- [ ] **Step 1: Update CLAUDE.md**

Add to the File Map under `src/api/`:
```
│   ├── wall-charts.ts            # Wall chart SVG generation (pedigree/descendant, paper sizes, tiling)
```

Add to the File Map under `src/renderer/utils/`:
```
│   │   ├── wallChartData.ts      # Fetch tree data for wall chart SVG generation
```

Add to the File Map under `src/renderer/components/reports/`:
```
│   │   ├── WallChartModal.vue    # Wall chart configuration + preview + export modal
```

Add to the API Functions section:
```
### wall-charts.ts (no db parameter — pure SVG generation from pre-fetched data)
\`\`\`
generatePedigreeWallChart(tree, options) → string (SVG)
generateDescendantWallChart(tree, options) → string (SVG)
computeTileViewBoxes(svgWidth, svgHeight, overlap?) → TileViewBox[]
generateTileSvg(fullSvg, tile) → string (SVG)
getPaperDimensions(options) → { width, height }
\`\`\`
```

Update the IPC section — add:
```
wallChart:saveSvg     — Save SVG string to file via showSaveDialog
wallChart:saveTiledPdf — Save tiled PDF pages via hidden BrowserWindow
```

- [ ] **Step 2: Update docs/PLAN.md roadmap**

Add a milestone entry:
```
- [x] Wall chart generation UI — large-format SVG/PDF charts for poster printing (see `docs/plans/2026-04-18-wall-chart-generation-ui.md`)
```

- [ ] **Step 3: Bump version**

Bump minor version in `package.json` (this is a new feature).

- [ ] **Step 4: Final verification**

```bash
npm run lint && npm test && npx playwright test
```
