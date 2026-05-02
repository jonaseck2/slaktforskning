import type { Database } from 'node-sqlite3-wasm';
import { getPerson, getPersonNames, displayedNameIdSql, birthSurnameSql } from './persons';
import { getRelationshipsOfPerson } from './relationships';
import { getEventsForPerson, getEventsForRelationship } from './events';
import { getPlace, getPlacePath } from './places';
import { getCitationsForPerson, getCitationsForEvent, getSource } from './sources';
import { getGroupsForPerson } from './groups';
import { getResearchTasksForPerson } from './research_tasks';
import { getEventParticipants } from './relationships';
import { queryAll } from './db';
import { livingSqlExpr } from './personLiving';
import type { Person, PersonName, GenealogyEvent, Relationship, Citation, Group, ResearchTask } from './types';

// ── Return types ──

export interface EventWithPlace extends GenealogyEvent {
  place_name: string | null;
  place_path: string | null;
}

export interface CitationWithSource extends Citation {
  source_title: string | null;
  source_author: string | null;
  source_publication_info: string | null;
  source_url: string | null;
  source_repository: string | null;
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
    /**
     * Birth-type record's surname when distinct from `surname`.
     * Display-only — composed at render time as "(f. …)" / "(b. …)" when the
     * Place Chronicle report's birth-name toggle is on. See plan
     * birth-name-display-and-quality-check.
     */
    birth_surname: string | null;
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

/**
 * Stable vocabulary for `TimelineEntry.relationship_label`.
 *
 * - `'self'`     — the subject's own event (replaces the old `null`).
 * - `'father'` / `'mother'` — sex-known parent (Task 3 will start emitting these;
 *                              Task 1 only adds them to the union).
 * - `'parent'`   — parent with sex unknown (current emission for parent_child where
 *                  the subject is `person2_id`; Task 3 narrows to father/mother).
 * - `'spouse'`   — couple-relationship partner.
 * - `'son'` / `'daughter'` — sex-known child (Task 4 will start emitting these).
 * - `'child'`    — child with sex unknown (current emission for parent_child where
 *                  the subject is `person1_id`).
 * - `'sibling'`  — sibling relationship.
 */
export type TimelineRelationshipLabel =
  | 'self'
  | 'father'
  | 'mother'
  | 'parent'
  | 'spouse'
  | 'son'
  | 'daughter'
  | 'child'
  | 'sibling';

export interface TimelineEntry {
  event: EventWithPlace;
  person_id: string;
  person_given_name: string;
  person_surname: string;
  /**
   * Birth-type record's surname when distinct from `person_surname`.
   * Display-only — composed at render time as "(f. …)" / "(b. …)" when the
   * report's birth-name toggle is on. See plan birth-name-display-and-quality-check.
   */
  person_birth_surname: string | null;
  relationship_label: TimelineRelationshipLabel;
}

/**
 * Optional categories on top of the default life timeline. Both default to
 * false — by default the timeline emits only the subject's own events, parent
 * deaths, spouse death, and children's births / foster_placements / deaths.
 *
 * - `includeChildrenMarriages`: include each child's `marriage` events
 *   (sourced from the child's couple-relationship events) that happened during
 *   the subject's lifetime. Labelled with the child's sex-typed label
 *   (`'son'` / `'daughter'` / `'child'`).
 * - `includeSiblingDeaths`: include the subject's siblings' `death` events
 *   that happened during the subject's lifetime. Labelled `'sibling'`. When
 *   this is false (the default), siblings are completely excluded from the
 *   timeline.
 */
export interface TimelineOptions {
  includeChildrenMarriages?: boolean;
  includeSiblingDeaths?: boolean;
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
    source_publication_info: source?.publication_info ?? null,
    source_url: source?.url ?? null,
    source_repository: source?.repository ?? null,
  };
}

function getPrimaryName(names: PersonName[]): { given_name: string; surname: string } {
  if (names.length === 0) return { given_name: '', surname: '' };
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return { given_name: sorted[0].given_name ?? '', surname: sorted[0].surname ?? '' };
}

/**
 * Display-only helper: returns the lowest-`sort_order` `birth`-type record's
 * surname when distinct from the primary record's surname, else null.
 * Used by `getTimeline` to populate `TimelineEntry.person_birth_surname` so
 * the renderer can compose "(f. …)" / "(b. …)" parentheticals at render time.
 * See plan birth-name-display-and-quality-check.
 */
