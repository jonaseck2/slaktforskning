// Person-to-person association CRUD tests (T05 — GEDCOM alignment plan).
//
// User goal (verbatim): person-to-person associations without an event
// (godparent-in-general, friend, colleague, neighbor, enemy, other) are
// first-class entities. CRUD + reverse-direction lookup mirror the
// relationships pattern.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import {
  createPersonAssociation,
  getPersonAssociation,
  getAssociationsForPerson,
  getAssociationsToPerson,
  updatePersonAssociation,
  deletePersonAssociation,
} from '../../src/api/person_associations';
import { createPerson, deletePerson } from '../../src/api/persons';
import type { PersonAssociationRole } from '../../src/api/types';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const ALL_ROLES: PersonAssociationRole[] = [
  'godparent',
  'friend',
  'colleague',
  'enemy',
  'neighbor',
  'other',
];

describe('person_associations api (T05)', () => {
  it('creates an association with all 6 role values', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'Alice' });
    const others = await Promise.all(
      ALL_ROLES.map(() => createPerson(db, { sex: 'F', given_name: 'Other' })),
    );
    for (let i = 0; i < ALL_ROLES.length; i++) {
      const role = ALL_ROLES[i];
      const assoc = await createPersonAssociation(db, {
        person_id: p1.id,
        related_person_id: others[i].id,
        role,
        notes: `notes-${role}`,
      });
      expect(assoc.id).toBeDefined();
      expect(assoc.role).toBe(role);
      expect(assoc.notes).toBe(`notes-${role}`);
    }
    const all = await getAssociationsForPerson(db, p1.id);
    expect(all).toHaveLength(ALL_ROLES.length);
  });

  it('getPersonAssociation returns the row by id', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    const created = await createPersonAssociation(db, {
      person_id: p1.id,
      related_person_id: p2.id,
      role: 'friend',
      notes: 'long-time friend',
    });
    const fetched = await getPersonAssociation(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.role).toBe('friend');
    expect(fetched?.notes).toBe('long-time friend');
    expect(fetched?.person_id).toBe(p1.id);
    expect(fetched?.related_person_id).toBe(p2.id);
  });

  it('getAssociationsForPerson returns outgoing associations', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    const p3 = await createPerson(db, { sex: 'M', given_name: 'C' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'friend' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p3.id, role: 'colleague' });
    await createPersonAssociation(db, { person_id: p2.id, related_person_id: p3.id, role: 'enemy' });
    const fromP1 = await getAssociationsForPerson(db, p1.id);
    expect(fromP1).toHaveLength(2);
    const roles = new Set(fromP1.map(a => a.role));
    expect(roles).toEqual(new Set(['friend', 'colleague']));
  });

  it('getAssociationsToPerson returns incoming (reverse) associations', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    const p3 = await createPerson(db, { sex: 'M', given_name: 'C' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'godparent' });
    await createPersonAssociation(db, { person_id: p3.id, related_person_id: p2.id, role: 'neighbor' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p3.id, role: 'friend' });
    const toP2 = await getAssociationsToPerson(db, p2.id);
    expect(toP2).toHaveLength(2);
    const roles = new Set(toP2.map(a => a.role));
    expect(roles).toEqual(new Set(['godparent', 'neighbor']));
  });

  it('updatePersonAssociation changes role and notes', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    const assoc = await createPersonAssociation(db, {
      person_id: p1.id, related_person_id: p2.id, role: 'friend', notes: 'old',
    });
    await updatePersonAssociation(db, assoc.id, { role: 'colleague', notes: 'updated' });
    const fresh = await getPersonAssociation(db, assoc.id);
    expect(fresh?.role).toBe('colleague');
    expect(fresh?.notes).toBe('updated');
  });

  it('deletePersonAssociation removes the row', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    const assoc = await createPersonAssociation(db, {
      person_id: p1.id, related_person_id: p2.id, role: 'friend',
    });
    const ok = await deletePersonAssociation(db, assoc.id);
    expect(ok).toBe(true);
    const gone = await getPersonAssociation(db, assoc.id);
    expect(gone).toBeNull();
  });

  it('UNIQUE (person_id, related_person_id, role) blocks duplicates', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'friend' });
    await expect(
      createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'friend' }),
    ).rejects.toThrow();
    // Different role is allowed — the UNIQUE is on the triple.
    const other = await createPersonAssociation(db, {
      person_id: p1.id, related_person_id: p2.id, role: 'colleague',
    });
    expect(other.id).toBeDefined();
  });

  it('CASCADE: deleting person_id removes associations', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'friend' });
    await deletePerson(db, p1.id);
    const fromP1 = await getAssociationsForPerson(db, p1.id);
    expect(fromP1).toHaveLength(0);
    const toP2 = await getAssociationsToPerson(db, p2.id);
    expect(toP2).toHaveLength(0);
  });

  it('CASCADE: deleting related_person_id removes associations', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'godparent' });
    await deletePerson(db, p2.id);
    const fromP1 = await getAssociationsForPerson(db, p1.id);
    expect(fromP1).toHaveLength(0);
  });
});
