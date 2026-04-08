import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import { findDuplicates, mergePersons } from '../../src/api/duplicates';
import { createPerson, addPersonName, getPersonNames, getPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant, getEventParticipants, createRelationship, getRelationshipsOfPerson } from '../../src/api/relationships';
import { createSource, createCitation, getCitationsForPerson } from '../../src/api/sources';
import { createGroup, addGroupMember, getGroupsForPerson } from '../../src/api/groups';
import { createResearchTask, getResearchTasksForPerson } from '../../src/api/research_tasks';

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
    addGroupMember(db, group.id, source.id);

    // Research task
    createResearchTask(db, { task: 'Find birth record', person_id: source.id });

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
});
