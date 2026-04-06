import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── 1. Text size class toggle ──────────────────────────────────────────────────
// Mirrors App.vue's applyTextSize / setTextSize logic.

function applyTextSize(size: 'small' | 'medium' | 'large') {
  document.documentElement.classList.remove('text-medium', 'text-large');
  if (size === 'medium') document.documentElement.classList.add('text-medium');
  if (size === 'large') document.documentElement.classList.add('text-large');
}

describe('Text size class toggle', () => {
  afterEach(() => {
    document.documentElement.classList.remove('text-medium', 'text-large');
  });

  it('adds text-medium class for medium size', () => {
    applyTextSize('medium');
    expect(document.documentElement.classList.contains('text-medium')).toBe(true);
    expect(document.documentElement.classList.contains('text-large')).toBe(false);
  });

  it('adds text-large class for large size', () => {
    applyTextSize('large');
    expect(document.documentElement.classList.contains('text-large')).toBe(true);
    expect(document.documentElement.classList.contains('text-medium')).toBe(false);
  });

  it('removes size classes for small size', () => {
    document.documentElement.classList.add('text-large');
    applyTextSize('small');
    expect(document.documentElement.classList.contains('text-large')).toBe(false);
    expect(document.documentElement.classList.contains('text-medium')).toBe(false);
  });

  it('switches cleanly from medium to large', () => {
    applyTextSize('medium');
    applyTextSize('large');
    expect(document.documentElement.classList.contains('text-medium')).toBe(false);
    expect(document.documentElement.classList.contains('text-large')).toBe(true);
  });
});

// ── 2. CSS variable coverage — no hardcoded font-size in scoped styles ─────────
// Regression guard: specific views that have been fully converted to CSS vars.
// These files should contain zero occurrences of `font-size: <N>px` in their
// <style scoped> block. Add a file here only when you've done a complete pass.

function extractScopedStyle(source: string): string {
  const match = source.match(/<style scoped>([\s\S]*?)<\/style>/);
  return match ? match[1] : '';
}

function findHardcodedFontSizes(css: string): string[] {
  return (css.match(/font-size:\s*\d+px/g) ?? []).map(m => m.trim());
}

const FULLY_CONVERTED_VIEWS = [
  'views/DatabaseView.vue',
  'views/ReportsView.vue',
  'views/ImportExportView.vue',
];

describe('CSS variable coverage — fully converted views', () => {
  for (const relPath of FULLY_CONVERTED_VIEWS) {
    it(`${relPath} has no hardcoded font-size px in scoped style`, () => {
      const fullPath = resolve(__dirname, '../../src/renderer', relPath);
      const source = readFileSync(fullPath, 'utf-8');
      const scoped = extractScopedStyle(source);
      const hardcoded = findHardcodedFontSizes(scoped);
      expect(
        hardcoded,
        `Found hardcoded font-size in ${relPath}: ${hardcoded.join(', ')}`,
      ).toHaveLength(0);
    });
  }
});
