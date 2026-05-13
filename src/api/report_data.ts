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
import { loadLivingDerivation, isLivingDerived } from './personLiving';
import type { Person, PersonName, GenealogyEvent, Relationship, Citation, Group, ResearchTask } from './types';
import type { EventWithPlace, CitationWithSource, RelationshipSummary } from './report_data/types';

export type { EventWithPlace, CitationWithSource, RelationshipSummary };

// ── Return types ──

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
 * Biological / adopted / unknown subtype:
 * - `'self'`     — the subject's own event (replaces the old `null`).
 * - `'father'` / `'mother'` — sex-known parent.
 * - `'parent'`   — parent with sex unknown.
 * - `'spouse'`   — couple-relationship partner.
 * - `'son'` / `'daughter'` — sex-known child.
 * - `'child'`    — child with sex unknown.
 * - `'sibling'`  — sibling relationship.
 *
 * Foster subtype (parent_child rows where subtype === 'foster'):
 * - `'foster_father'` / `'foster_mother'` / `'foster_parent'`
 * - `'foster_son'` / `'foster_daughter'` / `'foster_child'`
 *
 * Step subtype (parent_child rows where subtype === 'step'):
 * - `'step_father'` / `'step_mother'` / `'step_parent'`
 * - `'step_son'` / `'step_daughter'` / `'step_child'`
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
  | 'sibling'
  | 'foster_father'
  | 'foster_mother'
  | 'foster_parent'
  | 'foster_son'
  | 'foster_daughter'
  | 'foster_child'
  | 'step_father'
  | 'step_mother'
  | 'step_parent'
  | 'step_son'
  | 'step_daughter'
  | 'step_child';

/**
 * Display-only partner data for self events tied to a couple relationship
 * (marriage, divorce, wedding, engagement, separation, annulment).
 * Populated at read time so the renderer can compose
 * "Vigsel — Anna Andersson" labels without a second lookup.
 * `null` for non-couple events.
 */
export interface TimelinePartner {
  person_id: string;
  given_name: string;
  surname: string;
  birth_surname: string | null;
}

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
  /**
   * Partner for self events tied to a couple relationship. `null` otherwise.
   * Used by `composeTimelineLabel` to render "<event> — <partner>".
   */
  partner?: TimelinePartner | null;
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

