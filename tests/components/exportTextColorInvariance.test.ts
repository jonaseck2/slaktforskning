// Regression test for print/PDF-export text colour invariance.
//
// Background: `window.api.print.exportPdf()` calls Electron's
// `webContents.printToPDF()` on the focused window. That means the exported
// PDF contains whatever the current stylesheet renders — so if dark /
// high-contrast / theme-foo modes change text colour on screen, they leak
// straight into the export unless an `@media print` override resets them.
//
// This test loads the real tokens.css + shared.css, "simulates print mode"
// by inlining @media print rules (happy-dom does not emulate print media
// on its own), and asserts that representative text elements render the
// same colour regardless of appearance (light/dark/high-contrast) or theme
// (forest/nordic/twilight).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';

/**
 * Rewrite a CSS source so that every `@media print { ... }` block's rules
 * become unconditional — this simulates being in print media for happy-dom,
 * which otherwise never matches the print media type.
 */
function inlinePrintMedia(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at === -1) { out += css.slice(i); break; }
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open === -1) { out += css.slice(at); break; }
    const condition = css.slice(at + '@media'.length, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      if (depth > 0) j++;
    }
    const body = css.slice(open + 1, j);
    if (/\bprint\b/.test(condition)) {
      out += body;
    } else {
      out += css.slice(at, j + 1);
    }
    i = j + 1;
  }
  return out;
}

function installStylesheet(css: string): HTMLStyleElement {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
  return el;
}

type Builder = () => HTMLElement;

type ExportElementSpec = {
  name: string;
  build: Builder;
  // Selector used to look the element back up after insertion.
  selector: string;
};

function tag(name: string, opts: { text?: string; className?: string } = {}): HTMLElement {
  const el = document.createElement(name);
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.className) el.className = opts.className;
  return el;
}

// Text elements that plausibly appear in any exported report or chart.
const EXPORT_ELEMENTS: ExportElementSpec[] = [
  { name: 'body text (p)', selector: 'p', build: () => tag('p', { text: 'Anna Bergström' }) },
  { name: 'h1', selector: 'h1', build: () => tag('h1', { text: 'Report' }) },
  { name: 'h2', selector: 'h2', build: () => tag('h2', { text: 'Section' }) },
  { name: 'h3', selector: 'h3', build: () => tag('h3', { text: 'Subsection' }) },
  { name: 'h4', selector: 'h4', build: () => tag('h4', { text: 'Group' }) },
  { name: 'label', selector: 'label', build: () => tag('label', { text: 'Field' }) },
  {
    name: 'table cell',
    selector: '.data-table td',
    build: () => {
      const table = tag('table', { className: 'data-table' });
      const tbody = tag('tbody');
      const tr = tag('tr');
      tr.appendChild(tag('td', { text: 'Cell' }));
      tbody.appendChild(tr);
      table.appendChild(tbody);
      return table;
    },
  },
  {
    name: 'table header',
    selector: '.data-table th',
    build: () => {
      const table = tag('table', { className: 'data-table' });
      const thead = tag('thead');
      const tr = tag('tr');
      tr.appendChild(tag('th', { text: 'Head' }));
      thead.appendChild(tr);
      table.appendChild(thead);
      return table;
    },
  },
  {
    name: 'person link',
    selector: '.person-link',
    build: () => {
      const a = tag('a', { text: 'Anna Bergström', className: 'person-link' });
      (a as HTMLAnchorElement).href = '#';
      return a;
    },
  },
];

const MODES: Array<{ name: string; classes: string[] }> = [
  { name: 'forest light', classes: [] },
  { name: 'forest dark', classes: ['dark'] },
  { name: 'forest high-contrast', classes: ['high-contrast'] },
  { name: 'nordic light', classes: ['theme-nordic'] },
  { name: 'nordic dark', classes: ['theme-nordic', 'dark'] },
  { name: 'nordic high-contrast', classes: ['theme-nordic', 'high-contrast'] },
  { name: 'twilight light', classes: ['theme-twilight'] },
  { name: 'twilight dark', classes: ['theme-twilight', 'dark'] },
  { name: 'twilight high-contrast', classes: ['theme-twilight', 'high-contrast'] },
];

const REPO_ROOT = resolve(__dirname, '..', '..');
const TOKENS_CSS = readFileSync(resolve(REPO_ROOT, 'src/renderer/styles/tokens.css'), 'utf-8');
const SHARED_CSS = readFileSync(resolve(REPO_ROOT, 'src/renderer/styles/shared.css'), 'utf-8');

describe('export text colour invariance (print media)', () => {
  beforeAll(() => {
    installStylesheet(inlinePrintMedia(TOKENS_CSS));
    installStylesheet(inlinePrintMedia(SHARED_CSS));
  });

  afterEach(() => {
    document.documentElement.className = '';
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  });

  for (const spec of EXPORT_ELEMENTS) {
    it(`${spec.name} inside .export-scope is theme-invariant under print media`, () => {
      const scope = tag('div', { className: 'export-scope' });
      scope.appendChild(spec.build());
      document.body.appendChild(scope);
      const el = scope.querySelector(spec.selector);
      if (!el) throw new Error(`selector not found: ${spec.selector}`);

      const seen: Array<{ mode: string; color: string }> = [];
      for (const mode of MODES) {
        document.documentElement.className = mode.classes.join(' ');
        seen.push({ mode: mode.name, color: getComputedStyle(el).color });
      }

      const unique = Array.from(new Set(seen.map(s => s.color)));
      expect(
        unique,
        `text colour drifted across theme/appearance for "${spec.name}":\n` +
          seen.map(s => `  ${s.mode.padEnd(24)} -> ${s.color}`).join('\n'),
      ).toHaveLength(1);
    });
  }

  it('sanity check: an element OUTSIDE .export-scope does drift across themes', () => {
    // Proves the invariance test above is meaningful — the scope is actually
    // doing work, not just measuring a token that never varied.
    document.body.appendChild(tag('p', { text: 'bare' }));
    const bare = document.body.querySelector('p')!;
    const seen = new Set<string>();
    for (const mode of MODES) {
      document.documentElement.className = mode.classes.join(' ');
      seen.add(getComputedStyle(bare).color);
    }
    expect(seen.size, 'bare <p> outside .export-scope should still drift').toBeGreaterThan(1);
  });
});
