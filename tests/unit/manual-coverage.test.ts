import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Mechanical guard from `docs/plans/archive/2026-05-21-oss-launch-demo-and-manual.md` T13:
 * every paneled route (the user-facing surfaces that get their own right-side
 * panel) and every importer in `src/import/` must have a corresponding section
 * heading in `MANUAL.md`. If a future panel/importer ships without a manual
 * section, this test goes red — preventing the docs from silently lagging the
 * code.
 *
 * Scope is intentionally lean: we assert headings exist, NOT that prose is
 * complete. The point is "a section is reserved per surface", not "every
 * section is exhaustive". For deeper review of the manual, see the user-goal
 * verification on the OSS-launch plan.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const MANUAL_PATH = join(REPO_ROOT, 'MANUAL.md');
const IMPORT_DIR = join(REPO_ROOT, 'src', 'import');

// Mirrors `PANELED_ROUTES` in `src/renderer/App.vue:282`. Kept in lockstep
// by the assertion below — if App.vue's list changes, update this constant
// AND add the new section to MANUAL.md.
const EXPECTED_PANELED_ROUTES = [
  '/persons',
  '/media',
  '/places',
  '/reports',
  '/prints',
  '/sources',
  '/groups',
  '/research-tasks',
  '/website',
] as const;

// Human-readable section title hints. The MANUAL must contain at least one
// of these per route — variation is OK (e.g. "Persons panel" or "Person view"
// both satisfy `/persons`).
const ROUTE_HEADING_KEYWORDS: Record<(typeof EXPECTED_PANELED_ROUTES)[number], readonly string[]> = {
  '/persons': ['Person'],
  '/media': ['Media'],
  '/places': ['Place'],
  '/reports': ['Report'],
  '/prints': ['Print', 'Chart'],
  '/sources': ['Source'],
  '/groups': ['Group'],
  '/research-tasks': ['Research', 'Task'],
  '/website': ['Website', 'HTML site', 'Export'],
};

function readManualHeadings(): string[] {
  if (!existsSync(MANUAL_PATH)) return [];
  const content = readFileSync(MANUAL_PATH, 'utf8');
  return content
    .split('\n')
    .filter(line => /^#+ /.test(line))
    .map(line => line.replace(/^#+\s+/, '').trim());
}

describe('MANUAL.md coverage', () => {
  it('exists at the repo root', () => {
    expect(existsSync(MANUAL_PATH), 'MANUAL.md must exist at repo root (covers every paneled route and importer)').toBe(true);
  });

  it('has a heading for every paneled route in App.vue', () => {
    const headings = readManualHeadings();
    const missing: string[] = [];
    for (const route of EXPECTED_PANELED_ROUTES) {
      const keywords = ROUTE_HEADING_KEYWORDS[route];
      const found = headings.some(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())));
      if (!found) missing.push(`${route} (looking for any of: ${keywords.join(', ')})`);
    }
    expect(
      missing,
      `MANUAL.md is missing sections for these paneled routes:\n  - ${missing.join('\n  - ')}\n\nAdd a heading containing one of the keyword hints per route. ROUTE_HEADING_KEYWORDS in this test is the source of truth.`,
    ).toEqual([]);
  });

  it('has a heading for every importer in src/import/', () => {
    const importers = existsSync(IMPORT_DIR)
      ? readdirSync(IMPORT_DIR, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => e.name)
      : [];
    expect(importers.length, 'expected importer subdirs in src/import/').toBeGreaterThan(0);

    const headings = readManualHeadings();
    const missing: string[] = [];
    for (const importer of importers) {
      // Match case-insensitively. Importer names: gedcom, genney, gramps, holger, rootsmagic.
      const found = headings.some(h => h.toLowerCase().includes(importer.toLowerCase()));
      if (!found) missing.push(importer);
    }
    expect(
      missing,
      `MANUAL.md is missing sections for these importers:\n  - ${missing.join('\n  - ')}\n\nAdd a heading containing the importer's directory name (e.g. "## Importing from RootsMagic") per missing entry.`,
    ).toEqual([]);
  });

  it('mirrors App.vue\'s PANELED_ROUTES exactly (no silent drift)', () => {
    const appVuePath = join(REPO_ROOT, 'src', 'renderer', 'App.vue');
    const appVue = readFileSync(appVuePath, 'utf8');
    const match = appVue.match(/PANELED_ROUTES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'PANELED_ROUTES not found in App.vue — this test\'s assumptions are stale').toBeTruthy();
    const actualRoutes = (match![1].match(/'([^']+)'/g) ?? []).map(s => s.replace(/'/g, ''));
    expect(
      actualRoutes.sort(),
      'App.vue PANELED_ROUTES drifted from EXPECTED_PANELED_ROUTES in this test. Update both lists AND add MANUAL.md section(s).',
    ).toEqual([...EXPECTED_PANELED_ROUTES].sort());
  });
});
