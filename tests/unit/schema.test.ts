/**
 * Schema shape tests — assert that every new T02 table/column exists on a
 * fresh in-memory DB, that legacy columns are gone, and that CHECK
 * constraints accept the values they're supposed to.
 *
 * Mechanically pairs with the Prime Directive's round-trip-fidelity guard:
 * if a column is missing from `src/api/schema.ts`, T02's user-observable
 * outcome ("fresh test DB has the new tables/columns") doesn't hold.
 */
import { describe, it, expect } from 'vitest';
import { queryAll, runSql } from '../../src/api/db';
import { createTestDb } from './helpers';

async function tableCols(db: Awaited<ReturnType<typeof createTestDb>>, table: string): Promise<string[]> {
  return (await queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`)).map(c => c.name);
}

describe('GEDCOM-alignment schema additions (T02)', () => {
  it('creates notes table', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'notes');
    expect(cols).toEqual(expect.arrayContaining(['id', 'text', 'language', 'created_at', 'updated_at']));
  });

  it('creates note_links polymorphic table', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'note_links');
    expect(cols).toEqual(expect.arrayContaining(['id', 'note_id', 'entity_type', 'entity_id', 'sort_order', 'created_at']));
  });

  it('creates person_associations table', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'person_associations');
    expect(cols).toEqual(expect.arrayContaining(['id', 'person_id', 'related_person_id', 'role', 'notes', 'created_at']));
  });

  it('adds events.is_negation and events.negation_event_type', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'events');
    expect(cols).toContain('is_negation');
    expect(cols).toContain('negation_event_type');
  });

  it('creates name_translations table', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'name_translations');
    expect(cols).toEqual(expect.arrayContaining(['id', 'person_name_id', 'value', 'language', 'transliteration_scheme', 'created_at']));
  });

  it('creates place_translations table', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'place_translations');
    expect(cols).toEqual(expect.arrayContaining(['id', 'place_id', 'value', 'language', 'transliteration_scheme', 'created_at']));
  });

  it('creates source_coverage_events table', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'source_coverage_events');
    expect(cols).toEqual(expect.arrayContaining(['id', 'source_id', 'event_type', 'date_value_from', 'date_value_to', 'place_id', 'notes', 'created_at']));
  });

  it('removes sources.repository free-text column', async () => {
    const db = await createTestDb();
    const cols = await tableCols(db, 'sources');
    expect(cols).not.toContain('repository');
  });

  it("persons.sex CHECK constraint allows 'X'", async () => {
    const db = await createTestDb();
    // Direct INSERT — bypass the api/createPerson layer because the test is
    // about the schema constraint, not the API contract.
    await expect(
      runSql(db, "INSERT INTO persons (id, sex, notes) VALUES (?, ?, ?)", ['test-x', 'X', '']),
    ).resolves.toBeUndefined();
  });
});
