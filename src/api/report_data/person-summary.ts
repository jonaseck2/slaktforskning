import type { Database } from 'node-sqlite3-wasm';
import { getPerson, getPersonNames } from '../persons';
import { getRelationshipsOfPerson } from '../relationships';
import { getEventsForPerson, getEventsForRelationship } from '../events';
import { getPlace, getPlacePath } from '../places';
import { getCitationsForPerson, getCitationsForEvent, getSource } from '../sources';
import { getGroupsForPerson } from '../groups';
import { getResearchTasksForPerson } from '../research_tasks';
import type { Person, PersonName, GenealogyEvent, Citation, Group, ResearchTask } from '../types';
import type { EventWithPlace, CitationWithSource, RelationshipSummary } from './types';

export interface PersonSummary {
  person: Person;
  names: PersonName[];
  events: EventWithPlace[];
  relationships: RelationshipSummary[];
  citations: CitationWithSource[];
  groups: Group[];
  research_tasks: ResearchTask[];
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