function getBirthSurnameForDisplay(names: PersonName[]): string | null {
  if (names.length === 0) return null;
  const primarySorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  const primary = primarySorted[0];
  const births = names.filter(n => n.name_type === 'birth')
    .sort((a, b) => a.sort_order - b.sort_order);
  const birth = births[0];
  if (!birth) return null;
  if (birth.id === primary.id) return null;
  const birthSurname = (birth.surname ?? '').trim();
  if (!birthSurname) return null;
  if (birthSurname === (primary.surname ?? '').trim()) return null;
  return birthSurname;
}

function findEventByType(events: EventWithPlace[], type: string): EventWithPlace | null {
  return events.find(e => e.event_type === type) ?? null;
}

// ── Lifetime-constraint helpers (Task 2 — life timeline expansion) ──
// These are internal to getTimeline; not exported. They compute, at read time,
// which family events fall within the subject's lifetime so the timeline tells
// "the story of their life" rather than a flat list of every family event.

function extractYearMonthDay(dateValue: string | null): { y: number; m: number; d: number } | null {
  if (!dateValue) return null;
  const m = dateValue.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  return {
    y: parseInt(m[1], 10),
    m: m[2] ? parseInt(m[2], 10) : 1,
    d: m[3] ? parseInt(m[3], 10) : 1,
  };
}

function eventDateOnOrBefore(event: EventWithPlace, year: number, month: number, day: number): boolean {
  const ev = extractYearMonthDay(event.date_value);
  if (!ev) return false;
  if (ev.y !== year) return ev.y < year;
  if (ev.m !== month) return ev.m < month;
  return ev.d <= day;
}

function eventDateOnOrAfter(event: EventWithPlace, year: number, month: number, day: number): boolean {
  const ev = extractYearMonthDay(event.date_value);
  if (!ev) return false;
  if (ev.y !== year) return ev.y > year;
  if (ev.m !== month) return ev.m > month;
  return ev.d >= day;
}

function plusMonths(y: number, m: number, d: number, addMonths: number): { y: number; m: number; d: number } {
  const total = y * 12 + (m - 1) + addMonths;
  return { y: Math.floor(total / 12), m: (total % 12) + 1, d };
}

interface SubjectLifetime {
  birth: { y: number; m: number; d: number } | null;
  death: { y: number; m: number; d: number } | null;
  deathPlus9Mo: { y: number; m: number; d: number } | null;
}

function readSubjectLifetime(subjectEvents: EventWithPlace[]): SubjectLifetime {
  const birthEv = subjectEvents.find(e => e.event_type === 'birth');
  const deathEv = subjectEvents.find(e => e.event_type === 'death');
  const birth = birthEv ? extractYearMonthDay(birthEv.date_value) : null;
  const death = deathEv ? extractYearMonthDay(deathEv.date_value) : null;
  const deathPlus9Mo = death ? plusMonths(death.y, death.m, death.d, 9) : null;
  return { birth, death, deathPlus9Mo };
}

/**
 * Returns true if this family event falls within the subject's lifetime
 * (or, when `applyPosthumousWindow` is true — used for child births and
 * foster_placements — within 9 months after the subject's death, to capture
 * posthumous births fathered/borne by the subject).
 *
 * Per CLAUDE.md "events without a date_value pass through unchanged" — we only
 * filter events with parseable dates that fail the lifetime test. Undated
 * events appear in the timeline at the empty-string sort position; the display
 * layer can drop them if it wants.
 */
