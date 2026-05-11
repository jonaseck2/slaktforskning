import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { findDuplicates, countDuplicates, mergePersons, ignoreDuplicate } from '../../src/api/duplicates';
import { initializeSchema } from '../../src/api/schema';
import { queryAll, queryOne, runSql } from '../../src/api/db';
import { deletePerson } from '../../src/api/persons';
import { createPerson, addPersonName, getPersonNames, getPerson, addPersonIdentifier, getPersonIdentifiers } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant, getEventParticipants, createRelationship, getRelationshipsOfPerson } from '../../src/api/relationships';
import { createSource, createCitation, getCitationsForPerson } from '../../src/api/sources';
import { createGroup, addGroupLink, getGroupsForPerson } from '../../src/api/groups';
import { createResearchTask, getResearchTasksForPerson, addTaskLink } from '../../src/api/research_tasks';
import { createTestDb } from './helpers';

let db: Database;
beforeEach(async () => { db = await createTestDb(); });

describe('findDuplicates', async () => {
  it('detects persons with same name', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    await createPerson(db, { given_name: 'Anna', surname: 'Johansson', sex: 'F' });

    const dupes = await findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].score).toBeGreaterThanOrEqual(50);
    expect(dupes[0].reasons).toContain('same_surname');
    expect(dupes[0].reasons).toContain('same_given_name');
  });

  it('boosts score when birth dates match', async () => {
    const p1 = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const e1 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    await addEventParticipant(db, { event_id: e1.id, person_id: p1.id, role: 'primary' });
    const e2 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    await addEventParticipant(db, { event_id: e2.id, person_id: p2.id, role: 'primary' });

    const dupes = await findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('same_birth_date');
    expect(dupes[0].score).toBe(100);
  });

  it('does not flag persons with different surnames', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    await createPerson(db, { given_name: 'Erik', surname: 'Johansson' });

    expect(await findDuplicates(db)).toHaveLength(0);
  });

  it('penalizes sex mismatch', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'F' });

    const dupes = await findDuplicates(db);
    // Score = 30 (surname) + 40 (given) - 40 (sex) = 30, below threshold
    expect(dupes).toHaveLength(0);
  });
});

describe('countDuplicates', async () => {
  it('returns 0 when there are no candidate pairs', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    expect(await countDuplicates(db)).toBe(0);
  });

  it('returns the true total even past the findDuplicates page-size limit', async () => {
    // Create 105 pairs, each pair sharing a unique surname so they don't all
    // collapse into one big group (normalizeName strips digits).
    const surnames: string[] = [];
    for (let i = 0; i < 105; i++) {
      const a = String.fromCharCode(97 + (i % 26));
      const b = String.fromCharCode(97 + Math.floor(i / 26));
      surnames.push(`Svensson${a}${b}xx`);
    }
    for (const sn of surnames) {
      await createPerson(db, { given_name: 'Erik', surname: sn });
      await createPerson(db, { given_name: 'Erik', surname: sn });
    }
    // findDuplicates caps at 100 by default; the badge needs the full count.
    expect(await findDuplicates(db)).toHaveLength(100);
    expect(await countDuplicates(db)).toBe(105);
  });

  it('drops by one after merging a candidate pair', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Johansson' });

    expect(await countDuplicates(db)).toBe(2);
    await mergePersons(db, a.id, b.id);
    expect(await countDuplicates(db)).toBe(1);
  });

  it('drops by one after ignoring a candidate pair', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    await createPerson(db, { given_name: 'Anna', surname: 'Johansson' });

    expect(await countDuplicates(db)).toBe(2);
    await ignoreDuplicate(db, a.id, b.id);
    expect(await countDuplicates(db)).toBe(1);
  });
});

