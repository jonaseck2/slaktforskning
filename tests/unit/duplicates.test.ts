import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { findDuplicates, countDuplicates, mergePersons, ignoreDuplicate } from '../../src/api/duplicates';
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
beforeEach(() => { db = createTestDb(); });

describe('findDuplicates', () => {
  it('detects persons with same name', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    createPerson(db, { given_name: 'Anna', surname: 'Johansson', sex: 'F' });

    const dupes = findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].score).toBeGreaterThanOrEqual(50);
    expect(dupes[0].reasons).toContain('same_surname');
    expect(dupes[0].reasons).toContain('same_given_name');
  });

  it('boosts score when birth dates match', () => {
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const e1 = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    addEventParticipant(db, { event_id: e1.id, person_id: p1.id, role: 'primary' });
    const e2 = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    addEventParticipant(db, { event_id: e2.id, person_id: p2.id, role: 'primary' });

    const dupes = findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('same_birth_date');
    expect(dupes[0].score).toBe(100);
  });

  it('does not flag persons with different surnames', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    createPerson(db, { given_name: 'Erik', surname: 'Johansson' });

    expect(findDuplicates(db)).toHaveLength(0);
  });

  it('penalizes sex mismatch', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'F' });

    const dupes = findDuplicates(db);
    // Score = 30 (surname) + 40 (given) - 40 (sex) = 30, below threshold
    expect(dupes).toHaveLength(0);
  });
});

describe('countDuplicates', () => {
  it('returns 0 when there are no candidate pairs', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    expect(countDuplicates(db)).toBe(0);
  });

  it('returns the true total even past the findDuplicates page-size limit', () => {
    // Create 105 pairs, each pair sharing a unique surname so they don't all
    // collapse into one big group (normalizeName strips digits).
    const surnames: string[] = [];
    for (let i = 0; i < 105; i++) {
      const a = String.fromCharCode(97 + (i % 26));
      const b = String.fromCharCode(97 + Math.floor(i / 26));
      surnames.push(`Svensson${a}${b}xx`);
    }
    for (const sn of surnames) {
      createPerson(db, { given_name: 'Erik', surname: sn });
      createPerson(db, { given_name: 'Erik', surname: sn });
    }
    // findDuplicates caps at 100 by default; the badge needs the full count.
    expect(findDuplicates(db)).toHaveLength(100);
    expect(countDuplicates(db)).toBe(105);
  });

  it('drops by one after merging a candidate pair', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    createPerson(db, { given_name: 'Anna', surname: 'Johansson' });

    expect(countDuplicates(db)).toBe(2);
    mergePersons(db, a.id, b.id);
    expect(countDuplicates(db)).toBe(1);
  });

  it('drops by one after ignoring a candidate pair', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    createPerson(db, { given_name: 'Anna', surname: 'Johansson' });

    expect(countDuplicates(db)).toBe(2);
    ignoreDuplicate(db, a.id, b.id);
    expect(countDuplicates(db)).toBe(1);
  });
});

describe('ignoreDuplicate', () => {
  it('persists the pair canonically (lower id first) so insertion order does not matter', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

    ignoreDuplicate(db, hi, lo); // Reverse order on purpose

    const rows = queryAll<{ person1_id: string; person2_id: string }>(db, 'SELECT person1_id, person2_id FROM ignored_duplicates');
    expect(rows).toEqual([{ person1_id: lo, person2_id: hi }]);
  });

  it('is idempotent — re-ignoring the same pair does not duplicate the row', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });

    ignoreDuplicate(db, a.id, b.id);
    ignoreDuplicate(db, b.id, a.id);

    const count = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM ignored_duplicates')?.n;
    expect(count).toBe(1);
  });

  it('hides ignored pairs from findDuplicates while keeping other pairs visible', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const c = createPerson(db, { given_name: 'Anna', surname: 'Johansson' });
    const d = createPerson(db, { given_name: 'Anna', surname: 'Johansson' });

    expect(findDuplicates(db)).toHaveLength(2);

    ignoreDuplicate(db, a.id, b.id);

    const remaining = findDuplicates(db);
    expect(remaining).toHaveLength(1);
    expect(new Set([remaining[0].person1_id, remaining[0].person2_id])).toEqual(new Set([c.id, d.id]));
  });

  it('rejects ignoring a person against themselves', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    expect(() => ignoreDuplicate(db, a.id, a.id)).toThrow();
  });

  it('cascades on person delete — orphaned pair rows do not linger', () => {
    const a = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const b = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    ignoreDuplicate(db, a.id, b.id);

    // FK ON DELETE CASCADE only fires when foreign_keys pragma is on (createTestDb sets it).
    runSql(db, 'PRAGMA foreign_keys = ON');
    deletePerson(db, a.id);

    const count = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM ignored_duplicates')?.n;
    expect(count).toBe(0);
  });
});

