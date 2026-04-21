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

  // Find children shared by both parents (person1_id = parent, person2_id = child convention).
  // We intersect each parent's children so only children common to the couple are included.
  const childIds = new Set<string>();
  const parentIds = [relationship.person1_id, relationship.person2_id].filter(Boolean) as string[];

  function childrenOfParent(parentId: string): Set<string> {
    const rows = queryAll<{ child_id: string }>(db,
      `SELECT person2_id AS child_id FROM relationships
       WHERE type = 'parent_child' AND person1_id = ? AND person2_id IS NOT NULL`,
      [parentId]
    );
    return new Set(rows.map(r => r.child_id));
  }

  if (parentIds.length === 1) {
    childrenOfParent(parentIds[0]).forEach(id => childIds.add(id));
  } else if (parentIds.length === 2) {
    const c1 = childrenOfParent(parentIds[0]);
    const c2 = childrenOfParent(parentIds[1]);
    for (const id of c1) {
      if (c2.has(id)) childIds.add(id);
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
    // person1_id = parent, person2_id = child convention: go up only when person is the child
    const parentId = r.person2_id === personId ? r.person1_id : null;
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

// ── getAliveInYear ──

export interface AliveInYearPerson {
  id: string;
  given_name: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthYear: number | null;
  deathYear: number | null;
  age: number | null;
  placeName: string | null;
}

export interface AliveInYearFamily {
  relationshipId: string;
  parents: AliveInYearPerson[];
  children: AliveInYearPerson[];
}

export interface AliveInYearResult {
  year: number;
  persons: AliveInYearPerson[];
  families: AliveInYearFamily[];
  unattached: AliveInYearPerson[];
}

const MAX_LIFESPAN = 110;

/**
 * Returns all persons who were likely alive in a given year, grouped by
 * family unit (couple relationships). Inclusion rules:
 *   - known birth + death bracketing year → include
 *   - birth only (before year) and not > MAX_LIFESPAN ago → include
 *   - death only (after year) and not > MAX_LIFESPAN in the future → include
 *   - no birth/death but has any event in the target year → include
 *   - otherwise → exclude
 * placeName is the name of the place from the most recent event at or before
 * the target year that has a place_id.
 */
export function getAliveInYear(db: Database, year: number): AliveInYearResult {
  const rows = queryAll<{
    id: string;
    sex: 'M' | 'F' | 'U';
    living: number;
    given_name: string | null;
    surname: string | null;
    birth_year: number | null;
    death_year: number | null;
    place_name: string | null;
    has_event_in_year: number;
  }>(db, `
    WITH birth AS (
      SELECT ep.person_id AS pid,
             CAST(substr(e.date_value, 1, 4) AS INTEGER) AS birth_year
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.event_type = 'birth' AND e.date_value IS NOT NULL
    ),
    death AS (
      SELECT ep.person_id AS pid,
             CAST(substr(e.date_value, 1, 4) AS INTEGER) AS death_year
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.event_type = 'death' AND e.date_value IS NOT NULL
    ),
    any_event AS (
      SELECT ep.person_id AS pid,
             CAST(substr(e.date_value, 1, 4) AS INTEGER) AS any_year
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.date_value IS NOT NULL
    )
    SELECT p.id, p.sex, p.living,
           pn.given_name, pn.surname,
           b.birth_year, d.death_year,
           (SELECT pl.name FROM events e2
            JOIN event_participants ep2 ON ep2.event_id = e2.id
            LEFT JOIN places pl ON pl.id = e2.place_id
            WHERE ep2.person_id = p.id
              AND e2.date_value IS NOT NULL
              AND CAST(substr(e2.date_value, 1, 4) AS INTEGER) <= ?
              AND pl.name IS NOT NULL
            ORDER BY e2.date_value DESC LIMIT 1) AS place_name,
           EXISTS(SELECT 1 FROM any_event a WHERE a.pid = p.id AND a.any_year = ?) AS has_event_in_year
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = (
      SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
    )
    LEFT JOIN birth b ON b.pid = p.id
    LEFT JOIN death d ON d.pid = p.id
  `, [year, year]);

  const alive: AliveInYearPerson[] = [];
  for (const r of rows) {
    const notBornYet = r.birth_year != null && r.birth_year > year;
    const diedAlready = r.death_year != null && r.death_year < year;
    const tooOldNoBirth = r.birth_year == null && r.death_year != null && (r.death_year - year) > MAX_LIFESPAN;
    const tooOldNoDeath = r.death_year == null && r.birth_year != null && (year - r.birth_year) > MAX_LIFESPAN;

    let include = false;
    if (notBornYet || diedAlready) include = false;
    else if (r.birth_year != null && r.death_year != null) include = true;
    else if (r.birth_year != null) include = !tooOldNoDeath;
    else if (r.death_year != null) include = !tooOldNoBirth;
    else include = !!r.has_event_in_year;

    if (include) {
      alive.push({
        id: r.id,
        sex: r.sex,
        living: !!r.living,
        given_name: r.given_name,
        surname: r.surname,
        birthYear: r.birth_year,
        deathYear: r.death_year,
        age: r.birth_year != null ? year - r.birth_year : null,
        placeName: r.place_name,
      });
    }
  }

  const coupleRows = queryAll<{ id: string; person1_id: string | null; person2_id: string | null }>(db,
    `SELECT id, person1_id, person2_id FROM relationships WHERE type = 'couple'`
  );

  const parentChildRows = queryAll<{ parent_id: string | null; child_id: string | null }>(db,
    `SELECT person1_id AS parent_id, person2_id AS child_id
     FROM relationships WHERE type = 'parent_child'`
  );

  const childrenByParent = new Map<string, string[]>();
  for (const r of parentChildRows) {
    if (!r.parent_id || !r.child_id) continue;
    if (!childrenByParent.has(r.parent_id)) childrenByParent.set(r.parent_id, []);
    childrenByParent.get(r.parent_id)!.push(r.child_id);
  }

  const personById = new Map(alive.map(p => [p.id, p]));
  const families: AliveInYearFamily[] = [];
  const groupedPersonIds = new Set<string>();

  for (const c of coupleRows) {
    // Only skip if BOTH sides are null — a half-couple (one known partner) is still valid
    if (!c.person1_id && !c.person2_id) continue;
    const p1 = c.person1_id ? personById.get(c.person1_id) : undefined;
    const p2 = c.person2_id ? personById.get(c.person2_id) : undefined;
    if (!p1 && !p2) continue;
    const parents: AliveInYearPerson[] = [];
    if (p1) { parents.push(p1); groupedPersonIds.add(p1.id); }
    if (p2) { parents.push(p2); groupedPersonIds.add(p2.id); }

    const childIds = new Set<string>();
    if (c.person1_id) (childrenByParent.get(c.person1_id) || []).forEach(x => childIds.add(x));
    if (c.person2_id) (childrenByParent.get(c.person2_id) || []).forEach(x => childIds.add(x));
    const children: AliveInYearPerson[] = [];
    for (const cid of childIds) {
      const child = personById.get(cid);
      if (child) { children.push(child); groupedPersonIds.add(child.id); }
    }

    families.push({ relationshipId: c.id, parents, children });
  }

  const unattached = alive.filter(p => !groupedPersonIds.has(p.id));

  return { year, persons: alive, families, unattached };
}