describe('ignoreDuplicate', async () => {
  it('persists the pair canonically (lower id first) so insertion order does not matter', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

    await ignoreDuplicate(db, hi, lo); // Reverse order on purpose

    const rows = await queryAll<{ person1_id: string; person2_id: string }>(db, 'SELECT person1_id, person2_id FROM ignored_duplicates');
    expect(rows).toEqual([{ person1_id: lo, person2_id: hi }]);
  });

  it('is idempotent — re-ignoring the same pair does not duplicate the row', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });

    await ignoreDuplicate(db, a.id, b.id);
    await ignoreDuplicate(db, b.id, a.id);

    const count = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM ignored_duplicates'))?.n;
    expect(count).toBe(1);
  });

  it('hides ignored pairs from findDuplicates while keeping other pairs visible', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const c = await createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    const d = await createPerson(db, { given_name: 'Anna', surname: 'Johansson' });

    expect(await findDuplicates(db)).toHaveLength(2);

    await ignoreDuplicate(db, a.id, b.id);

    const remaining = await findDuplicates(db);
    expect(remaining).toHaveLength(1);
    expect(new Set([remaining[0].person1_id, remaining[0].person2_id])).toEqual(new Set([c.id, d.id]));
  });

  it('rejects ignoring a person against themselves', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    await expect(ignoreDuplicate(db, a.id, a.id)).rejects.toThrow();
  });

  it('cascades on person delete — orphaned pair rows do not linger', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    await ignoreDuplicate(db, a.id, b.id);

    // The v0.220.0 polymorphism migration dropped the FK to persons; deletePerson
    // now performs an explicit cleanup mirroring task_links / group_links.
    await runSql(db, 'PRAGMA foreign_keys = ON');
    await deletePerson(db, a.id);

    const count = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM ignored_duplicates'))?.n;
    expect(count).toBe(0);
  });
});

describe('ignored_duplicates polymorphism (v0.220.0)', async () => {
  it('persists every person ignore as entity_type=person', async () => {
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    await ignoreDuplicate(db, a.id, b.id);

    const rows = await queryAll<{ entity_type: string }>(db, 'SELECT entity_type FROM ignored_duplicates');
    expect(rows).toEqual([{ entity_type: 'person' }]);
  });

  it('does not collide across entity types — ignoring a place pair with the same UUIDs as a person pair leaves the person pair visible', async () => {
    // User-observable goal check: the duplicates view tabs (persons / places / sources / media)
    // must each be independent. Marking a place pair as ignored must NOT silently mark
    // a person pair with the same UUIDs as ignored. The polymorphic key is (entity_type, id1, id2).
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

    // Insert a place-typed ignore row using the SAME pair of ids as the person pair.
    // The polymorphic table accepts this — ids are no longer FK-constrained to persons.
    await runSql(
      db,
      "INSERT INTO ignored_duplicates (entity_type, person1_id, person2_id) VALUES ('place', ?, ?)",
      [lo, hi],
    );

    // The person pair must still surface in findDuplicates.
    const dupes = await findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(new Set([dupes[0].person1_id, dupes[0].person2_id])).toEqual(new Set([a.id, b.id]));

    // Sanity: the place row is in the table, just filtered out by the person query.
    const placeRows = await queryAll<{ entity_type: string }>(
      db, "SELECT entity_type FROM ignored_duplicates WHERE entity_type = 'place'"
    );
    expect(placeRows).toHaveLength(1);
  });

  it('migration is idempotent — running initializeSchema twice does not crash or double-add the column', async () => {
    // await createTestDb() already ran initializeSchema once; running it again is the
    // idempotency check.
    await expect(initializeSchema(db)).resolves.not.toThrow();
    await expect(initializeSchema(db)).resolves.not.toThrow();

    // After three runs, the column shape must still be the migrated shape — not
    // duplicated, not missing.
    const cols = (await queryAll<{ name: string }>(db, 'PRAGMA table_info(ignored_duplicates)')).map(c => c.name);
    expect(cols.sort()).toEqual(['created_at', 'entity_type', 'person1_id', 'person2_id']);
  });

  it('migration preserves existing person ignores when upgrading from the pre-polymorphism shape', async () => {
    // Simulate a pre-v0.220.0 database: rebuild the table with the OLD shape
    // (person1_id/person2_id PK, FK to persons, no entity_type), seed a row,
    // then re-run initializeSchema and verify the row carries entity_type='person'.
    const a = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

    await runSql(db, 'PRAGMA foreign_keys = OFF');
    await runSql(db, 'DROP TABLE ignored_duplicates');
    await runSql(db, `
      CREATE TABLE ignored_duplicates (
        person1_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        person2_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (person1_id, person2_id),
        CHECK (person1_id < person2_id)
      )
    `);
    await runSql(db, 'PRAGMA foreign_keys = ON');
    await runSql(db, 'INSERT INTO ignored_duplicates (person1_id, person2_id) VALUES (?, ?)', [lo, hi]);

    // Now run the migration ladder.
    await initializeSchema(db);

    // Row must survive — and must carry entity_type='person' courtesy of the migration's INSERT default.
    const rows = await queryAll<{ entity_type: string; person1_id: string; person2_id: string }>(
      db, 'SELECT entity_type, person1_id, person2_id FROM ignored_duplicates'
    );
    expect(rows).toEqual([{ entity_type: 'person', person1_id: lo, person2_id: hi }]);

    // And findDuplicates honours the migrated row — the person pair is hidden.
    expect(await findDuplicates(db)).toHaveLength(0);
  });
});

