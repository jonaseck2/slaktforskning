// Prime Directive (cont.) clause 1 — the import report names every tag path no
// phase read. See docs/plans/2026-08-23-importer-tag-accounting.md.
//
// User goal: a researcher who imports a GEDCOM is told what the app did not read.
// Before this, the report named 143 of 40000+ discarded tag occurrences.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { matchDeclared } from '../../src/import/gedcom/accounting-declared';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

// One INDI whose BIRT carries an ArkivDigital _ADPL block and a citation _AID.
// None of these tags is read by any phase, and none was reported before this test.
const AD_SHAPED = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL ArkivDigital: Valbo (X) C:15 (1920-1928)
1 _AID v191316
1 _URL https://www.arkivdigital.se/aid/show/v191316.b580.s52
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 SEX M
1 BIRT
2 DATE 07 JUN 1879
2 PLAC Högnäs, Hedesunda, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Högnäs
4 _PARISH_AID a3096
4 _PARISH Hedesunda
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
2 SOUR @S1@
3 PAGE 52
3 DATA
4 DATE 18 JAN 2022
4 TEXT ArkivDigital: Valbo (X) C:15 Bild 580 / sid 52
3 _AID v191316.b580.s52
2 _DESC Trolovningsbarn
0 TRLR
`;

describe('import tag accounting', () => {
  // The arkivdigital profile (docs/plans/2026-08-23-arkivdigital-profile.md) has
  // since mapped the place hierarchy and the source-level _AID, so those tags
  // are now read rather than reported. What remains unread is listed below and
  // is the honest state of the importer, not an oversight.
  it('names the ArkivDigital tags the importer still does not read', async () => {
    const report = await importGedcom(db, parseGedcom(AD_SHAPED));
    const paths = new Map((report.unaccountedFor ?? []).map(u => [u.path, u.count]));
    expect(paths.get('INDI.BIRT._DESC')).toBe(1);
    expect(paths.get('INDI.BIRT.SOUR._AID')).toBe(1);
  });

  it('no longer reports the tags the arkivdigital profile now maps', async () => {
    const report = await importGedcom(db, parseGedcom(AD_SHAPED));
    const paths = new Set((report.unaccountedFor ?? []).map(u => u.path));
    for (const p of ['SOUR._AID',
                     'INDI.BIRT.PLAC._ADPL',
                     'INDI.BIRT.PLAC._ADPL._PARISH',
                     'INDI.BIRT.PLAC._ADPL._PARISH_AID',
                     'INDI.BIRT.PLAC._ADPL._COUNTY',
                     'INDI.BIRT.PLAC._ADPL._COUNTRY',
                     'INDI.BIRT.PLAC._ADPL._LOCALITY',
                     'INDI.BIRT.SOUR.DATA.DATE']) {
      expect(paths, `${p} is mapped now and should not be reported`).not.toContain(p);
    }
  });

  it('does not report tags the importer does read', async () => {
    const report = await importGedcom(db, parseGedcom(AD_SHAPED));
    const paths = new Set((report.unaccountedFor ?? []).map(u => u.path));
    expect(paths.has('SOUR.TITL')).toBe(false);
    expect(paths.has('INDI.BIRT.DATE')).toBe(false);
    expect(paths.has('SOUR._URL')).toBe(false);
  });

  it('leaves the deprecated skipped field populated for existing consumers', async () => {
    const report = await importGedcom(db, parseGedcom(AD_SHAPED));
    expect(Array.isArray(report.skipped)).toBe(true);
  });

  // ── Task 4: phases that walk node.children directly bypass the marking in
  // getChild/getChildren, so nodes they genuinely read get reported as dropped.
  const CORE_TAGS = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL A source
0 @I1@ INDI
1 NAME Erik /Hedqvist/
2 GIVN Erik
2 SURN Hedqvist
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Anna /Ersdotter/
2 GIVN Anna
2 SURN Ersdotter
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Barn /Hedqvist/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`;

  // The plan's original list included GIVN/SURN/FAMS/FAMC/TRLR. Investigation
  // during Task 4 showed those are not read by any phase:
  //   • GIVN/SURN — folded into the NAME value by normalize.ts, which runs
  //     before the session, so no phase ever reads the nodes.
  //   • FAMS/FAMC — genuinely never read. The family link is built from the FAM
  //     record's HUSB/WIFE/CHIL. Verified: no getChild/getChildren for either tag.
  //   • TRLR, HEAD.CHAR, HEAD.GEDC — structure and pre-session reads.
  // Reporting them is correct. They belong in DECLARED_UNMAPPED (Task 5), not here.
  it('does not report record-level tags that phases claim', async () => {
    const report = await importGedcom(db, parseGedcom(CORE_TAGS));
    const paths = new Set((report.unaccountedFor ?? []).map(u => u.path));
    for (const p of ['INDI', 'FAM', 'SOUR', 'HEAD',
                     'FAM.HUSB', 'FAM.WIFE', 'FAM.CHIL',
                     'INDI.NAME', 'INDI.SEX', 'SOUR.TITL']) {
      expect(paths, `${p} is consumed but reported as unaccounted`).not.toContain(p);
    }
  });
});

// ── Task 6: the gate ────────────────────────────────────────────────────────
// Every fixture the repo ships must be fully accounted for: each unaccounted
// path is either mapped by a phase or declared with a reason. A new phase that
// reads an allowlist without marking fails here by design.

// Resolved from this file, not from cwd. A cwd-relative path would enumerate
// zero fixtures under a different working directory and the gate would pass
// vacuously — precisely the "guarantee no test enforces" shape this plan exists
// to remove. The count assertion below is the backstop.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIRS = [
  join(HERE, '../fixtures/gedcom'),
  join(HERE, '../fixtures/gedcom/dialects'),
];

function fixtureFiles(): string[] {
  const out: string[] = [];
  for (const dir of FIXTURE_DIRS) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.ged')) out.push(join(dir, f.name));
    }
  }
  return out.sort();
}

describe('every shipped fixture is fully accounted for', () => {
  it('finds the fixtures at all — guards against a vacuous pass', () => {
    const files = fixtureFiles();
    expect(files.length, 'fixture enumeration found nothing').toBeGreaterThanOrEqual(19);
    expect(files.some(f => f.endsWith('arkivdigital.ged'))).toBe(true);
  });

  for (const file of fixtureFiles()) {
    it(`${relative(HERE, file)} — no undeclared unaccounted tags`, async () => {
      const freshDb = await createTestDb();
      const report = await importGedcom(freshDb, parseGedcom(readFileSync(file, 'utf-8')));
      const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
      expect(
        undeclared,
        `${relative(HERE, file)} drops these without a declaration — map them, or add an entry with a ` +
        `reason to src/import/gedcom/accounting-declared.ts:\n` +
        undeclared.map(u => `  ${String(u.count).padStart(5)}  ${u.path}`).join('\n'),
      ).toEqual([]);
    });
  }
});