async function resolveCitationSource(db: Database, citation: Citation): Promise<CitationWithSource> {
  const source = await getSource(db, citation.source_id);
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

// ── Public API ──

/**
 * Returns everything about a person in one call: names, events (with places),
 * relationships (with other person names), citations (with source titles),
 * groups, and research tasks.
 */
export async function getPersonSummary(db: Database, personId: string): Promise<PersonSummary | null> {
  const person = await getPerson(db, personId);
  if (!person) return null;

  const names = await getPersonNames(db, personId);
  const rawEvents = await getEventsForPerson(db, personId);
  const events = await resolveEventsPlaces(db, rawEvents);

  const rawRelationships = await getRelationshipsOfPerson(db, personId);
  const relationships: RelationshipSummary[] = [];
  for (const r of rawRelationships) {
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    let otherNames: PersonName[] = [];
    let otherSex: string | null = null;
    let otherBirthDate: string | null = null;
    if (otherId) {
      otherNames = await getPersonNames(db, otherId);
      const otherPerson = await getPerson(db, otherId);
      otherSex = otherPerson?.sex ?? null;
      const otherEvents = await getEventsForPerson(db, otherId);
      const birthEvent = otherEvents.find(e => e.event_type === 'birth');
      otherBirthDate = birthEvent?.date_value ?? null;
    }

    // Partnership start date — for couple rows, look up the marriage
    // event tied to this relationship; fall back to the earliest dated
    // relationship event.
    let partnershipStartDate: string | null = null;
    if (r.type === 'couple') {
      const relEvents = await getEventsForRelationship(db, r.id);
      const marriage = relEvents.find(e => e.event_type === 'marriage');
      partnershipStartDate = marriage?.date_value
        ?? relEvents.map(e => e.date_value).filter((d): d is string => !!d).sort()[0]
        ?? null;
    }

    // Other-parent id — for outgoing parent_child rows (focal is the
    // parent), find the child's other parent by walking the child's
    // incoming parent_child relations.
    let otherParentId: string | null = null;
    if (r.type === 'parent_child' && r.person1_id === personId && otherId) {
      const childRels = await getRelationshipsOfPerson(db, otherId);
      for (const cr of childRels) {
        if (cr.type !== 'parent_child') continue;
        // person1 = parent, person2 = child convention
        if (cr.person2_id === otherId && cr.person1_id && cr.person1_id !== personId) {
          otherParentId = cr.person1_id;
          break;
        }
      }
    }

    relationships.push({
      ...r,
      other_person_id: otherId ?? null,
      other_person_names: otherNames,
      other_person_sex: otherSex,
      other_person_birth_date: otherBirthDate,
      partnership_start_date: partnershipStartDate,
      other_parent_id: otherParentId,
    });
  }

  const rawCitations = await getCitationsForPerson(db, personId);
  // Also collect citations on the person's events
  const eventCitationIds = new Set(rawCitations.map(c => c.id));
  for (const event of rawEvents) {
    const eventCitations = await getCitationsForEvent(db, event.id);
    for (const c of eventCitations) {
      if (!eventCitationIds.has(c.id)) {
        rawCitations.push(c);
        eventCitationIds.add(c.id);
      }
    }
  }
  const citations: CitationWithSource[] = [];
  for (const c of rawCitations) citations.push(await resolveCitationSource(db, c));

  const groups = await getGroupsForPerson(db, personId);
  const research_tasks = await getResearchTasksForPerson(db, personId);

  return { person, names, events, relationships, citations, groups, research_tasks };
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

/**
 * Returns all events at a place, chronologically, with participant names and roles.
 */
export async function getPlaceHistory(db: Database, placeId: string): Promise<PlaceHistory | null> {
  const place = await getPlace(db, placeId);
  if (!place) return null;

  const rawEvents = await queryAll<GenealogyEvent>(db,
    `SELECT * FROM events WHERE place_id = ? ORDER BY date_value ASC`,
    [placeId]
  );

  const events: PlaceEventRecord[] = [];
  for (const event of rawEvents) {
    const eventWithPlace = await resolveEventPlace(db, event);
    const rawParticipants = await getEventParticipants(db, event.id);
    const participants = [];
    for (const ep of rawParticipants) {
      const names = await getPersonNames(db, ep.person_id);
      const primary = getPrimaryName(names);
      const birthSurname = getBirthSurnameForDisplay(names);
      participants.push({
        person_id: ep.person_id,
        given_name: primary.given_name,
        surname: primary.surname,
        birth_surname: birthSurname,
        role: ep.role,
      });
    }
    events.push({ event: eventWithPlace, participants });
  }

  return {
    place_id: placeId,
    place_name: place.name,
    place_path: await getPlacePath(db, placeId),
    events,
  };
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

/**
 * Returns a merged chronological timeline of a person's events plus family events
 * (spouse's birth/death, children's births/deaths).
 */
export async function getTimeline(
  db: Database,
  personId: string,
  options: TimelineOptions = {},
): Promise<TimelineEntry[] | null> {
  const person = await getPerson(db, personId);
  if (!person) return null;

  const names = await getPersonNames(db, personId);
  const primaryName = getPrimaryName(names);
  const birthSurnameForDisplay = getBirthSurnameForDisplay(names);

  const entries: TimelineEntry[] = [];

  // Pre-fetch the focal person's relationships once. Used both for
  // partner-name lookup on self couple events and for kin-event emission
  // further down. Hoisting out of the per-event loop keeps the timeline
  // O(rels) instead of O(events × rels).
  const focalRels = await getRelationshipsOfPerson(db, personId);

  // Cache partner data per couple-relationship-id so a person with
  // multiple events tied to the same marriage (e.g. marriage + divorce)
  // doesn't re-query names per event.
  const partnerByRelId = new Map<string, TimelinePartner | null>();
  async function lookupPartner(relationshipId: string): Promise<TimelinePartner | null> {
    if (partnerByRelId.has(relationshipId)) return partnerByRelId.get(relationshipId)!;
    const r = focalRels.find(rr => rr.id === relationshipId && rr.type === 'couple');
    if (!r) {
      partnerByRelId.set(relationshipId, null);
      return null;
    }
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    if (!otherId) {
      partnerByRelId.set(relationshipId, null);
      return null;
    }
    const otherNames = await getPersonNames(db, otherId);
    const otherPrimary = getPrimaryName(otherNames);
    const otherBirthSurname = getBirthSurnameForDisplay(otherNames);
    const partner: TimelinePartner = {
      person_id: otherId,
      given_name: otherPrimary.given_name,
      surname: otherPrimary.surname,
      birth_surname: otherBirthSurname,
    };
    partnerByRelId.set(relationshipId, partner);
    return partner;
  }

  // Person's own events. Self-events tied to a couple relationship
  // (marriage, divorce, etc.) carry an optional `partner` payload so the
  // renderer can compose "<event> — <partner>" labels at render time.
  const ownEvents = await resolveEventsPlaces(db, await getEventsForPerson(db, personId));
  for (const event of ownEvents) {
    const partner: TimelinePartner | null = event.relationship_id
      ? await lookupPartner(event.relationship_id)
      : null;
    entries.push({
      event,
      person_id: personId,
      person_given_name: primaryName.given_name,
      person_surname: primaryName.surname,
      person_birth_surname: birthSurnameForDisplay,
      relationship_label: 'self',
      partner,
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

  // Family events — reuse the already-fetched focalRels.
  const rels = focalRels;
  for (const r of rels) {
    const otherId = r.person1_id === personId ? r.person2_id : r.person1_id;
    if (!otherId) continue;

    const otherNames = await getPersonNames(db, otherId);
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
      // Subtype tweaks the relationship label (foster_father, step_son, …)
      // and gates whether the child's biological birth shows on the focal
      // person's timeline. Per the timeline-kin-event-labelling plan: a
      // foster/step parent did not participate in the child's biological
      // birth, so that row is dropped — the foster_placement row surfaces
      // in its place when dated. The same rule is symmetric for the child
      // side (a foster/step parent's death surfaces with a foster/step
      // label rather than the bare "Förälders död").
      const subtype = (r.subtype ?? '').toLowerCase();
      const isFoster = subtype === 'foster';
      const isStep = subtype === 'step';
      if (subjectIsParent) {
        const childPerson = await getPerson(db, otherId);
        const childSex = childPerson?.sex ?? 'U';
        if (isFoster) {
          label = childSex === 'M' ? 'foster_son' : childSex === 'F' ? 'foster_daughter' : 'foster_child';
          // Foster: drop the biological birth — the focal person had no part
          // in it. foster_placement surfaces in its place when dated.
          relevantTypes = ['foster_placement', 'death'];
        } else if (isStep) {
          label = childSex === 'M' ? 'step_son' : childSex === 'F' ? 'step_daughter' : 'step_child';
          // Step: same treatment — biological birth predates the step
          // relationship by definition.
          relevantTypes = ['foster_placement', 'death'];
        } else {
          label = childSex === 'M' ? 'son' : childSex === 'F' ? 'daughter' : 'child';
          relevantTypes = ['birth', 'foster_placement', 'death'];
        }
      } else {
        // Subject is the child of `other` — emit only the parent's death,
        // labelled by the parent's sex AND the parent_child subtype.
        const parentPerson = await getPerson(db, otherId);
        const parentSex = parentPerson?.sex ?? 'U';
        if (isFoster) {
          label = parentSex === 'M' ? 'foster_father' : parentSex === 'F' ? 'foster_mother' : 'foster_parent';
        } else if (isStep) {
          label = parentSex === 'M' ? 'step_father' : parentSex === 'F' ? 'step_mother' : 'step_parent';
        } else {
          label = parentSex === 'M' ? 'father' : parentSex === 'F' ? 'mother' : 'parent';
        }
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

    const otherEvents = await resolveEventsPlaces(db, await getEventsForPerson(db, otherId));
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

      const childPerson = await getPerson(db, childId);
      const childSex = childPerson?.sex ?? 'U';
      const childSubtype = (r.subtype ?? '').toLowerCase();
      const childLabel: TimelineRelationshipLabel =
        childSubtype === 'foster'
          ? (childSex === 'M' ? 'foster_son' : childSex === 'F' ? 'foster_daughter' : 'foster_child')
          : childSubtype === 'step'
          ? (childSex === 'M' ? 'step_son' : childSex === 'F' ? 'step_daughter' : 'step_child')
          : (childSex === 'M' ? 'son' : childSex === 'F' ? 'daughter' : 'child');
      const childNames = await getPersonNames(db, childId);
      const childPrimary = getPrimaryName(childNames);
      const childBirthSurname = getBirthSurnameForDisplay(childNames);

      const childRels = await getRelationshipsOfPerson(db, childId);
      for (const cr of childRels) {
        if (cr.type !== 'couple') continue;
        const coupleEvents = await resolveEventsPlaces(db, await getEventsForRelationship(db, cr.id));
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
export async function getAliveInYear(db: Database, year: number): Promise<AliveInYearResult> {
  // Bulk pre-load — replaces a per-person correlated-subquery storm that
  // saturated CPU and exhausted the WASM heap on real-sized trees.
  const livingDerivation = await loadLivingDerivation(db);

  const birthYearRows = await queryAll<{ person_id: string; year: number }>(db, `
    SELECT ep.person_id, MIN(CAST(substr(e.date_value, 1, 4) AS INTEGER)) AS year
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'birth' AND e.date_value IS NOT NULL
    GROUP BY ep.person_id
  `);
  const birthYearByPerson = new Map(birthYearRows.map(r => [r.person_id, r.year]));

  const deathYearRows = await queryAll<{ person_id: string; year: number }>(db, `
    SELECT ep.person_id, MIN(CAST(substr(e.date_value, 1, 4) AS INTEGER)) AS year
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'death' AND e.date_value IS NOT NULL
    GROUP BY ep.person_id
  `);
  const deathYearByPerson = new Map(deathYearRows.map(r => [r.person_id, r.year]));

  const eventInYearRows = await queryAll<{ person_id: string }>(db, `
    SELECT DISTINCT ep.person_id
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.date_value IS NOT NULL
      AND CAST(substr(e.date_value, 1, 4) AS INTEGER) = ?
  `, [year]);
  const personsWithEventInYear = new Set(eventInYearRows.map(r => r.person_id));

  // Latest place at-or-before target year per person — single scan, JS reduce.
  const placeRows = await queryAll<{ person_id: string; date_value: string; place_name: string }>(db, `
    SELECT ep.person_id, e.date_value, pl.name AS place_name
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    JOIN places pl ON pl.id = e.place_id
    WHERE e.date_value IS NOT NULL
      AND CAST(substr(e.date_value, 1, 4) AS INTEGER) <= ?
      AND pl.name IS NOT NULL
  `, [year]);
  const latestPlaceByPerson = new Map<string, { date_value: string; name: string }>();
  for (const r of placeRows) {
    const cur = latestPlaceByPerson.get(r.person_id);
    if (!cur || r.date_value > cur.date_value) {
      latestPlaceByPerson.set(r.person_id, { date_value: r.date_value, name: r.place_name });
    }
  }

  // Names: bulk-load and replicate displayedNameIdSql / birthSurnameSql in JS.
  type NameRow = {
    id: string;
    person_id: string;
    given_name: string | null;
    surname: string | null;
    name_type: string;
    date_from: string | null;
    sort_order: number;
  };
  const nameRows = await queryAll<NameRow>(db, `
    SELECT id, person_id, given_name, surname, name_type, date_from, sort_order
    FROM person_names
  `);
  const namesByPerson = new Map<string, NameRow[]>();
  for (const n of nameRows) {
    const list = namesByPerson.get(n.person_id);
    if (list) list.push(n);
    else namesByPerson.set(n.person_id, [n]);
  }

  // Earliest primary-role birth event date per person — used to date 'birth' name_type.
  const birthEventDateRows = await queryAll<{ person_id: string; date_value: string }>(db, `
    SELECT ep.person_id, MIN(e.date_value) AS date_value
    FROM events e
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.event_type = 'birth'
      AND ep.role = 'primary'
      AND e.date_value IS NOT NULL AND e.date_value <> ''
    GROUP BY ep.person_id
  `);
  const birthEventDateByPerson = new Map(birthEventDateRows.map(r => [r.person_id, r.date_value]));

  function effectiveDate(n: NameRow): string | null {
    if (n.name_type === 'birth') {
      return birthEventDateByPerson.get(n.person_id) ?? n.date_from;
    }
    return n.date_from;
  }

  function pickDisplayedName(personId: string): { given_name: string | null; surname: string | null } {
    const list = namesByPerson.get(personId);
    if (!list || list.length === 0) return { given_name: null, surname: null };
    let best: NameRow | null = null;
    let bestDate: string | null = null;
    for (const n of list) {
      const d = effectiveDate(n);
      if (best === null) {
        best = n; bestDate = d; continue;
      }
      // Mirror SQL: nulls last on effective date; then date DESC; then sort_order DESC; then id ASC.
      const aHasDate = bestDate != null;
      const bHasDate = d != null;
      let bWins = false;
      if (aHasDate !== bHasDate) {
        bWins = bHasDate && !aHasDate;
      } else if (aHasDate && bHasDate && bestDate !== d) {
        bWins = (d as string) > (bestDate as string);
      } else if (n.sort_order !== best.sort_order) {
        bWins = n.sort_order > best.sort_order;
      } else {
        bWins = n.id < best.id;
      }
      if (bWins) { best = n; bestDate = d; }
    }
    return { given_name: best?.given_name ?? null, surname: best?.surname ?? null };
  }

  function pickBirthSurname(personId: string): string | null {
    const list = namesByPerson.get(personId);
    if (!list) return null;
    let best: NameRow | null = null;
    for (const n of list) {
      if (n.name_type !== 'birth') continue;
      if (!best
        || n.sort_order < best.sort_order
        || (n.sort_order === best.sort_order && n.id < best.id)) {
        best = n;
      }
    }
    return best?.surname ?? null;
  }

  const personRows = await queryAll<{ id: string; sex: 'M' | 'F' | 'U' }>(db, `SELECT id, sex FROM persons`);

  const alive: AliveInYearPerson[] = [];
  for (const p of personRows) {
    const birthYear = birthYearByPerson.get(p.id) ?? null;
    const deathYear = deathYearByPerson.get(p.id) ?? null;

    const notBornYet = birthYear != null && birthYear > year;
    const diedAlready = deathYear != null && deathYear < year;
    const tooOldNoBirth = birthYear == null && deathYear != null && (deathYear - year) > MAX_LIFESPAN;
    const tooOldNoDeath = deathYear == null && birthYear != null && (year - birthYear) > MAX_LIFESPAN;

    let include = false;
    if (notBornYet || diedAlready) include = false;
    else if (birthYear != null && deathYear != null) include = true;
    else if (birthYear != null) include = !tooOldNoDeath;
    else if (deathYear != null) include = !tooOldNoBirth;
    else include = personsWithEventInYear.has(p.id);

    if (!include) continue;

    const { given_name, surname } = pickDisplayedName(p.id);
    const rawBirthSurname = pickBirthSurname(p.id);
    const cleanBirthSurname = rawBirthSurname && rawBirthSurname.trim() && rawBirthSurname.trim() !== (surname ?? '').trim()
      ? rawBirthSurname
      : null;

    alive.push({
      id: p.id,
      sex: p.sex,
      living: isLivingDerived(p.id, livingDerivation),
      given_name,
      surname,
      birth_surname: cleanBirthSurname,
      birthYear,
      deathYear,
      age: birthYear != null ? year - birthYear : null,
      placeName: latestPlaceByPerson.get(p.id)?.name ?? null,
    });
  }

  const coupleRows = await queryAll<{ id: string; person1_id: string | null; person2_id: string | null }>(db,
    `SELECT id, person1_id, person2_id FROM relationships WHERE type = 'couple'`
  );

  const parentChildRows = await queryAll<{ parent_id: string | null; child_id: string | null }>(db,
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
