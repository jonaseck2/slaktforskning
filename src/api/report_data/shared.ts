// Shared scaffolding extracted from per-report files during Task 11 of the
// report-data-split plan. The "discover, not assume" rule: a helper lands here
// only if ≥2 report files use it with byte-identical implementations. Cousins
// (similar shape, different walk) stay in their owning file.
//
// What's here:
// - `resolveEventPlace`         — 6 files: research-gaps, place-history, family-unit,
//                                          ancestor-tree, person-summary, timeline
// - `resolveEventsPlaces`       — 5 files: research-gaps, family-unit, ancestor-tree,
//                                          person-summary, timeline
// - `getPrimaryName`            — 2 files: place-history, timeline
// - `getBirthSurnameForDisplay` — 2 files: place-history, timeline
// - `findEventByType`           — 2 files: family-unit, ancestor-tree
//
// What's deliberately NOT here (cousin patterns / single-use):
// - `resolveCitationSource` (person-summary) — single caller.
// - `buildFamilyMember` (family-unit) — single caller; tightly coupled to
//   FamilyMember shape declared there.
// - `extractYearMonthDay` / `eventDateOnOrBefore` / `eventDateOnOrAfter` /
//   `plusMonths` / `readSubjectLifetime` / `familyEventWithinLifetime`
//   (timeline) — single caller; lifetime-window logic specific to the timeline
//   report.
// - alive-in-year's `pickDisplayedName` / `pickBirthSurname` — cousin, not
//   duplicate: they operate on a bulk-loaded `NameRow` row shape from a single
//   SQL scan, not the per-person `PersonName[]` shape `getPrimaryName` /
//   `getBirthSurnameForDisplay` walk. Different data flow, different
//   algorithm — keep separate.

import type { Database } from 'node-sqlite3-wasm';
import { getPlace, getPlacePath } from '../places';
import type { GenealogyEvent, PersonName } from '../types';
import type { EventWithPlace } from './types';

/**
 * Resolves a single event's `place_name` / `place_path` for display. `place_id`
 * stays authoritative — these fields are derived for the renderer's convenience.
 */
export async function resolveEventPlace(db: Database, event: GenealogyEvent): Promise<EventWithPlace> {
  let place_name: string | null = null;
  let place_path: string | null = null;
  if (event.place_id) {
    const place = await getPlace(db, event.place_id);
    place_name = place?.name ?? null;
    place_path = await getPlacePath(db, event.place_id);
  }
  return { ...event, place_name, place_path };
}

/**
 * Sequential `resolveEventPlace` over a list. Kept sequential (not Promise.all)
 * because the underlying `getPlacePath` walks the parent chain and benefits from
 * SQLite's prepared-statement cache — parallel calls thrash it.
 */
export async function resolveEventsPlaces(db: Database, events: GenealogyEvent[]): Promise<EventWithPlace[]> {
  const out: EventWithPlace[] = [];
  for (const e of events) out.push(await resolveEventPlace(db, e));
  return out;
}

/**
 * Returns the lowest-`sort_order` name as a `{ given_name, surname }` pair, with
 * nulls coerced to empty strings. Display-only.
 */
export function getPrimaryName(names: PersonName[]): { given_name: string; surname: string } {
  if (names.length === 0) return { given_name: '', surname: '' };
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  return { given_name: sorted[0].given_name ?? '', surname: sorted[0].surname ?? '' };
}

/**
 * Display-only helper: returns the lowest-`sort_order` `birth`-type record's
 * surname when distinct from the primary record's surname, else null. Used by
 * report builders that need to compose "(f. …)" / "(b. …)" parentheticals at
 * render time. See plan birth-name-display-and-quality-check.
 */
export function getBirthSurnameForDisplay(names: PersonName[]): string | null {
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

/**
 * Returns the first event of the given `event_type`, or null. Used by report
 * builders that need to pull out a person's key events (birth, death, marriage).
 */
export function findEventByType(events: EventWithPlace[], type: string): EventWithPlace | null {
  return events.find(e => e.event_type === type) ?? null;
}