describe('mergePersons', () => {
  it('merges names from source to target', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'Svensson' });
    const source = createPerson(db, { given_name: 'Erik Johan', surname: 'Svensson' });
    addPersonName(db, source.id, { given_name: 'E.J.', surname: 'Svensson', name_type: 'alias' });

    mergePersons(db, target.id, source.id);

    const names = getPersonNames(db, target.id);
    expect(names.length).toBeGreaterThanOrEqual(2); // target's original + source's birth + alias
    expect(getPerson(db, source.id)).toBeNull(); // source deleted
  });

  it('reassigns event participants', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });

    const event = createEvent(db, { event_type: 'birth', date_type: 'exact' });
    addEventParticipant(db, { event_id: event.id, person_id: source.id, role: 'primary' });

    const result = mergePersons(db, target.id, source.id);
    expect(result.moved.event_participants).toBe(1);

    const participants = getEventParticipants(db, event.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].person_id).toBe(target.id);
  });

  it('skips duplicate event participants', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });

    const event = createEvent(db, { event_type: 'census', date_type: 'exact' });
    addEventParticipant(db, { event_id: event.id, person_id: target.id, role: 'primary' });
    addEventParticipant(db, { event_id: event.id, person_id: source.id, role: 'primary' });

    const result = mergePersons(db, target.id, source.id);
    expect(result.moved.event_participants).toBe(0); // skipped, target already there

    const participants = getEventParticipants(db, event.id);
    expect(participants).toHaveLength(1);
    expect(participants[0].person_id).toBe(target.id);
  });

  it('reassigns relationships and removes self-relationships', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const other = createPerson(db, { given_name: 'Anna', surname: 'B' });

    // Source married to other
    createRelationship(db, { type: 'couple', person1_id: source.id, person2_id: other.id });
    // Source related to target (would become self-relationship — should be deleted)
    createRelationship(db, { type: 'sibling', person1_id: source.id, person2_id: target.id });

    mergePersons(db, target.id, source.id);

    const rels = getRelationshipsOfPerson(db, target.id);
    // Should have the couple relationship, but NOT the sibling (self-rel deleted)
    expect(rels.some(r => r.type === 'couple')).toBe(true);
    expect(rels.some(r => r.person1_id === target.id && r.person2_id === target.id)).toBe(false);
  });

  it('reassigns citations, groups, and research tasks', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });

    // Citation on source
    const src = createSource(db, { title: 'Test' });
    createCitation(db, { source_id: src.id, person_id: source.id });

    // Group membership
    const group = createGroup(db, { name: 'Test Group' });
    addGroupLink(db, group.id, 'person', source.id);

    // Research task linked to person
    const rt = createResearchTask(db, { task: 'Find birth record' });
    addTaskLink(db, rt.id, 'person', source.id);

    const result = mergePersons(db, target.id, source.id);

    expect(result.moved.citations).toBe(1);
    expect(result.moved.group_members).toBe(1);
    expect(result.moved.research_tasks).toBe(1);

    // Verify reassignment
    expect(getCitationsForPerson(db, target.id)).toHaveLength(1);
    expect(getGroupsForPerson(db, target.id)).toHaveLength(1);
    expect(getResearchTasksForPerson(db, target.id)).toHaveLength(1);
  });

  it('merges notes and sex from source when target has unknown sex', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'U', notes: 'Target notes' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M', notes: 'Source notes' });

    mergePersons(db, target.id, source.id);

    const merged = getPerson(db, target.id)!;
    expect(merged.sex).toBe('M');
    expect(merged.notes).toContain('Target notes');
    expect(merged.notes).toContain('Source notes');
  });

  it('throws when merging with self', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'A' });
    expect(() => mergePersons(db, p.id, p.id)).toThrow('Cannot merge a person with themselves');
  });

  it('throws for nonexistent target', () => {
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });
    expect(() => mergePersons(db, 'nonexistent', source.id)).toThrow('Target person not found');
  });

  it('throws for nonexistent source', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A' });
    expect(() => mergePersons(db, target.id, 'nonexistent')).toThrow('Source person not found');
  });

  it('skips duplicate group memberships', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const group = createGroup(db, { name: 'Test Group' });
    addGroupLink(db, group.id, 'person', target.id);
    addGroupLink(db, group.id, 'person', source.id);

    const result = mergePersons(db, target.id, source.id);
    expect(result.moved.group_members).toBe(0); // both in same group

    expect(getGroupsForPerson(db, target.id)).toHaveLength(1);
  });

  it('skips duplicate identifiers during merge', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });
    addPersonIdentifier(db, target.id, { identifier_type: 'familysearch', identifier_value: 'FS-123' });
    addPersonIdentifier(db, source.id, { identifier_type: 'familysearch', identifier_value: 'FS-123' });

    const result = mergePersons(db, target.id, source.id);
    expect(result.moved.person_identifiers).toBe(0);

    expect(getPersonIdentifiers(db, target.id)).toHaveLength(1);
  });

  it('does not merge notes when source has no notes', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A', notes: 'Keep this' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A' });

    mergePersons(db, target.id, source.id);
    const merged = getPerson(db, target.id)!;
    expect(merged.notes).toBe('Keep this');
  });

  it('keeps target sex when source also has a known sex', () => {
    const target = createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'M' });
    const source = createPerson(db, { given_name: 'Erik', surname: 'A', sex: 'F' });

    mergePersons(db, target.id, source.id);
    const merged = getPerson(db, target.id)!;
    expect(merged.sex).toBe('M'); // target sex preserved
  });
});

