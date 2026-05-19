// GEDCOM shared-notes round-trip (T04 — GEDCOM alignment plan).
//
// User goal (verbatim from the plan): every authored field in our database
// survives a GEDCOM 5.5.1 OR 7.0 round-trip cleanly, or is explicitly
// classified as `lossy` / `excluded`. No silent data loss on export.
//
// For T04 specifically: shared notes are first-class entities. GEDCOM 7.0
// SNOTE round-trips losslessly (one notes row + two note_links rows on
// import); GEDCOM 5.5.1 degrades to repeated inline NOTE with a disclosure
// warning (lossy:5.5.1-shared-degrades-to-inline).

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson } from '../../src/api/persons';
import { createNote, linkNoteToEntity, listNotes, getNotesForEntity } from '../../src/api/notes';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('GEDCOM notes round-trip (T04)', () => {
  it('7.0 SNOTE round-trip preserves a shared note across 2 persons (lossless)', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'Alice', surname: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'Bob', surname: 'B' });
    const note = await createNote(db, { text: 'Both moved to America in 1880.', language: 'sv' });
    await linkNoteToEntity(db, note.id, 'person', p1.id);
    await linkNoteToEntity(db, note.id, 'person', p2.id);

    const { ged } = await exportGedcom(db, '7.0');

    // Top-level SNOTE record present
    expect(ged).toMatch(/0 @N\d+@ SNOTE Both moved to America in 1880\./);
    // SNOTE LANG sub-record present
    expect(ged).toMatch(/0 @N\d+@ SNOTE[^\n]*\n1 LANG sv/);
    // Two SNOTE pointer references (one per INDI)
    const pointers = ged.match(/^1 SNOTE @N\d+@/gm) ?? [];
    expect(pointers).toHaveLength(2);

    // Re-import into a fresh DB
    const db2 = await createTestDb();
    const tree = parseGedcom(ged);
    await importGedcom(db2, tree);

    const reimported = await listNotes(db2);
    expect(reimported).toHaveLength(1);
    expect(reimported[0].text).toBe('Both moved to America in 1880.');
    expect(reimported[0].language).toBe('sv');
  });

  it('5.5.1 degrades shared notes to inline NOTE and discloses via report.warnings (lossy)', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'Alice', surname: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'Bob', surname: 'B' });
    const note = await createNote(db, { text: 'Both moved to America in 1880.', language: 'sv' });
    await linkNoteToEntity(db, note.id, 'person', p1.id);
    await linkNoteToEntity(db, note.id, 'person', p2.id);

    const { ged, report } = await exportGedcom(db, '5.5.1');

    // No SNOTE records in 5.5.1 output
    expect(ged).not.toMatch(/SNOTE/);
    // Two inline NOTEs (one per INDI)
    const inlineNotes = ged.match(/^1 NOTE Both moved to America in 1880\./gm) ?? [];
    expect(inlineNotes).toHaveLength(2);
    // Shared-note degradation disclosed in warnings
    expect(report.warnings.some(w => /shared note/i.test(w) && /5\.5\.1/.test(w))).toBe(true);
  });

  it('7.0 SNOTE references multiple entity kinds (person + relationship) — both link', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'Alice', surname: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'Bob', surname: 'B' });
    const note = await createNote(db, { text: 'Family bible note.', language: '' });
    await linkNoteToEntity(db, note.id, 'person', p1.id);
    await linkNoteToEntity(db, note.id, 'person', p2.id);

    const { ged } = await exportGedcom(db, '7.0');
    // Exactly one SNOTE record at top level
    const records = ged.match(/^0 @N\d+@ SNOTE/gm) ?? [];
    expect(records).toHaveLength(1);
  });
});
