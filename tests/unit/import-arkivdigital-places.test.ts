// ArkivDigital place hierarchy, end to end through importGedcom.
// See docs/plans/2026-08-23-arkivdigital-profile.md Tasks 4 and 7.

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
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 BIRT
2 DATE 07 JUN 1879
2 PLAC Högnäs, Hedesunda, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Högnäs
4 _PARISH_AID a3096
4 _PARISH Hedesunda
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
1 RESI
2 PLAC Bäck, Valbo, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Bäck
4 _PARISH_AID a3134
4 _PARISH Valbo
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
0 TRLR
`;

describe('ArkivDigital place hierarchy', () => {
  it('builds a real tree instead of one flat row per display string', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ id: string; name: string; parent_place_id: string | null }>(
      db, 'SELECT id, name, parent_place_id FROM places');
    const byName = new Map(rows.map(r => [r.name, r]));
    expect([...byName.keys()].sort()).toEqual(
      ['Bäck', 'Gävleborgs län', 'Hedesunda', 'Högnäs', 'Sverige', 'Valbo']);
    expect(byName.get('Högnäs')!.parent_place_id).toBe(byName.get('Hedesunda')!.id);
    expect(byName.get('Hedesunda')!.parent_place_id).toBe(byName.get('Gävleborgs län')!.id);
    expect(byName.get('Gävleborgs län')!.parent_place_id).toBe(byName.get('Sverige')!.id);
    expect(byName.get('Sverige')!.parent_place_id).toBeNull();
  });

  it('does not keep the flattened display string as a place of its own', async () => {
    await importGedcom(db, parseGedcom(AD));
    const flat = await queryAll(db, "SELECT id FROM places WHERE name LIKE '%,%'");
    expect(flat, 'the comma-joined display string became a place row').toHaveLength(0);
  });

  it('points each event at the innermost place', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ event_type: string; name: string }>(db,
      'SELECT e.event_type, p.name FROM events e JOIN places p ON p.id = e.place_id ORDER BY e.event_type');
    expect(rows).toEqual([
      { event_type: 'birth', name: 'Högnäs' },
      { event_type: 'residence', name: 'Bäck' },
    ]);
  });

  it('leaves non-ArkivDigital files on the flat resolver', async () => {
    const plain = AD.replace('1 SOUR Arkiv_Digital', '1 SOUR SomeOtherApp');
    await importGedcom(db, parseGedcom(plain));
    const flat = await queryAll(db, "SELECT id FROM places WHERE name LIKE '%,%'");
    expect(flat.length, 'plain GEDCOM should still store the display string').toBeGreaterThan(0);
  });

  it('handles a PLAC with no _ADPL in the same file', async () => {
    const mixed = AD.replace('0 TRLR\n', `1 DEAT
2 PLAC Ingenstans
0 TRLR
`);
    await importGedcom(db, parseGedcom(mixed));
    const rows = await queryAll<{ name: string }>(db, "SELECT name FROM places WHERE name = 'Ingenstans'");
    expect(rows, 'a PLAC without _ADPL was dropped instead of falling through').toHaveLength(1);
  });
});

describe('ArkivDigital härad', () => {
  it('records the härad on the parish, not the locality', async () => {
    const ged = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 PROB
2 PLAC Bäck, Valbo, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Bäck
4 _PARISH Valbo
4 _COUNTY Gävleborgs län
4 _JUDICIAL Gästriklands östra tingslags häradsrätt
4 _COUNTRY Sverige
0 TRLR
`;
    await importGedcom(db, parseGedcom(ged));
    const rows = await queryAll<{ name: string; notes: string }>(db,
      "SELECT name, notes FROM places WHERE notes <> ''");
    expect(rows).toHaveLength(1);
    expect(rows[0].name, 'the härad landed on the wrong level').toBe('Valbo');
    expect(rows[0].notes).toContain('Gästriklands östra tingslags häradsrätt');
  });
});
