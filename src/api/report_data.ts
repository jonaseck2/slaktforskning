import type { Database } from 'node-sqlite3-wasm';
import { getPerson, getPersonNames } from './persons';
import { getRelationshipsOfPerson } from './relationships';
import { getEventsForPerson, getEventsForRelationship } from './events';
import { getPlace, getPlacePath } from './places';
import { getCitationsForPerson, getCitationsForEvent, getSource } from './sources';
import { getGroupsForPerson } from './groups';
import { getResearchTasksForPerson } from './research_tasks';
import { getEventParticipants } from './relationships';
import { queryAll } from './db';
import type { Person, PersonName, GenealogyEvent, Relationship, Citation, Group, ResearchTask } from './types';

// ── Return types ──

export interface EventWithPlace extends GenealogyEvent {
  place_name: string | null;
  place_path: string | null;
}

export interface CitationWithSource extends Citation {
  source_title: string | null;
  source_author: string | null;
}

export interface RelationshipSummary extends Relationship {
  other_person_id: string | null;
  other_person_names: PersonName[];
  other_person_sex: string | null;
}

export interface PersonSummary {
  person: Person;
  names: PersonName[];
  events: EventWithPlace[];
  relationships: RelationshipSummary[];
  citations: CitationWithSource[];
  groups: Group[];
  research_tasks: ResearchTask[];
}

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

export interface AncestorNode {
  person: Person;
  names: PersonName[];
  birth_event: EventWithPlace | null;
  death_event: EventWithPlace | null;
  marriage_event: EventWithPlace | null;
  father: AncestorNode | null;
  mother: AncestorNode | null;
}

export interface PlaceEventRecord {
  event: EventWithPlace;
  participants: Array<{
    person_id: string;
    given_name: string;
    surname: string;
    role: string;
  }>;
}

export interface PlaceHistory {
  place_id: string;
  place_name: string;
  place_path: string;
  events: PlaceEventRecord[];
}

export interface ResearchGaps {
  person_id: string;
  person_names: PersonName[];
  missing_birth: boolean;
  missing_death: boolean;
  missing_parents: boolean;
  unsourced_events: EventWithPlace[];
  events_without_places: EventWithPlace[];
}

export interface TimelineEntry {
  event: EventWithPlace;
  person_id: string;
  person_given_name: string;
  person_surname: string;
  relationship_label: string | null;
}

// ── Helpers ──

function resolveEventPlace(db: Database, event: GenealogyEvent): EventWithPlace {
  let place_name: string | null = null;
  let place_path: string | null = null;
  if (event.place_id) {
    const place = getPlace(db, event.place_id);
    place_name = place?.name ?? null;
    place_path = getPlacePath(db, event.place_id);
  }
  return { ...event, place_name, place_path };
}

function resolveEventsPlaces(db: Database, events: GenealogyEvent[]): EventWithPlace[] {
  return events.map(e => resolveEventPlace(db, e));
}

function resolveCitationSource(db: Database, citation: Citation): CitationWithSource {
  const source = getSource(db, citation.source_id);
  return {
    ...citation,
    source_title: source?.title ?? null,
    source_author: source?.author ?? null,
  };
}

function getPrimaryName(names: PersonName[]): { given_name: string; surname: string } {
  if (names.length === 0) return { given_name: '', surname: '' };
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return { given_name: sorted[0].given_name ?? '', surname: sorted[0].surname ?? '' };
}

function findEventByType(events: EventWithPlace[], type: string): EventWithPlace | null {
  return events.find(e => e.event_type === type) ?? null;
}

function buildFamilyMember(db: Database, personId: string): FamilyMember | null {
  const person = getPerson(db, personId);
  if (!person) return null;
  const names = getPersonNames(db, personId);
  const personEvents = resolveEventsPlaces(db, getEventsForPerson(db, personId));
  return {
    person,
    names,
    birth_event: findEventByType(personEvents, 'birth'),
    death_event: findEventByType(personEvents, 'death'),
  };
}

// ── Public API ──

/**
 * Returns everything about a person in one call: names, events (with places),
 * relationships (with other person names), citations (with source titles),
 * groups, and research tasks.
 */
