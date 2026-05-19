import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { loadLivingDerivation, isLivingDerived } from '../personLiving';
import type { ScopeOptions } from './scope';
import { computeScope } from './scope';
import { decadeFloor } from './redact';

export interface PreviewOptions {
  siteTitle: string;
  scope: ScopeOptions;
  options: {
    excludeLiving: boolean;
    redactLiving: boolean;
  };
}

export interface PreviewPersonSample {
  id: string;
  given_name: string;
  surname: string;
  redacted: boolean;
  birth_year: number | null;
  death_year: number | null;
}

export interface PreviewResult {
  meta: { siteTitle: string };
  totals: {
    persons: number;
    places: number;
    media: number;
    redacted: number;
  };
  personSample: PreviewPersonSample[];
}

const SAMPLE_SIZE = 50;
const YEAR_PATTERN = /^(\d{4})/;

/**
 * Lightweight stats + person sample for the website-export preview pane.
 *
 * buildSnapshot returns the full export payload (persons, names, events,
 * participants, places, sources, citations, media, links, regions). For a
 * 7k-person tree that's tens of MB of JSON serialized across the worker→main
 * →renderer hops on every preview refresh, blocking the worker thread the
 * whole time. This function instead returns just counts + a sorted sample.
 */
export async function buildPreview(db: Database, opts: PreviewOptions): Promise<PreviewResult> {
  const scopeSet = await computeScope(db, opts.scope);

  if (scopeSet.size === 0) {
    return {
      meta: { siteTitle: opts.siteTitle },
      totals: { persons: 0, places: 0, media: 0, redacted: 0 },
      personSample: [],
    };
  }

  // Load everything in PARALLEL. Each query is independent of the others.
  // SQLite serializes at the mutex, but every query's IPC response can
  // overlap with the next query's SQL execution — for a 22k-person DB this
  // cuts the stats wall-clock substantially vs the prior sequential awaits.
  const scopeIds = [...scopeSet];
  const placeholders = scopeIds.map(() => '?').join(',');
  const [rawPersonIds, derivation, nameRows, yearRows, eventPlaceRows, mediaLinkRows] = await Promise.all([
    scopeIds.length === 0
      ? Promise.resolve([] as { id: string }[])
      : queryAll<{ id: string }>(db, `SELECT id FROM persons WHERE id IN (${placeholders})`, scopeIds),
    loadLivingDerivation(db),
    queryAll<{ person_id: string; given_name: string | null; surname: string | null }>(
      db,
      `SELECT person_id, given_name, surname FROM person_names ORDER BY person_id, sort_order`,
    ),
    queryAll<{ person_id: string; event_type: string; date_value: string | null }>(
      db,
      `SELECT ep.person_id, e.event_type, e.date_value
       FROM events e
       JOIN event_participants ep ON ep.event_id = e.id
       WHERE ep.role = 'primary'
         AND e.event_type IN ('birth', 'death', 'burial')
         AND e.date_value IS NOT NULL`,
    ),
    queryAll<{ person_id: string; place_id: string }>(
      db,
      `SELECT ep.person_id, e.place_id
       FROM events e
       JOIN event_participants ep ON ep.event_id = e.id
       WHERE e.place_id IS NOT NULL`,
    ),
    queryAll<{ entity_id: string; media_id: string }>(
      db,
      `SELECT entity_id, media_id FROM media_links WHERE entity_type = 'person'`,
    ),
  ]);

  const inScopeAll = rawPersonIds.map(p => ({ id: p.id, living: isLivingDerived(p.id, derivation) }));

  const finalPersons = opts.options.excludeLiving
    ? inScopeAll.filter(p => !p.living)
    : inScopeAll;

  const finalPersonIds = new Set(finalPersons.map(p => p.id));
  const redactedCount = opts.options.redactLiving
    ? finalPersons.filter(p => p.living).length
    : 0;

  const namesByPerson = new Map<string, { given: string; surname: string }>();
  for (const n of nameRows) {
    if (!finalPersonIds.has(n.person_id)) continue;
    if (namesByPerson.has(n.person_id)) continue;
    namesByPerson.set(n.person_id, { given: n.given_name ?? '', surname: n.surname ?? '' });
  }

  const yearsByPerson = new Map<string, { birth: number | null; death: number | null }>();
  for (const r of yearRows) {
    if (!finalPersonIds.has(r.person_id)) continue;
    const y = parseYear(r.date_value);
    if (y === null) continue;
    const cur = yearsByPerson.get(r.person_id) ?? { birth: null, death: null };
    if (r.event_type === 'birth' && cur.birth === null) cur.birth = y;
    if ((r.event_type === 'death' || r.event_type === 'burial') && cur.death === null) cur.death = y;
    yearsByPerson.set(r.person_id, cur);
  }

  const placeIds = new Set<string>();
  for (const r of eventPlaceRows) {
    if (finalPersonIds.has(r.person_id)) placeIds.add(r.place_id);
  }

  const mediaIds = new Set<string>();
  for (const r of mediaLinkRows) {
    if (finalPersonIds.has(r.entity_id)) mediaIds.add(r.media_id);
  }

  const samplePool = finalPersons.map(p => {
    const name = namesByPerson.get(p.id);
    const years = yearsByPerson.get(p.id);
    const redacted = opts.options.redactLiving && p.living;
    return {
      id: p.id,
      given_name: name?.given ?? '',
      surname: name?.surname ?? '',
      birth_year: redacted
        ? (years?.birth != null ? decadeFloor(years.birth) : null)
        : (years?.birth ?? null),
      death_year: redacted ? null : (years?.death ?? null),
      redacted,
    };
  });
  samplePool.sort((a, b) => {
    const s = a.surname.localeCompare(b.surname, undefined, { sensitivity: 'base' });
    if (s !== 0) return s;
    return a.given_name.localeCompare(b.given_name, undefined, { sensitivity: 'base' });
  });
  const personSample = samplePool.slice(0, SAMPLE_SIZE);

  return {
    meta: { siteTitle: opts.siteTitle },
    totals: {
      persons: finalPersons.length,
      places: placeIds.size,
      media: mediaIds.size,
      redacted: redactedCount,
    },
    personSample,
  };
}

function parseYear(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const m = YEAR_PATTERN.exec(dateValue);
  return m ? Number(m[1]) : null;
}
