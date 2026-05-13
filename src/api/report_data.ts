import type { Database } from 'node-sqlite3-wasm';
import { getPerson, getPersonNames } from './persons';
import { getRelationshipsOfPerson } from './relationships';
import { getEventsForPerson, getEventsForRelationship } from './events';
import { getPlace, getPlacePath } from './places';
import type { PersonName, GenealogyEvent } from './types';
import type { EventWithPlace, CitationWithSource, RelationshipSummary } from './report_data/types';

export type { EventWithPlace, CitationWithSource, RelationshipSummary };

// Re-export extracted per-report builders so existing call sites keep working
// during the in-progress split (plan: 2026-05-14-report-data-split).
export { getResearchGaps } from './report_data/research-gaps';
export type { ResearchGaps } from './report_data/research-gaps';
export { getPlaceHistory } from './report_data/place-history';
export type { PlaceHistory, PlaceEventRecord } from './report_data/place-history';
export { getFamilyUnit } from './report_data/family-unit';
export type { FamilyUnit, FamilyMember } from './report_data/family-unit';
export { getAncestorTree } from './report_data/ancestor-tree';
export type { AncestorNode } from './report_data/ancestor-tree';
export { getPersonSummary } from './report_data/person-summary';
export type { PersonSummary } from './report_data/person-summary';
export { getAliveInYear } from './report_data/alive-in-year';
export type { AliveInYearPerson, AliveInYearFamily, AliveInYearResult } from './report_data/alive-in-year';

// ── Return types ──

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

// ── Public API ──

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

