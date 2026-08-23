// ArkivDigital citations — the date the researcher consulted the record.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 8.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const AD = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
0 @S1@ SOUR
1 TITL Valbo C:15
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 BIRT
2 DATE 1879
2 SOUR @S1@
3 PAGE 52
3 DATA
4 DATE 18 JAN 2022
4 TEXT ArkivDigital: Valbo C:15 Bild 580 / sid 52
3 _AID v191316.b580.s52
0 TRLR
`;

describe('ArkivDigital citations', () => {
  it('records the date the researcher consulted the record', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ date_accessed: string }>(db, 'SELECT date_accessed FROM citations');
    expect(rows[0].date_accessed).toBe('18 JAN 2022');
  });

  it('keeps the page and the transcription alongside it', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ page: string; transcription: string }>(db,
      'SELECT page, transcription FROM citations');
    expect(rows[0].page).toBe('52');
    expect(rows[0].transcription).toContain('Bild 580');
  });

  it('prefers this app\'s own _ACCESSED tag when both are present', async () => {
    const both = AD.replace('3 DATA', '3 _ACCESSED 01 FEB 2020\n3 DATA');
    await importGedcom(db, parseGedcom(both));
    const rows = await queryAll<{ date_accessed: string }>(db, 'SELECT date_accessed FROM citations');
    expect(rows[0].date_accessed).toBe('01 FEB 2020');
  });

  it('round-trips the access date through export and re-import', async () => {
    const { exportGedcom } = await import('../../src/gedcom/exporter');
    await importGedcom(db, parseGedcom(AD));
    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const rows = await queryAll<{ date_accessed: string }>(db2, 'SELECT date_accessed FROM citations');
    expect(rows[0].date_accessed).toBe('18 JAN 2022');
  });
});
