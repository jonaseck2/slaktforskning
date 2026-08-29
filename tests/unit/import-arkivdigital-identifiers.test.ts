// ArkivDigital archive pointers — stored on import, re-emitted on export.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 6.
//
// These are round-trip only. Nothing in the app reads them to make a decision.

import type { Database } from 'node-sqlite3-wasm';
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { queryAll } from '../../src/api/db';
import {
  getExternalIdentifiersByEntityType,
  type ExternalIdentifier,
} from '../../src/api/external_identifiers';
import { matchDeclared } from '../../src/import/gedcom/accounting-declared';
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

// ── Citation-level image pointer ────────────────────────────────────────────
// The SOUR record's `1 _AID` names the volume. This one names the image and
// page inside it: 6324 occurrences across the four real exports, every one
// under an event citation. See docs/plans/2026-08-23-ad-citation-aid.md.

/** getExternalIdentifiersByEntityType returns Map<entity_id, X[]>, not an array. */
async function identsFor(database: Database, type: string): Promise<ExternalIdentifier[]> {
  return [...(await getExternalIdentifiersByEntityType(database, type)).values()].flat();
}

describe('citation-level image pointer', () => {
  it('stores the image _AID against the citation it sits under', async () => {
    await importGedcom(db, parseGedcom(AD));

    const idents = await identsFor(db, 'citation');
    expect(idents).toHaveLength(1);
    expect(idents[0].system).toBe('arkivdigital.image');
    expect(idents[0].value).toBe('v191316.b580.s52');

    // entity_id points at a real citation, and that citation is the one on the
    // BIRT event — not the source-level row, not some other citation.
    const cit = await queryAll<{ id: string; page: string; event_id: string | null }>(
      db, 'SELECT id, page, event_id FROM citations WHERE id = ?', [idents[0].entity_id]);
    expect(cit).toHaveLength(1);
    expect(cit[0].page).toBe('52');
    expect(cit[0].event_id).not.toBeNull();
  });

  it('leaves the volume pointer on the source, distinct from the image pointer', async () => {
    await importGedcom(db, parseGedcom(AD));
    const onSource = await identsFor(db, 'source');
    expect(onSource.map(i => [i.system, i.value])).toContainEqual(['arkivdigital', 'v191316']);
  });

  it('does not invent a row when the citation has no _AID', async () => {
    await importGedcom(db, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Plain source
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 DATE 1880
2 SOUR @S1@
3 PAGE 7
0 TRLR
`));
    expect(await identsFor(db, 'citation')).toEqual([]);
  });
});

// Zero of the 6324 real occurrences sit on a name, person, or family citation.
// They are handled anyway because Task 6 deletes a *wildcard* declaration —
// `*.SOUR._AID` covers every host, and removing it for one host while leaving
// three unread would re-open the silent drop the accounting contract closes.
const NON_EVENT_HOSTS = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL A source
1 _AID v900
0 @I1@ INDI
1 NAME Erik /Hedqvist/
2 SOUR @S1@
3 PAGE n1
3 _AID v900.b1.s1
1 SOUR @S1@
2 PAGE p1
2 _AID v900.b2.s2
1 FAMS @F1@
0 @I2@ INDI
1 NAME Anna /Ersdotter/
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 SOUR @S1@
2 PAGE f1
2 _AID v900.b3.s3
0 TRLR
`;

describe('image pointer on non-event citation hosts', () => {
  it('stores one row per host, each against its own citation', async () => {
    await importGedcom(db, parseGedcom(NON_EVENT_HOSTS));
    const idents = await identsFor(db, 'citation');
    expect(idents.map(i => i.value).sort())
      .toEqual(['v900.b1.s1', 'v900.b2.s2', 'v900.b3.s3']);

    const byId = new Map(
      (await queryAll<{
        id: string; page: string; person_id: string | null;
        person_name_id: string | null; relationship_id: string | null;
      }>(db, `SELECT id, page, person_id, person_name_id, relationship_id FROM citations`))
        .map(c => [c.id, c]));
    const rowFor = (v: string): NonNullable<ReturnType<typeof byId.get>> =>
      byId.get(idents.find(i => i.value === v)!.entity_id)!;

    expect(rowFor('v900.b1.s1').page).toBe('n1');
    expect(rowFor('v900.b2.s2').page).toBe('p1');
    expect(rowFor('v900.b3.s3').page).toBe('f1');

    expect(rowFor('v900.b1.s1').person_name_id).not.toBeNull();
    expect(rowFor('v900.b2.s2').person_id).not.toBeNull();
    expect(rowFor('v900.b3.s3').relationship_id).not.toBeNull();
  });

  it('reports nothing unaccounted for this file', async () => {
    const report = await importGedcom(db, parseGedcom(NON_EVENT_HOSTS));
    const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
    expect(undeclared).toEqual([]);
  });
});