export function getPersonSummary(db: Database, personId: string): PersonSummary | null {
  const person = getPerson(db, personId);
  if (!person) return null;

  const names = getPersonNames(db, personId);
  const rawEvents = getEventsForPerson(db, personId);
  const events = resolveEventsPlaces(db, rawEvents);

  const rawRelationships = getRelationshipsOfPerson(db, personId);
  const relationships: RelationshipSummary[] = rawRelationships.map(r => {
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    let otherNames: PersonName[] = [];
    let otherSex: string | null = null;
    if (otherId) {
      otherNames = getPersonNames(db, otherId);
      const otherPerson = getPerson(db, otherId);
      otherSex = otherPerson?.sex ?? null;
    }
    return {
      ...r,
      other_person_id: otherId ?? null,
      other_person_names: otherNames,
      other_person_sex: otherSex,
    };
  });

  const rawCitations = getCitationsForPerson(db, personId);
  // Also collect citations on the person's events
  const eventCitationIds = new Set(rawCitations.map(c => c.id));
  for (const event of rawEvents) {
    const eventCitations = getCitationsForEvent(db, event.id);
    for (const c of eventCitations) {
      if (!eventCitationIds.has(c.id)) {
        rawCitations.push(c);
        eventCitationIds.add(c.id);
      }
    }
  }
  const citations = rawCitations.map(c => resolveCitationSource(db, c));

  const groups = getGroupsForPerson(db, personId);
  const research_tasks = getResearchTasksForPerson(db, personId);

  return { person, names, events, relationships, citations, groups, research_tasks };
}

/**
 * Returns a couple relationship with both persons' key events plus all children.
 * Children are found via parent_child relationships where either person1 or person2
 * of the couple is a parent.
 */
export function getFamilyUnit(db: Database, relationshipId: string): FamilyUnit | null {
  const relationship = queryAll<Relationship>(db,
    'SELECT * FROM relationships WHERE id = ?', [relationshipId]
  )[0] ?? null;
  if (!relationship) return null;

  const person1 = relationship.person1_id ? buildFamilyMember(db, relationship.person1_id) : null;
  const person2 = relationship.person2_id ? buildFamilyMember(db, relationship.person2_id) : null;

  const relEvents = getEventsForRelationship(db, relationshipId);
  const relationship_events = resolveEventsPlaces(db, relEvents);

  // Find children: parent_child relationships where one parent is person1 or person2
  const childIds = new Set<string>();
  const parentIds = [relationship.person1_id, relationship.person2_id].filter(Boolean) as string[];
  for (const parentId of parentIds) {
    const parentRels = queryAll<Relationship>(db,
      `SELECT * FROM relationships WHERE type = 'parent_child' AND (person1_id = ? OR person2_id = ?)`,
      [parentId, parentId]
    );
    for (const pr of parentRels) {
      // In parent_child, person1 = parent, person2 = child (convention)
      // But we need to check both sides since the convention isn't enforced
      const childId = pr.person1_id === parentId ? pr.person2_id : pr.person1_id;
      if (childId && !parentIds.includes(childId)) {
        childIds.add(childId);
      }
    }
  }

  const children: FamilyMember[] = [];
  for (const childId of childIds) {
    const member = buildFamilyMember(db, childId);
    if (member) children.push(member);
  }

  return { relationship, person1, person2, relationship_events, children };
}

/**
 * Returns a nested ancestor tree up to N generations.
 * Each node has person, names, birth/death/marriage events, and father/mother subtrees.
 */