describe('mergePersons', async () => {
  it('merges names from source to target', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const source = await createPerson(db, { given_name: 'Erik Johan', surname: 'Svensson' });
    await addPersonName(db, source.id, { given_name: 'E.J.', surname: 'Svensson', name_type: 'alias' });

    await mergePersons(db, target.id, source.id);

    const names = await getPersonNames(db, target.id);
    expect(names.length).toBeGreaterThanOrEqual(2); // target's original + source's birth + alias
    expect(await getPerson(db, source.id)).toBeNull(); // source deleted
  });

  it('reassigns event participants', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });

    const event = await createEvent(db, { event_type: 'birth', date_type: 'exact' });
    await addEventParticipant(db, { event_id: event.id, person_id: source.id, role: 'primary' });

    const result = await mergePersons(db, target.id, source.id);
    expect(result.moved.event_participants).toBe(1);

    const participants = await getEventParticipants(db, event.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].person_id).toBe(target.id);
  });

  it('skips duplicate event participants', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });

    const event = await createEvent(db, { event_type: 'census', date_type: 'exact' });
    await addEventParticipant(db, { event_id: event.id, person_id: target.id, role: 'primary' });
    await addEventParticipant(db, { event_id: event.id, person_id: source.id, role: 'primary' });

    const result = await mergePersons(db, target.id, source.id);
    expect(result.moved.event_participants).toBe(0); // skipped, target already there

    const participants = await getEventParticipants(db, event.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].person_id).toBe(target.id);
  });

  it('reassigns relationships and removes self-relationships', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const other = await createPerson(db, { given_name: 'Anna', surname: 'B' });

    // Source married to other
    await createRelationship(db, { type: 'couple', person1_id: source.id, person2_id: other.id });
    // Source related to target (would become self-relationship — should be deleted)
    await createRelationship(db, { type: 'sibling', person1_id: source.id, person2_id: target.id });

    await mergePersons(db, target.id, source.id);

    const rels = await getRelationshipsOfPerson(db, target.id);
    // Should have the couple relationship, but NOT the sibling (self-rel deleted)
    expect(rels.some(r => r.type === 'couple')).toBe(true);
    expect(rels.some(r => r.person1_id === target.id && r.person2_id === target.id)).toBe(false);
  });

  it('reassigns citations, groups, and research tasks', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });

    // Citation on source
    const src = await createSource(db, { title: 'Test' });
    await createCitation(db, { source_id: src.id, person_id: source.id });

    // Group membership
    const group = await createGroup(db, { name: 'Test Group' });
    await addGroupLink(db, group.id, 'person', source.id);

    // Research task linked to person
    const rt = await createResearchTask(db, { task: 'Find birth record' });
    await addTaskLink(db, rt.id, 'person', source.id);

    const result = await mergePersons(db, target.id, source.id);

    expect(result.moved.citations).toBe(1);
    expect(result.moved.group_members).toBe(1);
    expect(result.moved.research_tasks).toBe(1);

    // Verify reassignment
    expect(await getCitationsForPerson(db, target.id)).toHaveLength(1);
    expect(await getGroupsForPerson(db, target.id)).toHaveLength(1);
    expect(await getResearchTasksForPerson(db, target.id)).toHaveLength(1);
  });

  it('merges notes and sex from source when target has unknown sex', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'U', notes: 'Target notes' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M', notes: 'Source notes' });

    await mergePersons(db, target.id, source.id);

    const merged = await getPerson(db, target.id)!;
    expect(merged.sex).toBe('M');
    expect(merged.notes).toContain('Target notes');
    expect(merged.notes).toContain('Source notes');
  });

  it('throws when merging with self', async () => {
    const p = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    await expect(mergePersons(db, p.id, p.id)).rejects.toThrow('Cannot merge a person with themselves');
  });

  it('throws for nonexistent target', async () => {
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    await expect(mergePersons(db, 'nonexistent', source.id)).rejects.toThrow('Target person not found');
  });

  it('throws for nonexistent source', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    await expect(mergePersons(db, target.id, 'nonexistent')).rejects.toThrow('Source person not found');
  });

  it('skips duplicate group memberships', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const group = await createGroup(db, { name: 'Test Group' });
    await addGroupLink(db, group.id, 'person', target.id);
    await addGroupLink(db, group.id, 'person', source.id);

    const result = await mergePersons(db, target.id, source.id);
    expect(result.moved.group_members).toBe(0); // both in same group

    expect(await getGroupsForPerson(db, target.id)).toHaveLength(1);
  });

  it('skips duplicate identifiers during merge', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });
    await addPersonIdentifier(db, target.id, { identifier_type: 'familysearch', identifier_value: 'FS-123' });
    await addPersonIdentifier(db, source.id, { identifier_type: 'familysearch', identifier_value: 'FS-123' });

    const result = await mergePersons(db, target.id, source.id);
    expect(result.moved.person_identifiers).toBe(0);

    expect(await getPersonIdentifiers(db, target.id)).toHaveLength(1);
  });

  it('does not merge notes when source has no notes', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A', notes: 'Keep this' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A' });

    await mergePersons(db, target.id, source.id);
    const merged = await getPerson(db, target.id)!;
    expect(merged.notes).toBe('Keep this');
  });

  it('keeps target sex when source also has a known sex', async () => {
    const target = await createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M' });
    const source = await createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'F' });

    await mergePersons(db, target.id, source.id);
    const merged = await getPerson(db, target.id)!;
    expect(merged.sex).toBe('M'); // target sex preserved
  });
});

