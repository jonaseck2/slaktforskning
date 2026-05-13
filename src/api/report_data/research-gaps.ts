import type { Database } from 'node-sqlite3-wasm';
import { getPerson, getPersonNames } from '../persons';
import { getRelationshipsOfPerson } from '../relationships';
import { getEventsForPerson } from '../events';
import { getCitationsForEvent } from '../sources';
import type { PersonName } from '../types';
import type { EventWithPlace } from './types';
import { resolveEventsPlaces } from './shared';

export interface ResearchGaps {
  person_id: string;
  person_names: PersonName[];
  missing_birth: boolean;
  missing_death: boolean;
  missing_parents: boolean;
  unsourced_events: EventWithPlace[];
  events_without_places: EventWithPlace[];
}

/**
 * Analyzes a person's data for research gaps: missing birth, death, parents,
 * unsourced events, and events without places.
 */
export async function getResearchGaps(db: Database, personId: string): Promise<ResearchGaps | null> {
  const person = await getPerson(db, personId);
  if (!person) return null;

  const names = await getPersonNames(db, personId);
  const rawEvents = await getEventsForPerson(db, personId);
  const events = await resolveEventsPlaces(db, rawEvents);

  const hasBirth = events.some(e => e.event_type === 'birth');
  const hasDeath = events.some(e => e.event_type === 'death');

  // Check for parents
  const rels = await getRelationshipsOfPerson(db, personId);
  const isChild = rels.some(r => r.type === 'parent_child' && r.person2_id === personId);

  // Find unsourced events (no citations)
  const unsourced: EventWithPlace[] = [];
  for (const event of events) {
    const citations = await getCitationsForEvent(db, event.id);
    if (citations.length === 0) {
      unsourced.push(event);
    }
  }

  // Events without places
  const noPlace = events.filter(e => !e.place_id);

  return {
    person_id: personId,
    person_names: names,
    missing_birth: !hasBirth,
    missing_death: !hasDeath && !person.living,
    missing_parents: !isChild,
    unsourced_events: unsourced,
    events_without_places: noPlace,
  };
}
