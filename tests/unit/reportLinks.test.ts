import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPORTS_DIR = resolve(__dirname, '../../src/renderer/components/reports');

function findVueFiles(dir: string): string[] {
  const results: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) results.push(...findVueFiles(full));
    else if (name.endsWith('.vue')) results.push(full);
  }
  return results;
}

function getTemplate(content: string): string {
  return content.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? '';
}

describe('Report self-containment — links must stay inside the report', () => {
  const files = findVueFiles(REPORTS_DIR);

  it('found report Vue files to test', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const label = file.slice(REPORTS_DIR.length + 1);

    it(`${label} — no external URL hrefs`, () => {
      // Check the entire file, not just the template — catches JS strings like Leaflet attribution.
      const src = readFileSync(file, 'utf8');
      const matches = [...src.matchAll(/href=["']https?:\/\//g)];
      expect(
        matches.map(m => m[0]),
        `${label} contains external URL hrefs`,
      ).toHaveLength(0);
    });

    it(`${label} — no app-route or non-anchor static hrefs`, () => {
      // In the template, static href="VALUE" (no leading colon) must always be an in-document anchor.
      const template = getTemplate(readFileSync(file, 'utf8'));
      // Match href="..." not preceded by : (i.e. not :href="...") whose value doesn't start with #
      const matches = [...template.matchAll(/(?<!:)\bhref="([^#"][^"]*)"/g)];
      expect(
        matches.map(m => `href="${m[1]}"`),
        `${label} contains static hrefs that are not in-document anchors`,
      ).toHaveLength(0);
    });
  }
});
