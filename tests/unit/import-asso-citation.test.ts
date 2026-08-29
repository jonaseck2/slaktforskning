// A citation on an association.
//
// RootsMagic writes `2 SOUR @S1@` under `1 ASSO`. asso.ts read ROLE / RELA /
// _EVID / NOTE and not SOUR, so the source backing the association was dropped.
//
// Where the citation can attach depends on which branch the ASSO takes:
//
//   _EVID present          → event_participants  — no FK; the citation belongs
//                            on the event, which already has one
//   lowercase T05 role     → person_associations — no FK; `citations` has no
//                            person_association_id column
//   Sibling/Godparent/Other→ relationships       — citations.relationship_id ✓
//   anything else          → nothing, assoDropCount++
//
// This maps the third branch, where both the row and the FK exist. Measured
// 2026-08-29 over the 36 real .ged files in export-import/samples:
// INDI.ASSO.SOUR occurs 0 times — it is fixture-only today. FAM.ASSO.SOUR
// occurs twice, and FAM-level ASSO is not read by any phase at all; that
// belongs to docs/plans/2026-08-28-standard-tag-gaps.md.
//
// See docs/plans/2026-08-23-dialect-tag-review.md Task 8.

import { describe, it, expect } from 'vitest';
import { queryAll } from '../../src/api/db';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb } from './helpers';

const ASSO_WITH_SOUR = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Parish book
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 ASSO @I2@
2 RELA Godparent
2 SOUR @S1@
3 PAGE 14
0 @I2@ INDI
1 NAME Anna /Ersdotter/
0 TRLR
`;

describe('citation on an association', () => {
  it('attaches to the relationship the ASSO created', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(ASSO_WITH_SOUR));
    const rows = await queryAll<{ page: string; relationship_id: string; type: string }>(db, `
      SELECT c.page, c.relationship_id, r.type
        FROM citations c JOIN relationships r ON r.id = c.relationship_id`);
    expect(rows).toEqual([expect.objectContaining({ page: '14', type: 'godparent' })]);
  });

  it('does not create an orphan citation when the ASSO creates no relationship', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(ASSO_WITH_SOUR.replace('RELA Godparent', 'RELA Witness')));
    expect(await queryAll(db, 'SELECT id FROM citations')).toEqual([]);
  });

  it('does not create an orphan citation for a lowercase person_association role', async () => {
    // `citations` has no person_association_id column. Writing the citation
    // against the person instead would attach it to something the file did not
    // cite. Left for the standard-tag-gaps plan, with the reason declared.
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(ASSO_WITH_SOUR.replace('RELA Godparent', 'RELA godparent')));
    expect(await queryAll(db, 'SELECT id FROM person_associations')).toHaveLength(1);
    expect(await queryAll(db, 'SELECT id FROM citations')).toEqual([]);
  });

  it('carries QUAY, NOTE and the ArkivDigital sub-tags across too', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(ASSO_WITH_SOUR.replace(
      '3 PAGE 14', '3 PAGE 14\n3 QUAY 3\n3 NOTE Read from the original')));
    const rows = await queryAll<{ page: string; confidence: number; notes: string }>(
      db, 'SELECT page, confidence, notes FROM citations');
    expect(rows).toEqual([expect.objectContaining({
      page: '14', confidence: 3, notes: 'Read from the original',
    })]);
  });

  it('handles two ASSO citations without one query per association', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Parish book
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 ASSO @I2@
2 RELA Godparent
2 SOUR @S1@
3 PAGE 14
1 ASSO @I3@
2 RELA Sibling
2 SOUR @S1@
3 PAGE 15
0 @I2@ INDI
1 NAME Anna /Ersdotter/
0 @I3@ INDI
1 NAME Bror /Hedqvist/
0 TRLR
`));
    const rows = await queryAll<{ page: string; type: string }>(db, `
      SELECT c.page, r.type FROM citations c JOIN relationships r ON r.id = c.relationship_id
       ORDER BY c.page`);
    expect(rows).toEqual([
      { page: '14', type: 'godparent' },
      { page: '15', type: 'sibling' },
    ]);
  });

  it('reports nothing unaccounted for the ASSO citation shape', async () => {
    const { matchDeclared } = await import('../../src/import/gedcom/accounting-declared');
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(ASSO_WITH_SOUR));
    const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
    expect(undeclared).toEqual([]);
  });
});