describe('findDuplicates edge cases', async () => {
  it('detects given_name_prefix matches', async () => {
    await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    await createPerson(db, { given_name: 'Erik Johan', surname: 'Svensson', sex: 'M' });

    const dupes = await findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('given_name_prefix');
  });

  it('boosts score for same_birth_year (different dates)', async () => {
    const p1 = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const e1 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    await addEventParticipant(db, { event_id: e1.id, person_id: p1.id, role: 'primary' });
    const e2 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-07-20' });
    await addEventParticipant(db, { event_id: e2.id, person_id: p2.id, role: 'primary' });

    const dupes = await findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('same_birth_year');
  });

  it('penalizes different birth years', async () => {
    const p1 = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = await createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const e1 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    await addEventParticipant(db, { event_id: e1.id, person_id: p1.id, role: 'primary' });
    const e2 = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1870-07-20' });
    await addEventParticipant(db, { event_id: e2.id, person_id: p2.id, role: 'primary' });

    const dupes = await findDuplicates(db);
    // 30 (surname) + 40 (given) - 30 (diff birth) = 40, below 50 threshold
    expect(dupes).toHaveLength(0);
  });

  it('penalizes completely different given names', async () => {
    await createPerson(db, { given_name: 'Anna', surname: 'Svensson', sex: 'F' });
    await createPerson(db, { given_name: 'Karin', surname: 'Svensson', sex: 'F' });

    const dupes = await findDuplicates(db);
    // 30 (surname) - 20 (different given) = 10, below threshold
    expect(dupes).toHaveLength(0);
  });

  it('skips persons with empty surname', async () => {
    await createPerson(db, { given_name: 'Erik' });
    await createPerson(db, { given_name: 'Erik' });

    const dupes = await findDuplicates(db);
    expect(dupes).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    // Create 5 pairs of duplicates
    for (let i = 0; i < 5; i++) {
      await createPerson(db, { given_name: 'Erik', surname: `Family${i}`, sex: 'M' });
      await createPerson(db, { given_name: 'Erik', surname: `Family${i}`, sex: 'M' });
    }
    const dupes = await findDuplicates(db, 2);
    expect(dupes).toHaveLength(2);
  });
});

