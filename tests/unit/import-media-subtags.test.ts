// The media sub-tags GEDCOM puts one level down.
//
// `media.format` and `media.title` were read as direct children of OBJE:
//
//   1 OBJE
//   2 FORM jpeg          ← read
//   2 FILE photo.jpg
//
// GEDCOM 5.5.1's later form and 7.0 put both under FILE instead:
//
//   1 OBJE
//   2 FILE photo.jpg
//   3 FORM image/jpeg    ← dropped
//   3 TITL Wedding, 1928 ← dropped
//
// Measured 2026-08-29 over the 36 real .ged files in export-import/samples:
//
//   OBJE.FILE.FORM  199        OBJE.FORM  0
//   OBJE.FILE.TITL  175        OBJE.TITL  0
//
// Not one top-level OBJE in the corpus writes either tag where the importer
// looked, so `media.format` was null on all 199 and `media.title` fell back to
// `basename(file)` on all 174 records carrying an authored title. Both columns
// already exist — this is mapping work, not modelling work.
//
// See docs/plans/2026-08-23-dialect-tag-review.md Task 9.

import { describe, it, expect } from 'vitest';
import { queryAll } from '../../src/api/db';
import { exportGedcom } from '../../src/gedcom/exporter';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { matchDeclared } from '../../src/import/gedcom/accounting-declared';
import { createTestDb } from './helpers';

const TOP_LEVEL = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @M1@ OBJE
1 FILE photo.jpg
2 FORM jpeg
2 TITL Bröllopet 1928
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 OBJE @M1@
0 TRLR
`;

const INLINE = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 OBJE
2 FILE inline.jpg
3 FORM jpeg
3 TITL Porträtt
0 TRLR
`;

// The shape the importer already read. It must keep working.
const LEVEL_ONE = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @M1@ OBJE
1 FILE photo.jpg
1 FORM jpeg
1 TITL Bröllopet 1928
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 OBJE @M1@
0 TRLR
`;

describe('OBJE.FILE.FORM and OBJE.FILE.TITL', () => {
  it.each([
    ['a top-level OBJE record', TOP_LEVEL, 'photo.jpg', 'Bröllopet 1928'],
    ['an inline OBJE', INLINE, 'inline.jpg', 'Porträtt'],
    ['the level-1 shape the importer already read', LEVEL_ONE, 'photo.jpg', 'Bröllopet 1928'],
  ])('reads both from %s', async (_label, ged, file, title) => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(ged));
    const rows = await queryAll<{ file_ref: string; format: string | null; title: string }>(
      db, 'SELECT file_ref, format, title FROM media');
    expect(rows).toEqual([{ file_ref: file, format: 'jpeg', title }]);
  });

  it('prefers the OBJE-level value when a file also carries one', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @M1@ OBJE
1 TITL Record title
1 FILE photo.jpg
2 TITL File title
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 OBJE @M1@
0 TRLR
`));
    const rows = await queryAll<{ title: string }>(db, 'SELECT title FROM media');
    expect(rows).toEqual([{ title: 'Record title' }]);
  });

  it('still falls back to the file basename when no title is stated anywhere', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @M1@ OBJE
1 FILE photo.jpg
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 OBJE @M1@
0 TRLR
`));
    const rows = await queryAll<{ title: string; format: string | null }>(
      db, 'SELECT title, format FROM media');
    expect(rows).toEqual([{ title: 'photo.jpg', format: null }]);
  });

  it('round-trips both values', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(TOP_LEVEL));
    const { ged } = await exportGedcom(db, '5.5.1');
    const back = await createTestDb();
    await importGedcom(back, parseGedcom(ged));
    const rows = await queryAll<{ format: string | null; title: string }>(
      back, 'SELECT format, title FROM media');
    expect(rows).toEqual([{ format: 'jpeg', title: 'Bröllopet 1928' }]);
  });

  it('no longer declares either path as a drop', () => {
    expect(matchDeclared('OBJE.FILE.FORM')).toBeUndefined();
    expect(matchDeclared('OBJE.FILE.TITL')).toBeUndefined();
  });

  it('leaves the remaining five declared, each with a measured count', () => {
    for (const p of ['OBJE.FILE.FORM.TYPE', 'OBJE.REFN', 'OBJE.REFN.TYPE', 'OBJE.RIN', 'SOUR.ABBR']) {
      const d = matchDeclared(p);
      expect(d, p).toBeDefined();
      expect(d!.reason, `${p} has no count in its reason`).toMatch(/\d+ occurrence/);
      expect(d!.reason, p).not.toContain('pending-dialect-tag-review');
    }
  });
});
