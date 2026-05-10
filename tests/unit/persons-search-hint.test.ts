import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createEvent } from '../../src/api/events';
import { createPerson, searchPersons } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

describe('searchPersons hint enrichment', async () => {
  let db: Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('returns null relation_role when relateeId is null', async () => {
    await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const results = await searchPersons(db, 'Per', null);
    expect(results).toHaveLength(1);
    expect(results[0].relation_role).toBeNull();
  });

  it('returns null relation_role when relateeId is omitted', async () => {
    await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const results = await searchPersons(db, 'Per');
    expect(results[0].relation_role).toBeNull();
  });

  it('labels a parent (candidate is person1 in parent_child with relatee as person2)', async () => {
    const parent = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });
    const results = await searchPersons(db, 'Per', child.id);
    expect(results[0].relation_role).toBe('parent');
  });

  it('labels a child (candidate is person2 in parent_child with relatee as person1)', async () => {
    const parent = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });
    const results = await searchPersons(db, 'Anna', parent.id);
    expect(results[0].relation_role).toBe('child');
  });

  it('labels a partner regardless of person1/person2 order', async () => {
    const a = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'Andersson' });
    await createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id });
    expect((await searchPersons(db, 'Per', b.id))[0].relation_role).toBe('partner');
    expect((await searchPersons(db, 'Anna', a.id))[0].relation_role).toBe('partner');
  });

  it('labels siblings bidirectionally', async () => {
    const a = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    await createRelationship(db, { type: 'sibling', person1_id: a.id, person2_id: b.id });
    expect((await searchPersons(db, 'Per', b.id))[0].relation_role).toBe('sibling');
    expect((await searchPersons(db, 'Anna', a.id))[0].relation_role).toBe('sibling');
  });

  it('labels godparent', async () => {
    const gp = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    await createRelationship(db, { type: 'godparent', person1_id: gp.id, person2_id: child.id });
    expect((await searchPersons(db, 'Per', child.id))[0].relation_role).toBe('godparent');
  });

  it('returns null relation_role for "other" relationship type', async () => {
    const a = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const b = await createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    await createRelationship(db, { type: 'other', person1_id: a.id, person2_id: b.id });
    expect((await searchPersons(db, 'Per', b.id))[0].relation_role).toBeNull();
  });

  it('extracts birth_year and death_year from primary-participant events', async () => {
    const p = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1919-05-12' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const death = await createEvent(db, { event_type: 'death', date_value: '1985-11-02' });
    await addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });
    const results = await searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBe('1919');
    expect(results[0].death_year).toBe('1985');
  });

  it('returns null year fields when no events exist', async () => {
    await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const results = await searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBeNull();
    expect(results[0].death_year).toBeNull();
  });

  it('returns only birth_year when death event is missing', async () => {
    const p = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1919-05-12' });
    await addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });
    const results = await searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBe('1919');
    expect(results[0].death_year).toBeNull();
  });

  it('ignores events where participant role is not primary', async () => {
    const p = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const event = await createEvent(db, { event_type: 'birth', date_value: '1919-05-12' });
    await addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'witness' });
    const results = await searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBeNull();
  });

  it('handles date_value of just YYYY', async () => {
    const p = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const event = await createEvent(db, { event_type: 'birth', date_value: '1919' });
    await addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const results = await searchPersons(db, 'Per', null);
    expect(results[0].birth_year).toBe('1919');
  });

  it('returns both dates and role together', async () => {
    const parent = await createPerson(db, { given_name: 'Per', surname: 'Persson' });
    const child = await createPerson(db, { given_name: 'Anna', surname: 'Persson' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });
    const birth = await createEvent(db, { event_type: 'birth', date_value: '1919-01-01' });
    await addEventParticipant(db, { event_id: birth.id, person_id: parent.id, role: 'primary' });
    const results = await searchPersons(db, 'Per', child.id);
    expect(results[0].relation_role).toBe('parent');
    expect(results[0].birth_year).toBe('1919');
  });
});
