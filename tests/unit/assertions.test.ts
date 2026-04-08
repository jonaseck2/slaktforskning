import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import {
  createAssertion,
  getAssertion,
  getAssertionsForSubject,
  getAssertionsForAttribute,
  getAssertionsForCitation,
  updateAssertion,
  deleteAssertion,
  getConflicts,
  getConflictsForPerson,
} from '../../src/api/assertions';
import { createSource, createCitation } from '../../src/api/sources';
import { createEvent } from '../../src/api/events';
import { createPerson } from '../../src/api/persons';
import { addEventParticipant } from '../../src/api/relationships';
import { deleteCitation } from '../../src/api/sources';

let db: Database;
beforeEach(() => { db = createTestDb(); });

function makeSourceAndCitation() {
  const source = createSource(db, { title: 'Test Source', source_type: 'other' });
  const citation = createCitation(db, { source_id: source.id });
  return { source, citation };
}

describe('assertions CRUD', () => {
  it('creates and retrieves an assertion', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, { sex: 'M' });

    const a = createAssertion(db, {
      citation_id: citation.id,
      subject_type: 'person',
      subject_id: person.id,
      attribute: 'birth_date',
      value: '1838-03-15',
      value_original: '15 Mars 1838',
      confidence: 3,
      is_accepted: true,
      evidence_type: 'direct',
      notes: 'Primary source',
    });

    expect(a.id).toBeTruthy();
    expect(a.citation_id).toBe(citation.id);
    expect(a.subject_type).toBe('person');
    expect(a.subject_id).toBe(person.id);
    expect(a.attribute).toBe('birth_date');
    expect(a.value).toBe('1838-03-15');
    expect(a.value_original).toBe('15 Mars 1838');
    expect(a.confidence).toBe(3);
    expect(a.is_accepted).toBe(true);
    expect(a.evidence_type).toBe('direct');
    expect(a.notes).toBe('Primary source');

    const fetched = getAssertion(db, a.id);
    expect(fetched).toEqual(a);
  });

  it('creates assertion with defaults', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, {});

    const a = createAssertion(db, {
      citation_id: citation.id,
      subject_type: 'person',
      subject_id: person.id,
      attribute: 'name',
    });

    expect(a.value).toBe('');
    expect(a.value_original).toBe('');
    expect(a.confidence).toBe(0);
    expect(a.is_accepted).toBe(false);
    expect(a.evidence_type).toBeNull();
    expect(a.notes).toBe('');
  });

  it('returns null for non-existent assertion', () => {
    expect(getAssertion(db, 'nonexistent')).toBeNull();
  });

  it('updates an assertion', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, {});

    const a = createAssertion(db, {
      citation_id: citation.id,
      subject_type: 'person',
      subject_id: person.id,
      attribute: 'birth_date',
      value: '1838',
    });

    const updated = updateAssertion(db, a.id, {
      value: '1838-03-15',
      is_accepted: true,
      evidence_type: 'indirect',
      notes: 'Census implies this date',
    });

    expect(updated!.value).toBe('1838-03-15');
    expect(updated!.is_accepted).toBe(true);
    expect(updated!.evidence_type).toBe('indirect');
    expect(updated!.notes).toBe('Census implies this date');
  });

  it('update with empty object returns unchanged', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, {});
    const a = createAssertion(db, {
      citation_id: citation.id,
      subject_type: 'person',
      subject_id: person.id,
      attribute: 'name',
      value: 'Erik',
    });

    const result = updateAssertion(db, a.id, {});
    expect(result!.value).toBe('Erik');
  });

  it('deletes an assertion', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, {});
    const a = createAssertion(db, {
      citation_id: citation.id,
      subject_type: 'person',
      subject_id: person.id,
      attribute: 'name',
    });

    expect(deleteAssertion(db, a.id)).toBe(true);
    expect(getAssertion(db, a.id)).toBeNull();
    expect(deleteAssertion(db, a.id)).toBe(false);
  });

  it('cascade deletes when citation is deleted', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, {});
    const a = createAssertion(db, {
      citation_id: citation.id,
      subject_type: 'person',
      subject_id: person.id,
      attribute: 'name',
      value: 'Erik',
    });

    deleteCitation(db, citation.id);
    expect(getAssertion(db, a.id)).toBeNull();
  });
});

