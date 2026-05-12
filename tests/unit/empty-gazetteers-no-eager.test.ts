import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Regression guard for the lazy-chunks plan (2026-05-12).
 *
 * The renderer-aliased gazetteer surface (`src/renderer/empty-gazetteers.ts`)
 * uses `import.meta.glob(..., { query: '?url' })` — every JSON ships as a
 * static asset, fetched + parsed at runtime in the webview, never parsed by
 * Vite's rollup pass.
 *
 * The previous version used `{ eager: true, import: 'default' }`, which
 * inlined every JSON into a single ~30 MB chunk AND held all parsed JSON in
 * Node memory during rollup — OOMing the default 2 GB Node heap and forcing
 * a `NODE_OPTIONS=--max-old-space-size=8192` workaround in `package.json`.
 *
 * The non-eager `{ import: 'default' }` form (one code-split chunk per JSON)
 * is *also* unsafe — rollup still parses every JSON to emit each chunk and
 * still OOMs. The only safe shape is `query: '?url'`, which short-circuits
 * Vite's JSON-as-module pipeline and treats each JSON as a static asset
 * with a URL.
 *
 * This test fails if anyone reintroduces JSON-as-module loading; that would
 * silently bring back the heap-bump workaround.
 */
describe('empty-gazetteers.ts (renderer alias)', () => {
  it('uses the url-asset query on import.meta.glob (never JSON-as-module)', () => {
    const path = resolve(__dirname, '../../src/renderer/empty-gazetteers.ts');
    const source = readFileSync(path, 'utf8');
    // Strip line comments before scanning so prose mentions don't trip the
    // grep. (Block-comment stripping is intentionally skipped: a literal
    // glob like `data/*.json` contains `/*` but no closing `*/`, which
    // would silently eat the rest of the file.)
    const codeOnly = source
      .split('\n')
      .map(line => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Must declare query: '?url' on the gazetteer-data glob (the `?url`
    // suffix tells Vite to emit each JSON as a static asset rather than
    // a parsed module — bypasses the rollup-OOM path entirely).
    expect(codeOnly).toMatch(/query\s*:\s*['"]\?url['"]/);
    // And the gazetteer-data glob must be the call that carries it.
    expect(codeOnly).toMatch(/import\.meta\.glob[\s\S]{0,400}place-gazetteers\/data\/\*\.json/);
  });

  it('still calls import.meta.glob on the gazetteer data folder', () => {
    // Sanity check: the lazy-chunk strategy depends on Vite glob resolution.
    // If the glob pattern moves or disappears, this test catches it.
    const path = resolve(__dirname, '../../src/renderer/empty-gazetteers.ts');
    const source = readFileSync(path, 'utf8');
    expect(source).toMatch(/import\.meta\.glob/);
    expect(source).toMatch(/place-gazetteers\/data\/\*\.json/);
  });
});
