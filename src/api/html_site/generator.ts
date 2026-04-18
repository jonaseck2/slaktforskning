/**
 * Static HTML site generator.
 *
 * Reads all genealogy data from SQLite via bulk queries upfront,
 * then generates pages from in-memory maps — no per-entity queries.
 *
 * This module uses Node.js fs/path but has zero Electron dependencies,
 * consistent with the api/ layer contract.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { PersonName, GenealogyEvent, Citation, Place, Source } from '../types';
import { getSiteCSS } from './style';
import {
  indexPage,
  personPage,
  placePage,
  sourcePage,
  placesIndexPage,
  sourcesIndexPage,
  searchPage,
  personDisplayName,
  type PersonSummary,
  type PersonPageData,
  type PlacePageData,
  type SourcePageData,
} from './templates';

export interface HtmlSiteOptions {
  /** Exclude persons marked as living. Default: false */
  excludeLiving?: boolean;
  /** Custom site title. Default: 'Family Tree' */
  siteTitle?: string;
}

export interface HtmlSiteResult {
  pageCount: number;
  personCount: number;
  placeCount: number;
  sourceCount: number;
}

// ── Bulk loaders ────────────────────────────────────────

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push(row);
  }
  return map;
}

function loadAllNames(db: Database): Map<string, PersonName[]> {
  const rows = queryAll<PersonName>(db, 'SELECT * FROM person_names ORDER BY sort_order');
  return groupBy(rows, r => r.person_id);
}

function loadAllEvents(db: Database): Map<string, GenealogyEvent[]> {
  const rows = queryAll<GenealogyEvent>(db, 'SELECT * FROM events ORDER BY date_value');
  return groupBy(rows, r => r.id);
}

function loadAllEventParticipants(db: Database): { byEvent: Map<string, string[]>; byPerson: Map<string, string[]> } {
  const rows = queryAll<{ event_id: string; person_id: string }>(
    db, 'SELECT event_id, person_id FROM event_participants',
  );
  const byEvent = new Map<string, string[]>();
  const byPerson = new Map<string, string[]>();
  for (const r of rows) {
    let ev = byEvent.get(r.event_id);
    if (!ev) { ev = []; byEvent.set(r.event_id, ev); }
    ev.push(r.person_id);

    let pe = byPerson.get(r.person_id);
    if (!pe) { pe = []; byPerson.set(r.person_id, pe); }
    pe.push(r.event_id);
  }
  return { byEvent, byPerson };
}

function loadAllRelationships(db: Database): Map<string, Array<{ id: string; type: string; subtype: string | null; person1_id: string | null; person2_id: string | null; notes: string }>> {
  type RelRow = { id: string; type: string; subtype: string | null; person1_id: string | null; person2_id: string | null; notes: string };
  const rows = queryAll<RelRow>(db, 'SELECT * FROM relationships');
  // Index by both person1 and person2
  const map = new Map<string, RelRow[]>();
  for (const r of rows) {
    for (const pid of [r.person1_id, r.person2_id]) {
      if (!pid) continue;
      let arr = map.get(pid);
      if (!arr) { arr = []; map.set(pid, arr); }
      arr.push(r);
    }
  }
  return map;
}

function loadAllCitations(db: Database): Citation[] {
  return queryAll<Citation>(db, 'SELECT * FROM citations');
}

function loadAllPlaces(db: Database): Map<string, Place> {
  const rows = queryAll<Place>(db, 'SELECT * FROM places');
  return new Map(rows.map(p => [p.id, p]));
}

function loadAllSources(db: Database): Map<string, Source> {
  const rows = queryAll<Source>(db, 'SELECT * FROM sources');
  return new Map(rows.map(s => [s.id, s]));
}

// ── Generator ───────────────────────────────────────────

