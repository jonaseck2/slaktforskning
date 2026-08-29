// A married name stays a married name.
//
// RootsMagic writes it as a sub-tag of the birth NAME. Measured 2026-08-29 over
// the 36 real .ged files in export-import/samples: 724 occurrences, all in
// rootsmagic-8.ged, all at level 2 under INDI.NAME — and **all as a bare
// surname**, never in the `/Surname/` form:
//
//   2 _MARNM Gascoigne
//   2 _MARNM De Brittany
//
// 0 of 724 carry a slash. Reading the value with the standard NAME splitter
// would have stored "Gascoigne" as a *given* name on every one of them. The
// slash-delimited form is still accepted, because other programs write it and
// mis-storing an authored value is the failure mode that matters here.
//
// `person_names` already models this: name_type 'married' plus the matching
// name_qualifier. See docs/plans/2026-08-23-dialect-tag-review.md Task 5.

import { describe, it, expect } from 'vitest';
import { queryAll } from '../../src/api/db';
import { exportGedcom } from '../../src/gedcom/exporter';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb, readDialect } from './helpers';

const INLINE = (marnm: string): string => `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Mary /Jones/
2 _MARNM ${marnm}
0 TRLR
`;

describe('_MARNM', () => {
  it('becomes a second person_name with type married', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('rootsmagic.ged')));
    const names = await queryAll<{ given_name: string | null; surname: string | null; name_type: string; sort_order: number }>(
      db, `SELECT pn.given_name, pn.surname, pn.name_type, pn.sort_order
             FROM person_names pn
             JOIN persons p ON p.id = pn.person_id
            WHERE pn.person_id = (SELECT person_id FROM person_names WHERE surname = 'Jones')
            ORDER BY pn.sort_order`);
    expect(names).toContainEqual(
      expect.objectContaining({ surname: 'Smith', name_type: 'married' }));
    // The birth name stays first and stays the birth name.
    expect(names[0].name_type).toBe('birth');
    expect(names[0].surname).toBe('Jones');
  });

  it('reads the bare-surname form RootsMagic actually writes', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(INLINE('Gascoigne')));
    const married = await queryAll<{ given_name: string | null; surname: string | null; name_qualifier: string | null }>(
      db, `SELECT given_name, surname, name_qualifier FROM person_names WHERE name_type = 'married'`);
    // The file states a surname and nothing else. Copying the given name across
    // from the birth NAME would be an inference the file never made.
    expect(married).toEqual([{ given_name: null, surname: 'Gascoigne', name_qualifier: 'married' }]);
  });

  it('reads a multi-word bare surname as one surname', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(INLINE('De Brittany')));
    const married = await queryAll<{ given_name: string | null; surname: string | null }>(
      db, `SELECT given_name, surname FROM person_names WHERE name_type = 'married'`);
    expect(married).toEqual([{ given_name: null, surname: 'De Brittany' }]);
  });

  it('still splits the slash-delimited form other programs write', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(INLINE('Mary /Smith/')));
    const married = await queryAll<{ given_name: string | null; surname: string | null }>(
      db, `SELECT given_name, surname FROM person_names WHERE name_type = 'married'`);
    expect(married).toEqual([{ given_name: 'Mary', surname: 'Smith' }]);
  });

  it('accepts a surname-only slashed _MARNM', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(INLINE('/Smith/')));
    const married = await queryAll<{ given_name: string | null; surname: string }>(
      db, `SELECT given_name, surname FROM person_names WHERE name_type = 'married'`);
    expect(married).toEqual([expect.objectContaining({ surname: 'Smith' })]);
  });

  it('creates no married row when the tag is absent', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Mary /Jones/
0 TRLR
`));
    expect(await queryAll(db, `SELECT id FROM person_names WHERE name_type = 'married'`)).toEqual([]);
  });

  it('round-trips', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('rootsmagic.ged')));
    const back = await createTestDb();
    const { ged } = await exportGedcom(db, '5.5.1');
    await importGedcom(back, parseGedcom(ged));
    const n = await queryAll<{ surname: string | null }>(
      back, `SELECT surname FROM person_names WHERE name_type = 'married'`);
    expect(n).toEqual([{ surname: 'Smith' }]);
  });
});