export function getAncestorTree(db: Database, personId: string, generations: number = 4): AncestorNode | null {
  const person = getPerson(db, personId);
  if (!person) return null;

  const names = getPersonNames(db, personId);
  const personEvents = resolveEventsPlaces(db, getEventsForPerson(db, personId));

  // Find marriage event from couple relationships
  let marriage_event: EventWithPlace | null = null;
  const rels = getRelationshipsOfPerson(db, personId);
  for (const r of rels) {
    if (r.type === 'couple') {
      const relEvents = resolveEventsPlaces(db, getEventsForRelationship(db, r.id));
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
    // person2 = child in parent_child convention, but check both sides
    const parentId = r.person1_id === personId ? r.person2_id :
                     r.person2_id === personId ? r.person1_id : null;
    if (!parentId) continue;

    const parentPerson = getPerson(db, parentId);
    if (!parentPerson) continue;

    if (parentPerson.sex === 'M' && !node.father) {
      node.father = getAncestorTree(db, parentId, generations - 1);
    } else if (parentPerson.sex === 'F' && !node.mother) {
      node.mother = getAncestorTree(db, parentId, generations - 1);
    } else if (!node.father) {
      // Unknown sex — fill first available slot
      node.father = getAncestorTree(db, parentId, generations - 1);
    } else if (!node.mother) {
      node.mother = getAncestorTree(db, parentId, generations - 1);
    }
  }

  return node;
}

/**
 * Returns all events at a place, chronologically, with participant names and roles.
 */
export function getPlaceHistory(db: Database, placeId: string): PlaceHistory | null {
  const place = getPlace(db, placeId);
  if (!place) return null;

  const rawEvents = queryAll<GenealogyEvent>(db,
    `SELECT * FROM events WHERE place_id = ? ORDER BY date_value ASC`,
    [placeId]
  );

  const events: PlaceEventRecord[] = rawEvents.map(event => {
    const eventWithPlace = resolveEventPlace(db, event);
    const rawParticipants = getEventParticipants(db, event.id);
    const participants = rawParticipants.map(ep => {
      const names = getPersonNames(db, ep.person_id);
      const primary = getPrimaryName(names);
      return {
        person_id: ep.person_id,
        given_name: primary.given_name,
        surname: primary.surname,
        role: ep.role,
      };
    });
    return { event: eventWithPlace, participants };
  });

  return {
    place_id: placeId,
    place_name: place.name,
    place_path: getPlacePath(db, placeId),
    events,
  };
}

/**
 * Analyzes a person's data for research gaps: missing birth, death, parents,
 * unsourced events, and events without places.
 */
export function getResearchGaps(db: Database, personId: string): ResearchGaps | null {
  const person = getPerson(db, personId);
  if (!person) return null;

  const names = getPersonNames(db, personId);
  const rawEvents = getEventsForPerson(db, personId);
  const events = resolveEventsPlaces(db, rawEvents);

  const hasBirth = events.some(e => e.event_type === 'birth');
  const hasDeath = events.some(e => e.event_type === 'death');

  // Check for parents
  const rels = getRelationshipsOfPerson(db, personId);
  const isChild = rels.some(r => r.type === 'parent_child' && r.person2_id === personId);

  // Find unsourced events (no citations)
  const unsourced: EventWithPlace[] = [];
  for (const event of events) {
    const citations = getCitationsForEvent(db, event.id);
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

/**
 * Returns a merged chronological timeline of a person's events plus family events
 * (spouse's birth/death, children's births/deaths).
 */
export function getTimeline(db: Database, personId: string): TimelineEntry[] | null {
  const person = getPerson(db, personId);
  if (!person) return null;

  const names = getPersonNames(db, personId);
  const primaryName = getPrimaryName(names);

  const entries: TimelineEntry[] = [];

  // Person's own events
  const ownEvents = resolveEventsPlaces(db, getEventsForPerson(db, personId));
  for (const event of ownEvents) {
    entries.push({
      event,
      person_id: personId,
      person_given_name: primaryName.given_name,
      person_surname: primaryName.surname,
      relationship_label: null,
    });
  }

  // Family events
  const rels = getRelationshipsOfPerson(db, personId);
  for (const r of rels) {
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    if (!otherId) continue;

    const otherNames = getPersonNames(db, otherId);
    const otherPrimary = getPrimaryName(otherNames);

    let label: string;
    if (r.type === 'couple') {
      label = 'spouse';
    } else if (r.type === 'parent_child') {
      label = r.person1_id === personId ? 'child' : 'parent';
    } else if (r.type === 'sibling') {
      label = 'sibling';
    } else {
      label = r.type;
    }

    const otherEvents = resolveEventsPlaces(db, getEventsForPerson(db, otherId));
    // Only include key life events for family members
    const relevantTypes = ['birth', 'death', 'baptism', 'burial'];
    for (const event of otherEvents) {
      if (relevantTypes.includes(event.event_type)) {
        entries.push({
          event,
          person_id: otherId,
          person_given_name: otherPrimary.given_name,
          person_surname: otherPrimary.surname,
          relationship_label: label,
        });
      }
    }
  }

  // Sort chronologically by date_value
  entries.sort((a, b) => {
    const aDate = a.event.date_value ?? '';
    const bDate = b.event.date_value ?? '';
    if (aDate < bDate) return -1;
    if (aDate > bDate) return 1;
    return 0;
  });

  return entries;
}
