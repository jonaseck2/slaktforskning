// ArkivDigital parent relation types.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 10.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { queryAll } from '../../src/api/db';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createTestDb, readDialect } from './helpers';
import { adParentRelSubtype } from '../../src/import/gedcom/profiles/arkivdigital';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('adParentRelSubtype', () => {
  it('maps the values ArkivDigital emits', () => {
    expect(adParentRelSubtype('Biological')).toBe('biological');
    expect(adParentRelSubtype('Adopted')).toBe('adopted');
    expect(adParentRelSubtype('Foster')).toBe('foster');
    expect(adParentRelSubtype('Step')).toBe('step');
  });
  it('is case-insensitive', () => {
    expect(adParentRelSubtype('adopted')).toBe('adopted');
  });
  it('falls back to biological rather than failing the import', () => {
    expect(adParentRelSubtype('Something Nobody Has Seen')).toBe('biological');
  });
});

describe('ArkivDigital parent relations', () => {
  const FAM = (frel: string, mrel: string): string => `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Far /Testsson/
1 SEX M
0 @I2@ INDI
1 NAME Mor /Testsson/
1 SEX F
0 @I3@ INDI
1 NAME Barn /Testsson/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
2 _FREL ${frel}
2 _MREL ${mrel}
0 TRLR
`;

  it('records the relation to each parent', async () => {
    await importGedcom(db, parseGedcom(FAM('Biological', 'Biological')));
    const rows = await queryAll<{ subtype: string }>(db,
      "SELECT subtype FROM relationships WHERE type = 'parent_child'");
    expect(rows.map(r => r.subtype)).toEqual(['biological', 'biological']);
  });

  it('lets the father and mother relations differ', async () => {
    await importGedcom(db, parseGedcom(FAM('Adopted', 'Biological')));
    const rows = await queryAll<{ subtype: string; given_name: string }>(db,
      `SELECT r.subtype, n.given_name FROM relationships r
       JOIN person_names n ON n.person_id = r.person1_id
       WHERE r.type = 'parent_child' ORDER BY n.given_name`);
    expect(rows).toEqual([
      { subtype: 'adopted', given_name: 'Far' },
      { subtype: 'biological', given_name: 'Mor' },
    ]);
  });

  it('leaves PEDI-derived subtypes alone when _FREL is absent', async () => {
    const noRel = FAM('X', 'Y').replace(/^2 _[FM]REL .*\n/gm, '');
    await importGedcom(db, parseGedcom(noRel));
    const rows = await queryAll<{ subtype: string }>(db,
      "SELECT subtype FROM relationships WHERE type = 'parent_child'");
    expect(rows.map(r => r.subtype)).toEqual(['biological', 'biological']);
  });
});

// `_SEPR` is mapped end to end — FAMILY_EVENT_TAGS, KNOWN_FAM_TAGS, negations,
// EVENT_TYPE_TO_TAG, the UI event-type list and both i18n files. No test said
// so, which is how the design spec for this plan came to list it as a gap.
// These two are the regression guard that claim went unchecked for want of.
describe('_SEPR', () => {
  it('imports as a separation event on the couple', async () => {
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(readDialect('arkivdigital.ged')));
    const rows = await queryAll<{ event_type: string; date_original: string; relationship_id: string | null }>(
      fresh, `SELECT event_type, date_original, relationship_id FROM events WHERE event_type = 'separation'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].relationship_id).not.toBeNull();
    expect(rows[0].date_original).toContain('1880');
  });

  it('round-trips as _SEPR under both versions', async () => {
    for (const version of ['5.5.1', '7.0'] as const) {
      const fresh = await createTestDb();
      await importGedcom(fresh, parseGedcom(readDialect('arkivdigital.ged')));
      const { ged } = await exportGedcom(fresh, version);
      expect(ged, version).toContain('1 _SEPR');
      const back = await createTestDb();
      await importGedcom(back, parseGedcom(ged));
      expect(
        await queryAll(back, `SELECT id FROM events WHERE event_type = 'separation'`),
        version,
      ).toHaveLength(1);
    }
  });
});

// ArkivDigital's sambohändelse. `cohabitation` as an event type sits beside
// `cohabitation` as a couple subtype deliberately — the same pairing MARR and
// ENGA already have. One word, two columns, one concept.
describe('_DOMESTIC_PARTNERSHIP', () => {
  it('makes the couple a cohabitation', async () => {
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(readDialect('arkivdigital.ged')));
    const couples = await queryAll<{ subtype: string }>(
      fresh, `SELECT subtype FROM relationships WHERE type = 'couple'`);
    expect(couples.map(c => c.subtype)).toContain('cohabitation');
  });

  it('records the event with its date', async () => {
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(readDialect('arkivdigital.ged')));
    const ev = await queryAll<{ date_value: string | null; relationship_id: string | null }>(
      fresh, `SELECT date_value, relationship_id FROM events WHERE event_type = 'cohabitation'`);
    expect(ev).toHaveLength(1);
    expect(ev[0].date_value).toBe('1975-06-01');
    expect(ev[0].relationship_id).not.toBeNull();
  });

  it('does not override an explicit MARR', async () => {
    const fresh = await createTestDb();
    await importGedcom(fresh, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
0 @I2@ INDI
1 NAME C /D/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1980
1 _DOMESTIC_PARTNERSHIP
2 DATE 1975
0 TRLR
`));
    const couples = await queryAll<{ subtype: string }>(
      fresh, `SELECT subtype FROM relationships WHERE type = 'couple'`);
    expect(couples.map(c => c.subtype)).toEqual(['marriage']);
    // Both events still exist — the subtype is one value, the history is not.
    const types = await queryAll<{ event_type: string }>(
      fresh, `SELECT event_type FROM events ORDER BY event_type`);
    expect(types.map(t => t.event_type)).toEqual(['cohabitation', 'marriage']);
  });

  it('round-trips under both versions', async () => {
    for (const version of ['5.5.1', '7.0'] as const) {
      const fresh = await createTestDb();
      await importGedcom(fresh, parseGedcom(readDialect('arkivdigital.ged')));
      const back = await createTestDb();
      const { ged } = await exportGedcom(fresh, version);
      expect(ged, version).toContain('1 _DOMESTIC_PARTNERSHIP');
      await importGedcom(back, parseGedcom(ged));
      const couples = await queryAll<{ subtype: string }>(
        back, `SELECT subtype FROM relationships WHERE type = 'couple'`);
      expect(couples.map(c => c.subtype), version).toContain('cohabitation');
      const ev = await queryAll<{ date_value: string | null }>(
        back, `SELECT date_value FROM events WHERE event_type = 'cohabitation'`);
      expect(ev, version).toHaveLength(1);
      expect(ev[0].date_value, version).toBe('1975-06-01');
    }
  });
});
