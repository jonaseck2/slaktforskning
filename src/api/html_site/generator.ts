/**
 * Static HTML site generator.
 *
 * Reads all genealogy data from SQLite via the existing api/ functions
 * and writes a self-contained, browsable HTML site to the given directory.
 *
 * This module uses Node.js fs/path but has zero Electron dependencies,
 * consistent with the api/ layer contract.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import * as persons from '../persons';
import * as events from '../events';
import * as sourcesApi from '../sources';
import * as places from '../places';
import * as relationships from '../relationships';
import { queryAll } from '../db';
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
import type { PersonName, GenealogyEvent, Citation } from '../types';

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

  // Get all persons
  let allPersons = persons.listPersons(db);
  if (excludeLiving) {
    allPersons = allPersons.filter(p => !p.living);
  }
  const personIds = new Set(allPersons.map(p => p.id));

  // Build name cache for all persons (for relationship display)
  const nameCache = new Map<string, PersonName[]>();
  for (const p of allPersons) {
    nameCache.set(p.id, persons.getPersonNames(db, p.id));
  }

  // Build person summaries with birth/death dates for the index
  const personSummaries: PersonSummary[] = [];
  const birthDateCache = new Map<string, string>();
  const deathDateCache = new Map<string, string>();

  for (const p of allPersons) {
    const personEvents = events.getEventsForPerson(db, p.id);
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

  // Generate person pages
  let pageCount = 1; // index.html
  for (const p of allPersons) {
    const names = nameCache.get(p.id) ?? [];
    const personEvents = events.getEventsForPerson(db, p.id);

    // Enrich events with place names
    const enrichedEvents = personEvents.map(e => ({
      ...e,
      place_name: e.place_id ? getPlaceNameSafe(db, e.place_id) : undefined,
    }));

    // Get relationships
    const rels = relationships.getRelationshipsOfPerson(db, p.id);
    const enrichedRels = rels
      .map(r => {
        const otherId = r.person1_id === p.id ? r.person2_id : r.person1_id;
        // Skip relationships pointing to excluded persons
        if (otherId && !personIds.has(otherId)) return null;
        const otherNames = otherId ? (nameCache.get(otherId) ?? []) : [];
        return {
          ...r,
          other_person_id: otherId,
          other_person_name: otherNames.length ? personDisplayName(otherNames) : '(unknown)',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Get citations
    const cits = sourcesApi.getCitationsForPerson(db, p.id);
    const enrichedCitations = cits.map(c => ({
      ...c,
      source_title: getSourceTitleSafe(db, c.source_id),
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

  // Get places that have events
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

  // If excluding living, filter out places that only have events from living persons
  // (We still show the place if at least one non-living person has an event there)

  // Write places index
  fs.writeFileSync(
    path.join(outputDir, 'places.html'),
    placesIndexPage(placesWithEvents, siteTitle),
    'utf-8',
  );
  pageCount++;

  // Generate place pages
  for (const placeInfo of placesWithEvents) {
    const place = places.getPlace(db, placeInfo.id);
    if (!place) continue;

    const placePath = places.getPlacePath(db, placeInfo.id);

    // Get events at this place with participant names
    const placeEvents = queryAll<GenealogyEvent>(
      db,
      `SELECT * FROM events WHERE place_id = ? ORDER BY date_value`,
      [placeInfo.id],
    );

    const enrichedPlaceEvents = placeEvents.map(e => {
      const participants = queryAll<{ person_id: string }>(
        db,
        `SELECT person_id FROM event_participants WHERE event_id = ?`,
        [e.id],
      );
      const participantNames = participants
        .filter(ep => personIds.has(ep.person_id))
        .map(ep => {
          const n = nameCache.get(ep.person_id);
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

  // Get sources that have citations
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

  // Write sources index
  fs.writeFileSync(
    path.join(outputDir, 'sources.html'),
    sourcesIndexPage(sourcesWithCitations, siteTitle),
    'utf-8',
  );
  pageCount++;

  // Generate source pages
  for (const sourceInfo of sourcesWithCitations) {
    const source = sourcesApi.getSource(db, sourceInfo.id);
    if (!source) continue;

    const cits = sourcesApi.getCitationsForSource(db, sourceInfo.id);
    const enrichedCitations = cits.map((c: Citation) => {
      // Try to find person name via direct person_id or via event participant
      let personName = '';
      let personId = c.person_id;
      if (personId && nameCache.has(personId)) {
        personName = personDisplayName(nameCache.get(personId)!);
      } else if (c.event_id) {
        const participants = queryAll<{ person_id: string }>(
          db,
          `SELECT person_id FROM event_participants WHERE event_id = ?`,
          [c.event_id],
        );
        const first = participants.find(ep => personIds.has(ep.person_id));
        if (first) {
          personId = first.person_id;
          personName = personDisplayName(nameCache.get(personId) ?? []);
        }
      }

      // Get event type if citation references an event
      let eventType: string | undefined;
      if (c.event_id) {
        const evt = events.getEvent(db, c.event_id);
        if (evt) eventType = evt.event_type;
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

  // Build search index
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

  // Write search page
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

function getPlaceNameSafe(db: Database, placeId: string): string {
  const place = places.getPlace(db, placeId);
  return place?.name ?? '';
}

function getSourceTitleSafe(db: Database, sourceId: string): string {
  const source = sourcesApi.getSource(db, sourceId);
  return source?.title ?? '';
}
