import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  injectSnapshotIntoHtml,
  INJECTION_MARKER,
} from '../../src/main/preview-html-inject';

// Why this test exists:
//   The preview iframe sets window.__SNAPSHOT__ via a string-replace against
//   the SPA index.html. If the marker drifts (e.g. someone removes the source
//   tag the regex was anchored on, as happened during Track B / v0.227.5),
//   a silent no-op produces a blank iframe with a cryptic
//   "Failed to fetch ./data.json" error from installStaticApi's last-resort
//   dev fallback. These tests catch that drift before it ships.
describe('injectSnapshotIntoHtml', () => {
  it('replaces the marker with an inline __SNAPSHOT__ script', () => {
    const html = `<html><body><div id="app"></div>${INJECTION_MARKER}<script type="module" src="./main.ts"></script></body></html>`;
    const result = injectSnapshotIntoHtml(html, { persons: [{ id: 'p1' }] });
    expect(result).not.toBe(html);
    expect(result).not.toContain(INJECTION_MARKER);
    expect(result).toContain('<script>window.__SNAPSHOT__=');
    expect(result).toContain('"persons":[{"id":"p1"}]');
  });

  it('throws loudly when the marker is missing — silent no-op was the original bug', () => {
    const htmlWithoutMarker = '<html><body><div id="app"></div></body></html>';
    expect(() => injectSnapshotIntoHtml(htmlWithoutMarker, { persons: [] }))
      .toThrow(/missing.*PREVIEW_SNAPSHOT_INJECTION_POINT/);
  });

  it('preserves marker placement before any module script (snapshot must be set when main.ts runs)', () => {
    const html = `<body>${INJECTION_MARKER}<script type="module" src="./main.ts"></script></body>`;
    const result = injectSnapshotIntoHtml(html, {});
    const snapshotIdx = result.indexOf('window.__SNAPSHOT__');
    const moduleIdx = result.indexOf('type="module"');
    expect(snapshotIdx).toBeGreaterThanOrEqual(0);
    expect(moduleIdx).toBeGreaterThanOrEqual(0);
    expect(snapshotIdx).toBeLessThan(moduleIdx);
  });

  it('escapes </script> inside snapshot string fields so the inline script is closing-tag-safe', () => {
    const html = `<body>${INJECTION_MARKER}</body>`;
    const tricky = { notes: 'sneaky </script><script>alert(1)</script>' };
    const result = injectSnapshotIntoHtml(html, tricky);
    // The literal `</script>` from the user's note must not appear unescaped
    // inside the inline script — otherwise a malicious note could break out.
    const scriptOpen = result.indexOf('<script>window.__SNAPSHOT__=');
    const scriptClose = result.indexOf('</script>', scriptOpen);
    const inlineBlock = result.slice(scriptOpen, scriptClose);
    expect(inlineBlock).not.toContain('</script>');
    expect(inlineBlock).toContain('<\\/script');
  });

  it('handles null/undefined snapshots without crashing', () => {
    const html = `<body>${INJECTION_MARKER}</body>`;
    expect(injectSnapshotIntoHtml(html, null)).toContain('window.__SNAPSHOT__=null');
    expect(injectSnapshotIntoHtml(html, undefined)).toContain('window.__SNAPSHOT__=null');
  });

  // Build-product integration: confirms viteSingleFile preserved the marker
  // verbatim through the static SPA build. Skipped when dist-static hasn't
  // been built yet (CI runs build:static before vitest in package).
  it('built dist-static/index.html still carries the marker (when present)', () => {
    const distHtml = resolve(__dirname, '..', '..', 'dist-static', 'index.html');
    if (!existsSync(distHtml)) return;
    const html = readFileSync(distHtml, 'utf8');
    expect(html).toContain(INJECTION_MARKER);
  });
});
