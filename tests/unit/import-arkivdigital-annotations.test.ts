// ArkivDigital annotations — the researcher's own words on an event.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 9.
//
// _DESC is the tag whose silent loss started the whole accounting effort:
// 900 occurrences across four real exports, dropped without a report entry.

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
0 @I1@ INDI
1 NAME Olof /Skänk/
1 BIRT
2 DATE 1785
2 _DESC Trolovningsbarn
1 DEAT
2 DATE 1850
2 _DESC Felaktigt födelseår i källan
2 _DESC Andra raden
0 TRLR
`;

describe('ArkivDigital annotations', () => {
  it('keeps the researcher note on the event', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ notes: string }>(db,
      "SELECT notes FROM events WHERE event_type = 'birth'");
    expect(rows[0].notes).toContain('Trolovningsbarn');
  });

  it('keeps every _DESC when an event carries more than one', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ notes: string }>(db,
      "SELECT notes FROM events WHERE event_type = 'death'");
    expect(rows[0].notes).toContain('Felaktigt födelseår i källan');
    expect(rows[0].notes, 'the second _DESC was discarded').toContain('Andra raden');
  });

  it('round-trips the annotation through export and re-import', async () => {
    await importGedcom(db, parseGedcom(AD));
    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const rows = await queryAll<{ notes: string }>(db2,
      "SELECT notes FROM events WHERE event_type = 'birth'");
    expect(rows[0].notes, 'the annotation did not survive the round-trip').toContain('Trolovningsbarn');
  });
});

describe('ArkivDigital titles', () => {
  const WITH_TITLE = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Olof /Skänk/
1 _TITLE Soldat
0 TRLR
`;

  it('records the person title as a title event', async () => {
    await importGedcom(db, parseGedcom(WITH_TITLE));
    const rows = await queryAll<{ event_type: string; value: string | null }>(db,
      'SELECT event_type, value FROM events');
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('title');
    expect(rows[0].value).toBe('Soldat');
  });

  it('round-trips the title value, emitted as the standard TITL tag', async () => {
    await importGedcom(db, parseGedcom(WITH_TITLE));
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toMatch(/^1 TITL Soldat$/m);
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const rows = await queryAll<{ value: string | null }>(db2,
      "SELECT value FROM events WHERE event_type = 'title'");
    expect(rows[0].value).toBe('Soldat');
  });
});