describe('assertions query functions', () => {
  it('getAssertionsForSubject returns all assertions for an entity', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, {});

    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1838' });
    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'name', value: 'Erik' });

    const assertions = getAssertionsForSubject(db, 'person', person.id);
    expect(assertions).toHaveLength(2);
    expect(assertions.map(a => a.attribute).sort()).toEqual(['birth_date', 'name']);
  });

  it('getAssertionsForAttribute returns assertions for specific attribute', () => {
    const { citation } = makeSourceAndCitation();
    const s2 = createSource(db, { title: 'Source 2' });
    const c2 = createCitation(db, { source_id: s2.id });
    const person = createPerson(db, {});

    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1838' });
    createAssertion(db, { citation_id: c2.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1839' });
    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'name', value: 'Erik' });

    const birthAssertions = getAssertionsForAttribute(db, 'person', person.id, 'birth_date');
    expect(birthAssertions).toHaveLength(2);
    expect(birthAssertions.map(a => a.value)).toEqual(['1838', '1839']);
  });

  it('getAssertionsForCitation returns assertions from a citation', () => {
    const { citation } = makeSourceAndCitation();
    const person = createPerson(db, {});

    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1838' });
    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'name', value: 'Erik' });

    const assertions = getAssertionsForCitation(db, citation.id);
    expect(assertions).toHaveLength(2);
  });
});

describe('conflict detection', () => {
  it('detects conflicts when same attribute has different values', () => {
    const { citation } = makeSourceAndCitation();
    const s2 = createSource(db, { title: 'Source 2' });
    const c2 = createCitation(db, { source_id: s2.id });
    const person = createPerson(db, {});

    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1838' });
    createAssertion(db, { citation_id: c2.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1839' });

    const conflicts = getConflicts(db);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].attribute).toBe('birth_date');
    expect(conflicts[0].assertions).toHaveLength(2);
  });

  it('no conflict when values are the same', () => {
    const { citation } = makeSourceAndCitation();
    const s2 = createSource(db, { title: 'Source 2' });
    const c2 = createCitation(db, { source_id: s2.id });
    const person = createPerson(db, {});

    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1838' });
    createAssertion(db, { citation_id: c2.id, subject_type: 'person', subject_id: person.id, attribute: 'birth_date', value: '1838' });

    expect(getConflicts(db)).toHaveLength(0);
  });

  it('getConflictsForPerson includes person and event conflicts', () => {
    const { citation } = makeSourceAndCitation();
    const s2 = createSource(db, { title: 'Source 2' });
    const c2 = createCitation(db, { source_id: s2.id });
    const person = createPerson(db, {});
    const event = createEvent(db, { event_type: 'birth', date_type: 'exact' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    // Person-level conflict
    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person.id, attribute: 'sex', value: 'M' });
    createAssertion(db, { citation_id: c2.id, subject_type: 'person', subject_id: person.id, attribute: 'sex', value: 'F' });

    // Event-level conflict
    createAssertion(db, { citation_id: citation.id, subject_type: 'event', subject_id: event.id, attribute: 'date_value', value: '1838-03-15' });
    createAssertion(db, { citation_id: c2.id, subject_type: 'event', subject_id: event.id, attribute: 'date_value', value: '1839-01-01' });

    const conflicts = getConflictsForPerson(db, person.id);
    expect(conflicts).toHaveLength(2);
  });

  it('getConflictsForPerson excludes unrelated persons', () => {
    const { citation } = makeSourceAndCitation();
    const s2 = createSource(db, { title: 'Source 2' });
    const c2 = createCitation(db, { source_id: s2.id });
    const person1 = createPerson(db, {});
    const person2 = createPerson(db, {});

    createAssertion(db, { citation_id: citation.id, subject_type: 'person', subject_id: person2.id, attribute: 'name', value: 'A' });
    createAssertion(db, { citation_id: c2.id, subject_type: 'person', subject_id: person2.id, attribute: 'name', value: 'B' });

    expect(getConflictsForPerson(db, person1.id)).toHaveLength(0);
  });
});
