import type { Database } from 'node-sqlite3-wasm';
import { getPerson, getPersonNames } from '../persons';
import { getRelationshipsOfPerson } from '../relationships';
import { getEventsForPerson, getEventsForRelationship } from '../events';
import { getPlace, getPlacePath } from '../places';
import type { Person, PersonName, GenealogyEvent } from '../types';
import type { EventWithPlace } from './types';

export interface AncestorNode {
  person: Person;
  names: PersonName[];
  birth_event: EventWithPlace | null;
  death_event: EventWithPlace | null;
  marriage_event: EventWithPlace | null;
  father: AncestorNode | null;
  mother: AncestorNode | null;
}

// ── Local helpers ──
// Duplicated from `report_data.ts` during the split; Task 11 of the plan will
// extract genuinely-shared scaffolding to `shared.ts` if ≥2 reports use it
// with identical shape.

async function resolveEventPlace(db: Database, event: GenealogyEvent): Promise<EventWithPlace> {
  let place_name: string | null = null;
  let place_path: string | null = null;
  if (event.place_id) {
    const place = await getPlace(db, event.place_id);
    place_name = place?.name ?? null;
    place_path = await getPlacePath(db, event.place_id);
  }
  return { ...event, place_name, place_path };
}

async function resolveEventsPlaces(db: Database, events: GenealogyEvent[]): Promise<EventWithPlace[]> {
  const out: EventWithPlace[] = [];
  for (const e of events) out.push(await resolveEventPlace(db, e));
  return out;
}

function findEventByType(events: EventWithPlace[], type: string): EventWithPlace | null {
  return events.find(e => e.event_type === type) ?? null;
}

/**
 * Returns a nested ancestor tree up to N generations.
 * Each node has person, names, birth/death/marriage events, and father/mother subtrees.
 */
export async function getAncestorTree(db: Database, personId: string, generations: number = 4): Promise<AncestorNode | null> {
  const person = await getPerson(db, personId);
  if (!person) return null;

  const names = await getPersonNames(db, personId);
  const personEvents = await resolveEventsPlaces(db, await getEventsForPerson(db, personId));

  // Find marriage event from couple relationships
  let marriage_event: EventWithPlace | null = null;
  const rels = await getRelationshipsOfPerson(db, personId);
  for (const r of rels) {
    if (r.type === 'couple') {
      const relEvents = await resolveEventsPlaces(db, await getEventsForRelationship(db, r.id));
      marriage_event = findEventByType(relEvents, 'marriage');
      if (marriage_event) break;
    }
  }

  const node: AncestorNode = {
    person,
    names,
    birth_event: findEventByType(personEvents, 'birth'),
    death_event: findEventByType(personEvents, 'death'),
    marriage_event,
    father: null,
    mother: null,
  };

  if (generations <= 1) return node;

  // Find parents via parent_child relationships
  const parentChildRels = rels.filter(r => r.type === 'parent_child');
  for (const r of parentChildRels) {
    // person1_id = parent, person2_id = child convention: go up only when person is the child
    const parentId = r.person2_id === personId ? r.person1_id : null;
    if (!parentId) continue;

    const parentPerson = await getPerson(db, parentId);
    if (!parentPerson) continue;

    if (parentPerson.sex === 'M' && !node.father) {
      node.father = await getAncestorTree(db, parentId, generations - 1);
    } else if (parentPerson.sex === 'F' && !node.mother) {
      node.mother = await getAncestorTree(db, parentId, generations - 1);
    } else if (!node.father) {
      // Unknown sex — fill first available slot
      node.father = await getAncestorTree(db, parentId, generations - 1);
    } else if (!node.mother) {
      node.mother = await getAncestorTree(db, parentId, generations - 1);
    }
  }

  return node;
}
