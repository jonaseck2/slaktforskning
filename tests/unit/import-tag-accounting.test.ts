// Prime Directive (cont.) clause 1 — the import report names every tag path no
// phase read. See docs/plans/2026-08-23-importer-tag-accounting.md.
//
// User goal: a researcher who imports a GEDCOM is told what the app did not read.
// Before this, the report named 143 of 40000+ discarded tag occurrences.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
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
  it('names the ArkivDigital tags the importer does not read', async () => {
    const report = await importGedcom(db, parseGedcom(AD_SHAPED));
    const paths = new Map((report.unaccountedFor ?? []).map(u => [u.path, u.count]));
    expect(paths.get('SOUR._AID')).toBe(1);
    expect(paths.get('INDI.BIRT.PLAC._ADPL._PARISH')).toBe(1);
    expect(paths.get('INDI.BIRT.PLAC._ADPL._PARISH_AID')).toBe(1);
    expect(paths.get('INDI.BIRT._DESC')).toBe(1);
    expect(paths.get('INDI.BIRT.SOUR.DATA.DATE')).toBe(1);
    expect(paths.get('INDI.BIRT.SOUR._AID')).toBe(1);
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
});
