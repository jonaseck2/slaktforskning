// ArkivDigital's `_DATE_TEXT` — the tag their own documentation describes as
// "datum utan giltigt GEDCOM-format": a date the researcher typed that GEDCOM
// cannot express. See docs/plans/2026-08-23-ad-unsampled-tags.md Task 3.
//
// User goal: import a file where the researcher typed a date GEDCOM cannot
// express, and that text appears on the event where they wrote it.

import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { queryAll } from '../../src/api/db';
import { createTestDb, readDialect } from './helpers';

describe('_DATE_TEXT', () => {
  it('becomes date_original when the event has no DATE', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const ev = await queryAll<{ date_original: string; date_value: string | null; date_type: string }>(
      db, `SELECT date_original, date_value, date_type FROM events WHERE date_original = 'vid midsommar 1872'`);
    expect(ev).toHaveLength(1);
    expect(ev[0].date_type).toBe('unknown');
    expect(ev[0].date_value).toBeNull();
  });

  it('never parses the text into date_value', async () => {
    // Prime Directive: the file said this does not parse. Storing a guess at
    // what it means is inference written to the DB.
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 _DATE_TEXT 1872
0 TRLR
`));
    const ev = await queryAll<{ date_original: string; date_value: string | null; date_type: string }>(
      db, `SELECT date_original, date_value, date_type FROM events`);
    expect(ev).toHaveLength(1);
    expect(ev[0].date_original).toBe('1872');
    expect(ev[0].date_value, 'a _DATE_TEXT that happens to look parseable must still not be parsed').toBeNull();
    expect(ev[0].date_type).toBe('unknown');
  });

  it('leaves an event that has a real DATE alone', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 DATE 7 JUN 1879
2 _DATE_TEXT någon gång på sommaren
0 TRLR
`));
    const ev = await queryAll<{ date_original: string; date_value: string | null }>(
      db, `SELECT date_original, date_value FROM events`);
    expect(ev[0].date_value).toBe('1879-06-07');
    expect(ev[0].date_original, 'the DATE keeps date_original; see Task 4').not.toBe('någon gång på sommaren');
  });

  it('reports the with-DATE occurrence rather than dropping it silently', async () => {
    // Prime Directive (cont.) clause 1. The value is not mapped when a DATE is
    // present — so the node stays unread and the import report names it. The
    // `*._DATE_TEXT` declaration is what keeps the accounting gate green, and
    // this asserts the declaration still has something to declare.
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const paths = (report.unaccountedFor ?? []).map(u => u.path);
    expect(paths, 'the with-DATE _DATE_TEXT must stay visible in the report')
      .toContain('FAM._DOMESTIC_PARTNERSHIP._DATE_TEXT');
    expect(paths, 'the no-DATE _DATE_TEXT is read now and must not be reported')
      .not.toContain('INDI.EVEN._DATE_TEXT');
  });

  it('round-trips under both versions', async () => {
    for (const version of ['5.5.1', '7.0'] as const) {
      const db = await createTestDb();
      await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
      const { ged } = await exportGedcom(db, version);
      const back = await createTestDb();
      await importGedcom(back, parseGedcom(ged));
      const ev = await queryAll<{ date_value: string | null }>(
        back, `SELECT date_value FROM events WHERE date_original = 'vid midsommar 1872'`);
      expect(ev, version).toHaveLength(1);
      expect(ev[0].date_value, `re-parsed on the way back in under ${version}`).toBeNull();
    }
  });
});
