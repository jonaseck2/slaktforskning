// ArkivDigital archive pointers — stored on import, re-emitted on export.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 6.
//
// These are round-trip only. Nothing in the app reads them to make a decision.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const AD = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL ArkivDigital: Valbo (X) C:15 (1920-1928)
1 _AID v191316
1 _URL https://www.arkivdigital.se/aid/show/v191316.b580.s52
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 BIRT
2 DATE 1879
2 PLAC Bäck, Valbo, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Bäck
4 _PARISH_AID a3134
4 _PARISH Valbo
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
2 SOUR @S1@
3 PAGE 52
3 _AID v191316.b580.s52
0 TRLR
`;

describe('ArkivDigital archive pointers', () => {
  it('stores the volume _AID against the source', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ system: string; value: string }>(db,
      "SELECT system, value FROM external_identifiers WHERE entity_type = 'source'");
    expect(rows).toEqual([{ system: 'arkivdigital', value: 'v191316' }]);
  });

  it('stores _PARISH_AID against the parish place, not the locality', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ value: string; name: string }>(db,
      `SELECT ei.value, p.name FROM external_identifiers ei
       JOIN places p ON p.id = ei.entity_id WHERE ei.entity_type = 'place'`);
    expect(rows).toEqual([{ value: 'a3134', name: 'Valbo' }]);
  });

  it('re-emits _AID on the exported SOUR record', async () => {
    await importGedcom(db, parseGedcom(AD));
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toMatch(/^1 _AID v191316$/m);
  });

  it('survives a full round-trip', async () => {
    await importGedcom(db, parseGedcom(AD));
    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const rows = await queryAll<{ system: string; value: string }>(db2,
      "SELECT system, value FROM external_identifiers WHERE entity_type = 'source'");
    expect(rows, 'the archive pointer did not survive export and re-import').toEqual([
      { system: 'arkivdigital', value: 'v191316' },
    ]);
  });
});

describe('place hierarchy round-trip', () => {
  it('keeps all four levels through export and re-import', async () => {
    await importGedcom(db, parseGedcom(AD));
    const before = await queryAll<{ name: string; place_type: string; parent_place_id: string | null }>(
      db, 'SELECT name, place_type, parent_place_id FROM places ORDER BY name');
    expect(before).toHaveLength(4);

    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));

    const after = await queryAll<{ name: string; place_type: string; parent_place_id: string | null }>(
      db2, 'SELECT name, place_type, parent_place_id FROM places ORDER BY name');
    expect(after.map(r => r.name), 'the parent chain was lost on export').toEqual(
      ['Bäck', 'Gävleborgs län', 'Sverige', 'Valbo']);
    // Only the country is a root; every other level hangs off its parent.
    expect(after.filter(r => r.parent_place_id === null).map(r => r.name)).toEqual(['Sverige']);
    const byId = new Map(after.map(r => [r.parent_place_id, r]));
    expect(byId.size, 'the chain branched instead of staying a single line').toBe(4);
  });

  it('keeps the parish id through export and re-import', async () => {
    await importGedcom(db, parseGedcom(AD));
    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const rows = await queryAll<{ value: string; name: string }>(db2,
      `SELECT ei.value, p.name FROM external_identifiers ei
       JOIN places p ON p.id = ei.entity_id WHERE ei.entity_type = 'place'`);
    expect(rows, '_PARISH_AID did not survive the round-trip').toEqual([{ value: 'a3134', name: 'Valbo' }]);
  });
});