// Regression coverage for the post-merge dedupe rules added 2026-05-09 after
// the Bernadotte test session showed that merging two persons with their own
// birth events left two birth events on the survivor.
describe('mergePersons — post-merge dedupe', async () => {
  it('demotes source primary birth name to aka instead of leaving two birth rows', async () => {
    const target = await createPerson(db, { given_name: 'Jean-Baptiste Jules', surname: 'Bernadotte' });
    const source = await createPerson(db, { given_name: 'Jean Baptiste', surname: 'Bernadotte' });

    await mergePersons(db, target.id, source.id);

    const names = await getPersonNames(db, target.id);
    const birthNames = names.filter(n => n.name_type === 'birth');
    expect(birthNames.length).toBe(1);
    expect(birthNames[0].given_name).toBe('Jean-Baptiste Jules');
    // The source's primary name survives as an aka, not lost
    expect(names.some(n => n.given_name === 'Jean Baptiste' && n.name_type === 'aka')).toBe(true);
  });

  it('keeps target birth event and deletes the duplicate from source, transferring citations', async () => {
    const target = await createPerson(db, { given_name: 'Karl', surname: 'X' });
    const source = await createPerson(db, { given_name: 'Karl', surname: 'X' });
    const targetBirth = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1763-01-26' });
    const sourceBirth = await createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1763-01-26' });
    await addEventParticipant(db, { event_id: targetBirth.id, person_id: target.id, role: 'primary' });
    await addEventParticipant(db, { event_id: sourceBirth.id, person_id: source.id, role: 'primary' });

    // Add a citation to the SOURCE's birth event so we can verify it's
    // transferred to the survivor (target's birth event), not lost.
    const src = await createSource(db, { title: 'Pau parish register', source_type: 'church_record' });
    await createCitation(db, { source_id: src.id, event_id: sourceBirth.id, page: 'f. 14r' });

    const result = await mergePersons(db, target.id, source.id);
    expect(result.moved.events_deduped).toBe(1);

    // Target now has exactly ONE birth event, and it is the original target's.
    const remaining = await queryAll<{ id: string; event_type: string }>(db,
      `SELECT e.id, e.event_type FROM events e
       JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.person_id = ? AND e.event_type = 'birth'`, [target.id]);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(targetBirth.id);

    // Citation was transferred to the survivor — not deleted.
    const citationsAfter = await queryAll<{ id: string; event_id: string }>(db,
      'SELECT id, event_id FROM citations WHERE source_id = ?', [src.id]);
    expect(citationsAfter.length).toBe(1);
    expect(citationsAfter[0].event_id).toBe(targetBirth.id);
  });

  it('does not dedupe events that allow multiple per person (e.g. census, residence)', async () => {
    const target = await createPerson(db, { given_name: 'Karl', surname: 'X' });
    const source = await createPerson(db, { given_name: 'Karl', surname: 'X' });
    const targetCensus = await createEvent(db, { event_type: 'census', date_type: 'exact', date_value: '1860' });
    const sourceCensus = await createEvent(db, { event_type: 'census', date_type: 'exact', date_value: '1870' });
    await addEventParticipant(db, { event_id: targetCensus.id, person_id: target.id, role: 'primary' });
    await addEventParticipant(db, { event_id: sourceCensus.id, person_id: source.id, role: 'primary' });

    await mergePersons(db, target.id, source.id);

    const censuses = await queryAll<{ id: string }>(db,
      `SELECT e.id FROM events e
       JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.person_id = ? AND e.event_type = 'census'`, [target.id]);
    expect(censuses.length).toBe(2); // both kept — census can repeat
  });
});