function familyEventWithinLifetime(
  event: EventWithPlace,
  lifetime: SubjectLifetime,
  applyPosthumousWindow: boolean,
): boolean {
  // Undated events pass through — see comment above.
  const ev = extractYearMonthDay(event.date_value);
  if (!ev) return true;

  // Lower bound: after subject's birth (if known).
  if (lifetime.birth) {
    if (!eventDateOnOrAfter(event, lifetime.birth.y, lifetime.birth.m, lifetime.birth.d)) {
      return false;
    }
  }

  // Upper bound: on or before subject's death — extended by 9 months only when
  // `applyPosthumousWindow` is true (i.e. for child birth / foster_placement, so
  // a baby born just after the subject's death still counts as "their" child).
  // Child deaths and all other family events use the strict death upper bound.
  // If subject has no death, they're still alive → no upper bound.
  if (applyPosthumousWindow && lifetime.deathPlus9Mo) {
    return eventDateOnOrBefore(event, lifetime.deathPlus9Mo.y, lifetime.deathPlus9Mo.m, lifetime.deathPlus9Mo.d);
  }
  if (lifetime.death) {
    return eventDateOnOrBefore(event, lifetime.death.y, lifetime.death.m, lifetime.death.d);
  }
  return true;
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
      const birthSurname = getBirthSurnameForDisplay(names);
      return {
        person_id: ep.person_id,
        given_name: primary.given_name,
        surname: primary.surname,
        birth_surname: birthSurname,
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
export function getTimeline(
  db: Database,
  personId: string,
  options: TimelineOptions = {},
): TimelineEntry[] | null {
  const person = getPerson(db, personId);
  if (!person) return null;

  const names = getPersonNames(db, personId);
  const primaryName = getPrimaryName(names);
  const birthSurnameForDisplay = getBirthSurnameForDisplay(names);

  const entries: TimelineEntry[] = [];

  // Person's own events
  const ownEvents = resolveEventsPlaces(db, getEventsForPerson(db, personId));
  for (const event of ownEvents) {
    entries.push({
      event,
      person_id: personId,
      person_given_name: primaryName.given_name,
      person_surname: primaryName.surname,
      person_birth_surname: birthSurnameForDisplay,
      relationship_label: 'self',
    });
  }

  // Synthetic timeline entries for authored name changes.
  // PRIME DIRECTIVE: these entries are computed from authored person_names rows
  // (date_from + name_type !== 'birth'). Nothing is persisted; the synthetic
  // GenealogyEvent shape lives only in this returned array.
  for (const n of names) {
    if (n.name_type === 'birth') continue;
    if (!n.date_from) continue;
    const fullName = [n.name_prefix, n.given_name, n.surname, n.name_suffix]
      .filter(Boolean).join(' ').trim();
    if (!fullName) continue;
    const syntheticEvent: EventWithPlace = {
      id: `name-change-${n.id}`,
      event_type: 'name_change',
      date_type: 'exact',
      date_value: n.date_from,
      date_value_end: null,
      date_original: n.date_from,
      place_id: null,
      place_address: null,
      cause: null,
      value: null,
      notes: fullName,
      relationship_id: null,
      created_at: '',
      updated_at: '',
      place_name: null,
      place_path: null,
    };
    entries.push({
      event: syntheticEvent,
      person_id: personId,
      person_given_name: primaryName.given_name,
      person_surname: primaryName.surname,
      relationship_label: 'self',
    });
  }

  // Compute the subject's lifetime once — used to filter family events so the
  // timeline tells the story of THIS person's life (events that happened during
  // their lifetime), not a flat list of every family member's life events.
  const lifetime = readSubjectLifetime(ownEvents);

  // Family events
  const rels = getRelationshipsOfPerson(db, personId);
  for (const r of rels) {
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    if (!otherId) continue;

    const otherNames = getPersonNames(db, otherId);
    const otherPrimary = getPrimaryName(otherNames);
    const otherBirthSurname = getBirthSurnameForDisplay(otherNames);

    let label: TimelineRelationshipLabel;
    let subjectIsParent = false;
    let relevantTypes: string[];
    if (r.type === 'couple') {
      // Task 6: narrow to death only — per the user goal "the deaths of their
      // … spouse." Spouse births/christenings/burials are not part of the
      // subject's life story for timeline purposes.
      label = 'spouse';
      relevantTypes = ['death'];
    } else if (r.type === 'parent_child') {
      // Convention: person1 = parent, person2 = child.
      subjectIsParent = r.person1_id === personId;
      if (subjectIsParent) {
        // Task 4 + 5: subject is the parent of `other`. Emit child birth (so
        // the user sees "what they built"), foster_placement (a parent_child
        // birth-equivalent), and child death (a loss during the subject's
        // lifetime — "this is who they lost"). Christenings and burials are
        // excluded — they're a redundant copy of the EventList sitting next to
        // the panel.
        const childPerson = getPerson(db, otherId);
        const childSex = childPerson?.sex ?? 'U';
        label = childSex === 'M' ? 'son' : childSex === 'F' ? 'daughter' : 'child';
        relevantTypes = ['birth', 'foster_placement', 'death'];
      } else {
        // Subject is the child of `other` — emit only the parent's death,
        // labelled by the parent's sex (per the user goal: "the deaths of their parents").
        const parentPerson = getPerson(db, otherId);
        const parentSex = parentPerson?.sex ?? 'U';
        label = parentSex === 'M' ? 'father' : parentSex === 'F' ? 'mother' : 'parent';
        relevantTypes = ['death'];
      }
    } else if (r.type === 'sibling') {
      // Task 7: siblings are completely excluded from the default timeline —
      // they're a redundant copy of relationships the user can already see.
      // Only sibling DEATHS are emitted, gated behind `includeSiblingDeaths`.
      if (!options.includeSiblingDeaths) continue;
      label = 'sibling';
      relevantTypes = ['death'];
    } else {
      // 'godparent' / 'other' relationships are not part of the subject's life story
      // for timeline purposes — skip them.
      continue;
    }

    const otherEvents = resolveEventsPlaces(db, getEventsForPerson(db, otherId));
    for (const event of otherEvents) {
      if (!relevantTypes.includes(event.event_type)) continue;

      // Lifetime constraint: a family event qualifies only if it happened
      // during the subject's life. The +9-month posthumous window applies ONLY
      // to child births and foster_placements (so a baby born just after the
      // subject's death still counts as "their" child).
      const applyPosthumousWindow =
        subjectIsParent &&
        (event.event_type === 'birth' || event.event_type === 'foster_placement');
      if (!familyEventWithinLifetime(event, lifetime, applyPosthumousWindow)) continue;

      entries.push({
        event,
        person_id: otherId,
        person_given_name: otherPrimary.given_name,
        person_surname: otherPrimary.surname,
        person_birth_surname: otherBirthSurname,
        relationship_label: label,
      });
    }
  }

  // Task 7: optional — children's marriages during subject's lifetime. Sourced
  // from each child's couple-relationship events (marriage events live on
  // `events.relationship_id` keyed to the couple relationship, NOT on the
  // child as an event participant). Labelled with the child's sex-typed label.
  if (options.includeChildrenMarriages) {
    for (const r of rels) {
      if (r.type !== 'parent_child') continue;
      // Convention: person1 = parent, person2 = child. Subject must be parent.
      if (r.person1_id !== personId) continue;
      const childId = r.person2_id;
      if (!childId) continue;

      const childPerson = getPerson(db, childId);
      const childSex = childPerson?.sex ?? 'U';
      const childLabel: TimelineRelationshipLabel =
        childSex === 'M' ? 'son' : childSex === 'F' ? 'daughter' : 'child';
      const childNames = getPersonNames(db, childId);
      const childPrimary = getPrimaryName(childNames);
      const childBirthSurname = getBirthSurnameForDisplay(childNames);

      const childRels = getRelationshipsOfPerson(db, childId);
      for (const cr of childRels) {
        if (cr.type !== 'couple') continue;
        const coupleEvents = resolveEventsPlaces(db, getEventsForRelationship(db, cr.id));
        for (const event of coupleEvents) {
          if (event.event_type !== 'marriage') continue;
          // Strict lifetime: a child's marriage after the subject's death is
          // not part of the subject's life story (no posthumous window — the
          // +9mo only applies to births / foster_placements).
          if (!familyEventWithinLifetime(event, lifetime, false)) continue;
          entries.push({
            event,
            person_id: childId,
            person_given_name: childPrimary.given_name,
            person_surname: childPrimary.surname,
            person_birth_surname: childBirthSurname,
            relationship_label: childLabel,
          });
        }
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
  /**
   * Birth-type record's surname when distinct from `surname`. Display only —
   * see plan birth-name-display-and-quality-check.
   */
  birth_surname: string | null;
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
    birth_surname: string | null;
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
    SELECT p.id, p.sex, ${livingSqlExpr('p')} AS living,
           pn.given_name, pn.surname,
           ${birthSurnameSql('p.id')} AS birth_surname,
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
    LEFT JOIN person_names pn ON pn.id = ${displayedNameIdSql('p.id')}
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
      // Display only: filter out birth_surname when it equals surname (loader
      // returns the bare birth surname; renderer-visible "(f. …)" suppression
      // when equal happens here so AliveInYearPerson reads cleanly).
      const cleanBirthSurname = r.birth_surname && r.birth_surname.trim() && r.birth_surname.trim() !== (r.surname ?? '').trim()
        ? r.birth_surname
        : null;
      alive.push({
        id: r.id,
        sex: r.sex,
        living: !!r.living,
        given_name: r.given_name,
        surname: r.surname,
        birth_surname: cleanBirthSurname,
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
