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
import { queryAll } from '../../src/api/db';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { matchDeclared } from '../../src/import/gedcom/accounting-declared';
import { createTestDb, readDialect } from './helpers';

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
      'arkivdigital.ged',
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

// ── Parent relation: FTM and PAF write _FREL / _MREL at level 2 under FAM.CHIL.
// Measured 2026-08-29 over the 36 real .ged files in export-import/samples:
// 45 996 occurrences, every one at level 2, zero at level 1 under INDI. The
// INDI-level shape the fixtures used to carry was a fixture invention, and a
// fixture that does not match the program it is named after tests nothing.
describe('FTM / PAF parent relation', () => {
  it('reads _FREL and _MREL where real files put them — under FAM.CHIL', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('family-tree-maker.ged')));
    const pc = await queryAll<{ person1_id: string; person2_id: string; subtype: string }>(
      db, `SELECT person1_id, person2_id, subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype).sort()).toEqual(['adopted', 'adopted', 'biological', 'biological']);
  });

  it('reads both parents of a PAF adopted child', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('paf.ged')));
    const pc = await queryAll<{ subtype: string }>(
      db, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype).sort()).toEqual(['adopted', 'adopted', 'biological', 'biological']);
  });

  it('reports nothing unaccounted for either fixture', async () => {
    for (const f of ['family-tree-maker.ged', 'paf.ged']) {
      const db = await createTestDb();
      const report = await importGedcom(db, parseGedcom(readDialect(f)));
      const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
      expect(undeclared, `${f}`).toEqual([]);
    }
  });
});
