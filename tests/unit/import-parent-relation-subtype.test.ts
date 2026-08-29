// A parent relation the file declined to state is not a relation the DB gets to
// assert. `default: return 'biological'` was a Prime Directive violation, not a
// gap: it wrote a claim of biological parentage onto every value it did not
// recognise. Measured over the 36 real .ged files in export-import/samples:
// 34 `Unknown` and 1 `Private` reached that default and were stored biological.
//
// See docs/plans/2026-08-23-dialect-tag-review.md Task 3.

import { describe, it, expect } from 'vitest';
import { queryAll } from '../../src/api/db';
import { exportGedcom } from '../../src/gedcom/exporter';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { parentRelSubtype } from '../../src/import/gedcom/profiles/arkivdigital';
import { createTestDb } from './helpers';

describe('parentRelSubtype', () => {
  it.each([
    ['Natural', 'biological'],
    ['natural', 'biological'],
    ['biological', 'biological'],
    ['Adopted', 'adopted'],
    ['adopted', 'adopted'],
    ['Step', 'step'],
    ['Foster', 'foster'],
    ['Unknown', 'unknown'],
    ['Private', 'unknown'],
    ['', 'unknown'],
    ['Sealed', 'unknown'],
  ])('maps %s to %s', (input, expected) => {
    expect(parentRelSubtype(input)).toBe(expected);
  });

  it('never answers biological for a value it does not recognise', () => {
    // The failure this test exists for: an unrecognised word became a claim
    // of biological parentage the file never made.
    for (const v of ['Sealed', 'Guardian', '?', 'okänd', 'xyz']) {
      expect(parentRelSubtype(v), v).not.toBe('biological');
    }
  });

  it('answers only values the parent_child subtype vocabulary allows', () => {
    const allowed = new Set(['biological', 'adopted', 'foster', 'step', 'unknown']);
    for (const v of ['Natural', 'Step', 'Adopted', 'Unknown', 'Private', 'SEALING',
                     'other', '_ENUMVAL', 'birth', '']) {
      expect(allowed.has(parentRelSubtype(v)), `${v} → ${parentRelSubtype(v)}`).toBe(true);
    }
  });
});

const FAM_WITH = (childTags: string): string => `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME P /Parent/
0 @I2@ INDI
1 NAME C /Child/
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
${childTags}0 TRLR
`;

describe('the DB never asserts a relation the file declined to state', () => {
  it('stores Unknown as unknown, not biological', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(FAM_WITH('2 _FREL Unknown\n')));
    const pc = await queryAll<{ subtype: string }>(
      db, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype)).toEqual(['unknown']);
  });

  it('stores Private as unknown, not biological', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(FAM_WITH('2 _FREL Private\n')));
    const pc = await queryAll<{ subtype: string }>(
      db, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype)).toEqual(['unknown']);
  });

  // PEDI took the same shape from the other direction: an unrecognised value
  // went into `subtype` verbatim, with no vocabulary check at all. The corpus
  // writes SEALING, OTHER, _ENUMVAL and _ENUM2 there.
  it('routes an out-of-vocabulary PEDI to unknown instead of storing it verbatim', async () => {
    for (const raw of ['SEALING', 'OTHER', '_ENUMVAL']) {
      const db = await createTestDb();
      await importGedcom(db, parseGedcom(FAM_WITH(`2 PEDI ${raw}\n`)));
      const pc = await queryAll<{ subtype: string }>(
        db, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
      expect(pc.map(r => r.subtype), raw).toEqual(['unknown']);
    }
  });

  it('reads the PEDI values it does recognise', async () => {
    for (const [raw, expected] of [['ADOPTED', 'adopted'], ['FOSTER', 'foster'], ['BIRTH', 'biological']]) {
      const db = await createTestDb();
      await importGedcom(db, parseGedcom(FAM_WITH(`2 PEDI ${raw}\n`)));
      const pc = await queryAll<{ subtype: string }>(
        db, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
      expect(pc.map(r => r.subtype), raw).toEqual([expected]);
    }
  });

  // GEDCOM 5.5.1 §PEDI names `birth` as the assumed value, so a CHIL with no
  // PEDI and no _FREL is biological by the spec — not by our guess.
  it('keeps biological when the file states nothing at all', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(FAM_WITH('')));
    const pc = await queryAll<{ subtype: string }>(
      db, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype)).toEqual(['biological']);
  });

  it('round-trips unknown through an export and back', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(FAM_WITH('2 _FREL Unknown\n')));
    const { ged } = await exportGedcom(db, '5.5.1');
    const back = await createTestDb();
    await importGedcom(back, parseGedcom(ged));
    const pc = await queryAll<{ subtype: string }>(
      back, `SELECT subtype FROM relationships WHERE type = 'parent_child'`);
    expect(pc.map(r => r.subtype)).toEqual(['unknown']);
  });
});