describe('findDuplicates edge cases', () => {
  it('detects given_name_prefix matches', () => {
    createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    createPerson(db, { given_name: 'Erik Johan', surname: 'Svensson', sex: 'M' });

    const dupes = findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('given_name_prefix');
  });

  it('boosts score for same_birth_year (different dates)', () => {
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const e1 = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    addEventParticipant(db, { event_id: e1.id, person_id: p1.id, role: 'primary' });
    const e2 = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-07-20' });
    addEventParticipant(db, { event_id: e2.id, person_id: p2.id, role: 'primary' });

    const dupes = findDuplicates(db);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reasons).toContain('same_birth_year');
  });

  it('penalizes different birth years', () => {
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });
    const p2 = createPerson(db, { given_name: 'Erik', surname: 'Svensson', sex: 'M' });

    const e1 = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1838-03-15' });
    addEventParticipant(db, { event_id: e1.id, person_id: p1.id, role: 'primary' });
    const e2 = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1870-07-20' });
    addEventParticipant(db, { event_id: e2.id, person_id: p2.id, role: 'primary' });

    const dupes = findDuplicates(db);
    // 30 (surname) + 40 (given) - 30 (diff birth) = 40, below 50 threshold
    expect(dupes).toHaveLength(0);
  });

  it('penalizes completely different given names', () => {
    createPerson(db, { given_name: 'Anna', surname: 'Svensson', sex: 'F' });
    createPerson(db, { given_name: 'Karin', surname: 'Svensson', sex: 'F' });

    const dupes = findDuplicates(db);
    // 30 (surname) - 20 (different given) = 10, below threshold
    expect(dupes).toHaveLength(0);
  });

  it('skips persons with empty surname', () => {
    createPerson(db, { given_name: 'Erik' });
    createPerson(db, { given_name: 'Erik' });

    const dupes = findDuplicates(db);
    expect(dupes).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    // Create 5 pairs of duplicates
    for (let i = 0; i < 5; i++) {
      createPerson(db, { given_name: 'Erik', surname: `Family${i}`, sex: 'M' });
      createPerson(db, { given_name: 'Erik', surname: `Family${i}`, sex: 'M' });
    }
    const dupes = findDuplicates(db, 2);
    expect(dupes).toHaveLength(2);
  });
});
