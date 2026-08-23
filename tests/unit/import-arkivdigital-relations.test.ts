// ArkivDigital parent relation types.
// See docs/plans/2026-08-23-arkivdigital-profile.md Task 10.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';
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
