/**
 * Dialect coverage: import a representative GEDCOM export from every major
 * genealogy app and assert the core entities round-trip without crashing or
 * silent data loss. The fixtures in `tests/fixtures/gedcom/dialects/` aim
 * for *recognisable signature lines* (`SOUR`, `VERS`, custom tags) rather
 * than exhaustive feature coverage — they're regression tripwires for
 * dialect-specific quirks, not full conformance suites.
 *
 * If a future change drops a dialect-specific tag (e.g. RootsMagic's
 * `_FREL`/`_MREL`, MyHeritage's `_PRIM`, Holger's `FORE`/`PARI`) the import
 * should still succeed; the per-dialect skipped-tag list is captured in the
 * report and is asserted to be empty of *core* tags (NAME, INDI, FAM, BIRT,
 * DEAT, MARR, SEX). Custom underscore-prefixed tags appearing in `skipped`
 * is fine — that's the expected lossy-but-disclosed behaviour.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb } from './helpers';

const DIALECTS_DIR = join(__dirname, '../fixtures/gedcom/dialects');

const CORE_TAGS = new Set([
  'HEAD', 'TRLR', 'INDI', 'FAM', 'NAME', 'SEX',
  'BIRT', 'DEAT', 'MARR', 'DATE', 'PLAC',
  'HUSB', 'WIFE', 'CHIL', 'FAMS', 'FAMC',
  'SOUR', 'SUBM', 'GEDC', 'VERS', 'FORM', 'CHAR', 'DEST',
]);

describe('GEDCOM dialect coverage', async () => {
  const fixtureFiles = readdirSync(DIALECTS_DIR).filter(f => f.endsWith('.ged')).sort();

  it('lists every expected dialect', () => {
    expect(fixtureFiles).toEqual([
      'family-historian.ged',
      'family-tree-maker.ged',
      'genney.ged',
      'gramps.ged',
      'holger.ged',
      'legacy.ged',
      'macfamilytree.ged',
      'myheritage.ged',
      'paf.ged',
      'rootsmagic.ged',
    ]);
  });

  for (const file of fixtureFiles) {
    describe(file, async () => {
      const ged = readFileSync(join(DIALECTS_DIR, file), 'utf-8');
      const tree = parseGedcom(ged);

      it('imports without throwing and creates at least one person', async () => {
        const db = await createTestDb();
        const isHolger = file === 'holger.ged';
        const report = await importGedcom(db, tree, isHolger ? { profile: 'holger' } : undefined);
        expect(report.persons).toBeGreaterThan(0);
      });

      it('reports an honest count of imported entities (matches DB row counts)', async () => {
        const db = await createTestDb();
        const isHolger = file === 'holger.ged';
        const report = await importGedcom(db, tree, isHolger ? { profile: 'holger' } : undefined);
        const stmt = db.prepare('SELECT COUNT(*) as n FROM persons');
        const row = stmt.get([]) as { n: number };
        (stmt as unknown as { finalize(): void }).finalize();
        expect(report.persons).toBe(row.n);
      });

      it('does not silently drop core GEDCOM tags', async () => {
        const db = await createTestDb();
        const isHolger = file === 'holger.ged';
        const report = await importGedcom(db, tree, isHolger ? { profile: 'holger' } : undefined);
        const droppedCore = report.skipped.filter(s => CORE_TAGS.has(s.tag));
        expect(droppedCore, `core tags ended up in skipped list: ${JSON.stringify(droppedCore)}`).toEqual([]);
      });
    });
  }
});