export function generateHtmlSite(
  db: Database,
  outputDir: string,
  options?: HtmlSiteOptions,
): HtmlSiteResult {
  const siteTitle = options?.siteTitle ?? 'Family Tree';
  const excludeLiving = options?.excludeLiving ?? false;

  // Create directory structure
  const personsDir = path.join(outputDir, 'persons');
  const placesDir = path.join(outputDir, 'places');
  const sourcesDir = path.join(outputDir, 'sources');
  fs.mkdirSync(personsDir, { recursive: true });
  fs.mkdirSync(placesDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });

  // Write CSS
  fs.writeFileSync(path.join(outputDir, 'style.css'), getSiteCSS(), 'utf-8');

  // ── Bulk load all data ──────────────────────────────

  type PersonRow = { id: string; sex: string; living: boolean; notes: string; given_name?: string; surname?: string };
  let allPersons = queryAll<PersonRow>(db, `
    SELECT p.id, p.sex, p.living, p.notes,
           COALESCE(pn.given_name, '') AS given_name,
           COALESCE(pn.surname, '') AS surname
    FROM persons p
    LEFT JOIN person_names pn
      ON pn.person_id = p.id
      AND pn.sort_order = (SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id)
    ORDER BY pn.surname, pn.given_name
  `);
  if (excludeLiving) {
    allPersons = allPersons.filter(p => !p.living);
  }
  const personIds = new Set(allPersons.map(p => p.id));

  const nameCache = loadAllNames(db);
  const allEventsById = loadAllEvents(db);
  const { byEvent: participantsByEvent, byPerson: eventIdsByPerson } = loadAllEventParticipants(db);
  const relsByPerson = loadAllRelationships(db);
  const allCitations = loadAllCitations(db);
  const placeMap = loadAllPlaces(db);
  const sourceMap = loadAllSources(db);

  // Index citations by person_id and event_id
  const citationsByPerson = groupBy(allCitations.filter(c => c.person_id), c => c.person_id!);
  const citationsByEvent = groupBy(allCitations.filter(c => c.event_id), c => c.event_id!);
  const citationsBySource = groupBy(allCitations, c => c.source_id);

  // Build events-for-person lookup (person_id → GenealogyEvent[])
  const eventsForPerson = new Map<string, GenealogyEvent[]>();
  for (const [personId, eventIds] of eventIdsByPerson) {
    const personEvents: GenealogyEvent[] = [];
    for (const eid of eventIds) {
      const ev = allEventsById.get(eid);
      if (ev && ev.length > 0) personEvents.push(ev[0]);
    }
    eventsForPerson.set(personId, personEvents);
  }

  // ── Person summaries for index ──────────────────────

  const personSummaries: PersonSummary[] = [];
  const birthDateCache = new Map<string, string>();
  const deathDateCache = new Map<string, string>();

  for (const p of allPersons) {
    const personEvents = eventsForPerson.get(p.id) ?? [];
    const birth = personEvents.find(e => e.event_type === 'birth');
    const death = personEvents.find(e => e.event_type === 'death');
    const birthStr = birth ? extractYear(birth) : undefined;
    const deathStr = death ? extractYear(death) : undefined;
    if (birthStr) birthDateCache.set(p.id, birthStr);
    if (deathStr) deathDateCache.set(p.id, deathStr);

    personSummaries.push({
      id: p.id,
      given_name: p.given_name ?? '',
      surname: p.surname ?? '',
      birthDate: birthStr,
      deathDate: deathStr,
    });
  }

  // Write index.html
  fs.writeFileSync(
    path.join(outputDir, 'index.html'),
    indexPage(personSummaries, siteTitle),
    'utf-8',
  );

  // ── Person pages ────────────────────────────────────

  let pageCount = 1; // index.html
  for (const p of allPersons) {
    const names = nameCache.get(p.id) ?? [];
    const personEvents = eventsForPerson.get(p.id) ?? [];

    // Enrich events with place names
    const enrichedEvents = personEvents.map(e => ({
      ...e,
      place_name: e.place_id ? (placeMap.get(e.place_id)?.name ?? '') : undefined,
    }));

    // Get relationships
    const rels = relsByPerson.get(p.id) ?? [];
    const enrichedRels = rels
      .map(r => {
        const otherId = r.person1_id === p.id ? r.person2_id : r.person1_id;
        if (otherId && !personIds.has(otherId)) return null;
        const otherNames = otherId ? (nameCache.get(otherId) ?? []) : [];
        return {
          ...r,
          other_person_id: otherId,
          other_person_name: otherNames.length ? personDisplayName(otherNames) : '(unknown)',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Get citations for this person (direct + via events)
    const directCits = citationsByPerson.get(p.id) ?? [];
    const eventCitIds = new Set(directCits.map(c => c.id));
    const viaCits: Citation[] = [];
    for (const ev of personEvents) {
      for (const c of (citationsByEvent.get(ev.id) ?? [])) {
        if (!eventCitIds.has(c.id)) {
          eventCitIds.add(c.id);
          viaCits.push(c);
        }
      }
    }
    const cits = [...directCits, ...viaCits];
    const enrichedCitations = cits.map(c => ({
      ...c,
      source_title: sourceMap.get(c.source_id)?.title ?? '',
    }));

    const data: PersonPageData = {
      person: p,
      names,
      events: enrichedEvents,
      relationships: enrichedRels,
      citations: enrichedCitations,
    };

    fs.writeFileSync(
      path.join(personsDir, `${p.id}.html`),
      personPage(data, siteTitle),
      'utf-8',
    );
    pageCount++;
  }

  // ── Place pages ─────────────────────────────────────

  const placesWithEvents = queryAll<{ id: string; name: string; place_type: string | null; event_count: number }>(
    db,
    `SELECT p.id, p.name, p.place_type, COUNT(e.id) as event_count
     FROM places p
     JOIN events e ON e.place_id = p.id
     GROUP BY p.id
     HAVING event_count > 0
     ORDER BY p.name`,
    [],
  );

  fs.writeFileSync(
    path.join(outputDir, 'places.html'),
    placesIndexPage(placesWithEvents, siteTitle),
    'utf-8',
  );
  pageCount++;

  // Build events-by-place lookup
  const eventsByPlace = new Map<string, GenealogyEvent[]>();
  for (const [, evts] of allEventsById) {
    for (const e of evts) {
      if (!e.place_id) continue;
      let arr = eventsByPlace.get(e.place_id);
      if (!arr) { arr = []; eventsByPlace.set(e.place_id, arr); }
      arr.push(e);
    }
  }

  for (const placeInfo of placesWithEvents) {
    const place = placeMap.get(placeInfo.id);
    if (!place) continue;

    // Build place path from parent chain (leaf → root, comma-separated)
    const pathParts: string[] = [];
    let cur: Place | undefined = place;
    while (cur) {
      pathParts.push(cur.name);
      cur = cur.parent_place_id ? placeMap.get(cur.parent_place_id) : undefined;
    }
    const placePath = pathParts.join(', ');

    const placeEvents = eventsByPlace.get(placeInfo.id) ?? [];
    // Sort by date
    placeEvents.sort((a, b) => (a.date_value ?? '').localeCompare(b.date_value ?? ''));

    const enrichedPlaceEvents = placeEvents.map(e => {
      const pids = participantsByEvent.get(e.id) ?? [];
      const participantNames = pids
        .filter(pid => personIds.has(pid))
        .map(pid => {
          const n = nameCache.get(pid);
          return n ? personDisplayName(n) : '(unknown)';
        })
        .join(', ');
      return { ...e, participant_names: participantNames };
    });

    const data: PlacePageData = {
      place,
      placePath,
      events: enrichedPlaceEvents,
    };

    fs.writeFileSync(
      path.join(placesDir, `${place.id}.html`),
      placePage(data, siteTitle),
      'utf-8',
    );
    pageCount++;
  }

  // ── Source pages ─────────────────────────────────────

  const sourcesWithCitations = queryAll<{ id: string; title: string; author: string; citation_count: number }>(
    db,
    `SELECT s.id, s.title, s.author, COUNT(c.id) as citation_count
     FROM sources s
     JOIN citations c ON c.source_id = s.id
     GROUP BY s.id
     HAVING citation_count > 0
     ORDER BY s.title`,
    [],
  );

  fs.writeFileSync(
    path.join(outputDir, 'sources.html'),
    sourcesIndexPage(sourcesWithCitations, siteTitle),
    'utf-8',
  );
  pageCount++;

  for (const sourceInfo of sourcesWithCitations) {
    const source = sourceMap.get(sourceInfo.id);
    if (!source) continue;

    const cits = citationsBySource.get(sourceInfo.id) ?? [];
    const enrichedCitations = cits.map((c: Citation) => {
      let personName = '';
      let personId = c.person_id;
      if (personId && nameCache.has(personId)) {
        personName = personDisplayName(nameCache.get(personId)!);
      } else if (c.event_id) {
        const pids = participantsByEvent.get(c.event_id) ?? [];
        const first = pids.find(pid => personIds.has(pid));
        if (first) {
          personId = first;
          personName = personDisplayName(nameCache.get(personId) ?? []);
        }
      }

      let eventType: string | undefined;
      if (c.event_id) {
        const evts = allEventsById.get(c.event_id);
        if (evts && evts.length > 0) eventType = evts[0].event_type;
      }

      return { ...c, person_name: personName, person_id: personId, event_type: eventType };
    });

    const data: SourcePageData = { source, citations: enrichedCitations };

    fs.writeFileSync(
      path.join(sourcesDir, `${source.id}.html`),
      sourcePage(data, siteTitle),
      'utf-8',
    );
    pageCount++;
  }

  // ── Search index ────────────────────────────────────

  const searchEntries: { text: string; url: string; type: string }[] = [];
  for (const p of personSummaries) {
    const name = [p.given_name, p.surname].filter(Boolean).join(' ') || '(unknown)';
    const dates = [p.birthDate, p.deathDate].filter(Boolean).join('-');
    searchEntries.push({
      text: dates ? `${name} (${dates})` : name,
      url: `persons/${p.id}.html`,
      type: 'person',
    });
  }
  for (const pl of placesWithEvents) {
    searchEntries.push({
      text: pl.name,
      url: `places/${pl.id}.html`,
      type: 'place',
    });
  }
  for (const s of sourcesWithCitations) {
    searchEntries.push({
      text: s.title || '(untitled)',
      url: `sources/${s.id}.html`,
      type: 'source',
    });
  }

  fs.writeFileSync(
    path.join(outputDir, 'search.json'),
    JSON.stringify(searchEntries),
    'utf-8',
  );

  fs.writeFileSync(
    path.join(outputDir, 'search.html'),
    searchPage(siteTitle),
    'utf-8',
  );
  pageCount++;

  return {
    pageCount,
    personCount: allPersons.length,
    placeCount: placesWithEvents.length,
    sourceCount: sourcesWithCitations.length,
  };
}

// ── Helpers ──────────────────────────────────────────────

function extractYear(event: GenealogyEvent): string | undefined {
  if (event.date_original) {
    const match = event.date_original.match(/\d{4}/);
    return match ? match[0] : undefined;
  }
  if (event.date_value) {
    const match = event.date_value.match(/\d{4}/);
    return match ? match[0] : undefined;
  }
  return undefined;
}
