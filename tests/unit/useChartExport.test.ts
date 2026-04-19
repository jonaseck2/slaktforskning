// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildExportSvgString, wrapWithTitle } from '../../src/renderer/composables/useChartExport';

describe('buildExportSvgString', () => {
  it('serializes an SVGElement to an XML string with namespace', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '50');
    svg.appendChild(rect);
    const out = buildExportSvgString(svg);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('<rect');
  });
});

describe('wrapWithTitle', () => {
  it('prepends a <text> title element immediately after the opening <svg> tag', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect/></svg>';
    const out = wrapWithTitle(svg, 'Pedigree \u2014 Jonas Ahnstedt');
    expect(out).toContain('<text');
    expect(out).toContain('Pedigree &#8212; Jonas Ahnstedt'); // em-dash XML-escaped
    // The title text must come before the <rect> (right after the <svg> opener).
    expect(out.indexOf('<text')).toBeLessThan(out.indexOf('<rect'));
  });

  it('XML-escapes ampersands, <, >, quotes', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const out = wrapWithTitle(svg, 'A & B <C> "D"');
    expect(out).toContain('A &amp; B &lt;C&gt; &quot;D&quot;');
  });
});
