import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, wcagThreshold, NON_TEXT_THRESHOLD } from '../../src/renderer/utils/wcag';

const TOKENS_CSS = readFileSync(
  resolve(__dirname, '../../src/renderer/styles/tokens.css'),
  'utf8',
);
const SHARED_CSS = readFileSync(
  resolve(__dirname, '../../src/renderer/styles/shared.css'),
  'utf8',
);

type Palette = Record<string, string>;

/**
 * Extract the contents of every top-level block whose selector group contains
 * the given selector. Respects one level of brace nesting.
 */
function extractBlocks(css: string, selector: string): string[] {
  const blocks: string[] = [];
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:^|[,\\s}])${escaped}(?=[\\s,{])[^{]*\\{`,
    'gm',
  );

  for (const m of css.matchAll(re)) {
    const braceStart = (m.index ?? 0) + m[0].length - 1;
    let depth = 1;
    let i = braceStart + 1;
    while (i < css.length && depth > 0) {
      const c = css[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (depth === 0) break;
      i++;
    }
    blocks.push(css.slice(braceStart + 1, i));
  }
  return blocks;
}

function parseVars(blockContent: string): Palette {
  const out: Palette = {};
  const re = /--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))\s*;/g;
  for (const m of blockContent.matchAll(re)) {
    out[m[1]] = m[2];
  }
  return out;
}

function mergeBlocks(css: string, selector: string): Palette {
  const blocks = extractBlocks(css, selector);
  const p: Palette = {};
  for (const b of blocks) Object.assign(p, parseVars(b));
  return p;
}

type Theme = 'forest' | 'nordic' | 'twilight';
type Appearance = 'light' | 'dark' | 'high-contrast';

function buildPalette(theme: Theme, appearance: Appearance): Palette {
  const p: Palette = {};

  Object.assign(p, mergeBlocks(TOKENS_CSS, ':root'));

  if (theme === 'nordic') Object.assign(p, mergeBlocks(TOKENS_CSS, '.theme-nordic'));
  if (theme === 'twilight') Object.assign(p, mergeBlocks(TOKENS_CSS, '.theme-twilight'));

  if (appearance === 'dark') {
    Object.assign(p, mergeBlocks(SHARED_CSS, 'html.dark'));
    if (theme === 'forest') Object.assign(p, mergeBlocks(SHARED_CSS, 'html.dark.theme-forest'));
    if (theme === 'nordic') Object.assign(p, mergeBlocks(SHARED_CSS, 'html.dark.theme-nordic'));
    if (theme === 'twilight') Object.assign(p, mergeBlocks(SHARED_CSS, 'html.dark.theme-twilight'));
  }

  if (appearance === 'high-contrast') {
    Object.assign(p, mergeBlocks(SHARED_CSS, 'html.high-contrast'));
    if (theme === 'forest') Object.assign(p, mergeBlocks(SHARED_CSS, 'html.high-contrast.theme-forest'));
    if (theme === 'nordic') Object.assign(p, mergeBlocks(SHARED_CSS, 'html.high-contrast.theme-nordic'));
    if (theme === 'twilight') Object.assign(p, mergeBlocks(SHARED_CSS, 'html.high-contrast.theme-twilight'));
  }

  return p;
}

type TextSize = 'normal' | 'large';

interface TextPair {
  label: string;
  fg: string;
  bg: string;
  size?: TextSize;
}

const TEXT_PAIRS: TextPair[] = [
  { label: 'text-primary on surface', fg: 'text-primary', bg: 'surface' },
  { label: 'text-primary on surface-bg', fg: 'text-primary', bg: 'surface-bg' },
  { label: 'text-primary on surface-hover', fg: 'text-primary', bg: 'surface-hover' },
  { label: 'text-secondary on surface', fg: 'text-secondary', bg: 'surface' },
  { label: 'text-secondary on surface-bg', fg: 'text-secondary', bg: 'surface-bg' },
  { label: 'text-muted on surface', fg: 'text-muted', bg: 'surface', size: 'large' },
  { label: 'text-muted on surface-bg', fg: 'text-muted', bg: 'surface-bg', size: 'large' },

  { label: 'accent-text on accent', fg: 'accent-text', bg: 'accent' },
  { label: 'accent-text on accent-hover', fg: 'accent-text', bg: 'accent-hover' },

  { label: 'sidebar-text on sidebar-bg', fg: 'sidebar-text', bg: 'sidebar-bg' },
  { label: 'sidebar-active-text on sidebar-active-bg', fg: 'sidebar-active-text', bg: 'sidebar-active-bg' },
  { label: 'sidebar-text-muted on sidebar-bg', fg: 'sidebar-text-muted', bg: 'sidebar-bg', size: 'large' },

  { label: 'error-text on error-bg', fg: 'error-text', bg: 'error-bg' },
  { label: 'warning-text on warning-bg', fg: 'warning-text', bg: 'warning-bg' },
  { label: 'success-text on success-bg', fg: 'success-text', bg: 'success-bg' },
  { label: 'info-text on info-bg', fg: 'info-text', bg: 'info-bg' },

  { label: 'sex-m-text on sex-m-bg', fg: 'sex-m-text', bg: 'sex-m-bg', size: 'large' },
  { label: 'sex-f-text on sex-f-bg', fg: 'sex-f-text', bg: 'sex-f-bg', size: 'large' },
  { label: 'sex-u-text on sex-u-bg', fg: 'sex-u-text', bg: 'sex-u-bg', size: 'large' },
];

interface UiPair {
  label: string;
  fg: string;
  bg: string;
}

const UI_PAIRS: UiPair[] = [
  { label: 'surface-border on surface-bg', fg: 'surface-border', bg: 'surface-bg' },
  { label: 'surface-border on surface', fg: 'surface-border', bg: 'surface' },
];

const ENTITIES = [
  'person', 'event', 'source', 'citation', 'place',
  'relationship', 'task', 'group', 'name', 'identifier', 'neutral',
] as const;

const ENTITY_TEXT_PAIRS: TextPair[] = ENTITIES.map(e => ({
  label: `entity-${e}-text on entity-${e}-bg`,
  fg: `entity-${e}-text`,
  bg: `entity-${e}-bg`,
}));

function assertPair(p: Palette, pair: TextPair, level: 'AA' | 'AAA'): void {
  const fgHex = p[pair.fg];
  const bgHex = p[pair.bg];
  expect(fgHex, `missing --${pair.fg}`).toBeTruthy();
  expect(bgHex, `missing --${pair.bg}`).toBeTruthy();
  const ratio = contrastRatio(fgHex!, bgHex!);
  const threshold = wcagThreshold(level, pair.size ?? 'normal');
  expect(
    ratio,
    `${pair.label}: ${ratio.toFixed(2)}:1 (${fgHex} on ${bgHex}) — need ≥${threshold}:1 for WCAG ${level} ${pair.size ?? 'normal'}`,
  ).toBeGreaterThanOrEqual(threshold);
}

function assertUiPair(p: Palette, pair: UiPair): void {
  const fgHex = p[pair.fg];
  const bgHex = p[pair.bg];
  expect(fgHex, `missing --${pair.fg}`).toBeTruthy();
  expect(bgHex, `missing --${pair.bg}`).toBeTruthy();
  const ratio = contrastRatio(fgHex!, bgHex!);
  expect(
    ratio,
    `${pair.label}: ${ratio.toFixed(2)}:1 — need ≥${NON_TEXT_THRESHOLD}:1 for non-text UI`,
  ).toBeGreaterThanOrEqual(NON_TEXT_THRESHOLD);
}

describe('WCAG contrast — palette extraction', () => {
  it('parses :root vars from tokens.css', () => {
    const p = mergeBlocks(TOKENS_CSS, ':root');
    expect(p['text-primary']).toMatch(/^#[0-9a-fA-F]+$/);
    expect(p['surface']).toMatch(/^#[0-9a-fA-F]+$/);
    expect(p['accent']).toMatch(/^#[0-9a-fA-F]+$/);
  });

  it('parses .theme-nordic overrides', () => {
    const p = mergeBlocks(TOKENS_CSS, '.theme-nordic');
    expect(p['text-primary']).toBeTruthy();
  });

  it('parses html.high-contrast base (shared semantic) overrides', () => {
    const p = mergeBlocks(SHARED_CSS, 'html.high-contrast');
    // Shared base defines semantic colors; per-theme blocks define text/surface.
    expect(p['error-bg']).toBeTruthy();
    expect(p['error-text']).toBeTruthy();
  });

  it('parses html.high-contrast.theme-forest per-theme overrides', () => {
    const p = mergeBlocks(SHARED_CSS, 'html.high-contrast.theme-forest');
    expect(p['text-primary']).toBeTruthy();
    expect(p['surface']).toBeTruthy();
    expect(p['accent']).toBeTruthy();
  });
});

describe('WCAG AAA — high-contrast mode (theme-tinted)', () => {
  const themes: Theme[] = ['forest', 'nordic', 'twilight'];

  for (const theme of themes) {
    describe(`theme: ${theme}`, () => {
      const palette = buildPalette(theme, 'high-contrast');

      for (const pair of TEXT_PAIRS) {
        it(`${pair.label} ≥ AAA (${pair.size ?? 'normal'})`, () => {
          assertPair(palette, pair, 'AAA');
        });
      }

      for (const pair of UI_PAIRS) {
        it(`${pair.label} ≥ 3:1 (UI)`, () => {
          assertUiPair(palette, pair);
        });
      }

      for (const pair of ENTITY_TEXT_PAIRS) {
        it(`${pair.label} ≥ AAA (high-contrast)`, () => {
          assertPair(palette, pair, 'AAA');
        });
      }
    });
  }
});

describe('WCAG AA — light and dark base themes (regression)', () => {
  const combos: Array<{ theme: Theme; appearance: Appearance }> = [
    { theme: 'forest', appearance: 'light' },
    { theme: 'nordic', appearance: 'light' },
    { theme: 'twilight', appearance: 'light' },
    { theme: 'forest', appearance: 'dark' },
    { theme: 'nordic', appearance: 'dark' },
    { theme: 'twilight', appearance: 'dark' },
  ];

  for (const { theme, appearance } of combos) {
    describe(`${theme} / ${appearance}`, () => {
      const palette = buildPalette(theme, appearance);

      for (const pair of TEXT_PAIRS) {
        it(`${pair.label} ≥ AA (${pair.size ?? 'normal'})`, () => {
          assertPair(palette, pair, 'AA');
        });
      }

      for (const pair of ENTITY_TEXT_PAIRS) {
        it(`${pair.label} ≥ AA (${appearance})`, () => {
          assertPair(palette, pair, 'AA');
        });
      }
    });
  }
});
