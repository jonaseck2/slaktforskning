import type { Database } from 'node-sqlite3-wasm';
import { getPerson, getPersonNames } from '../persons';
import { getEventsForPerson, getEventsForRelationship } from '../events';
import { queryAll } from '../db';
import type { Person, PersonName, Relationship } from '../types';
import type { EventWithPlace } from './types';
import { resolveEventsPlaces, findEventByType } from './shared';

export interface FamilyMember {
  person: Person;
  names: PersonName[];
  birth_event: EventWithPlace | null;
  death_event: EventWithPlace | null;
}

export interface FamilyUnit {
  relationship: Relationship;
  person1: FamilyMember | null;
  person2: FamilyMember | null;
  relationship_events: EventWithPlace[];
  children: FamilyMember[];
}

async function buildFamilyMember(db: Database, personId: string): Promise<FamilyMember | null> {
  const person = await getPerson(db, personId);
  if (!person) return null;
  const names = await getPersonNames(db, personId);
  const personEvents = await resolveEventsPlaces(db, await getEventsForPerson(db, personId));
  return {
    person,
    names,
    birth_event: findEventByType(personEvents, 'birth'),
    death_event: findEventByType(personEvents, 'death'),
  };
}

/**
 * Returns a couple relationship with both persons' key events plus all children.
 * Children are found via parent_child relationships where either person1 or person2
 * of the couple is a parent.
 */
export async function getFamilyUnit(db: Database, relationshipId: string): Promise<FamilyUnit | null> {
  const relationship = (await queryAll<Relationship>(db,
    'SELECT * FROM relationships WHERE id = ?', [relationshipId]
  ))[0] ?? null;
  if (!relationship) return null;

  const person1 = relationship.person1_id ? await buildFamilyMember(db, relationship.person1_id) : null;
  const person2 = relationship.person2_id ? await buildFamilyMember(db, relationship.person2_id) : null;

  const relEvents = await getEventsForRelationship(db, relationshipId);
  const relationship_events = await resolveEventsPlaces(db, relEvents);

  // Find children shared by both parents (person1_id = parent, person2_id = child convention).
  // We intersect each parent's children so only children common to the couple are included.
  const childIds = new Set<string>();
  const parentIds = [relationship.person1_id, relationship.person2_id].filter(Boolean) as string[];

  async function childrenOfParent(parentId: string): Promise<Set<string>> {
    const rows = await queryAll<{ child_id: string }>(db,
      `SELECT person2_id AS child_id FROM relationships
       WHERE type = 'parent_child' AND person1_id = ? AND person2_id IS NOT NULL`,
      [parentId]
    );
    return new Set(rows.map(r => r.child_id));
  }

  if (parentIds.length === 1) {
    (await childrenOfParent(parentIds[0])).forEach(id => childIds.add(id));
  } else if (parentIds.length === 2) {
    const c1 = await childrenOfParent(parentIds[0]);
    const c2 = await childrenOfParent(parentIds[1]);
    for (const id of c1) {
      if (c2.has(id)) childIds.add(id);
    }
  }

  const children: FamilyMember[] = [];
  for (const childId of childIds) {
    const member = await buildFamilyMember(db, childId);
    if (member) children.push(member);
  }

  return { relationship, person1, person2, relationship_events, children };
}
