import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { ScopeOptions } from './scope';
import { computeScope } from './scope';
import { redactPerson } from './redact';
import { getDbSetting } from '../db_settings';
import { getImportedGazetteers } from '../gazetteers';
import { getAllGazetteers } from '../place-gazetteers/bundled';
import { loadGazetteers } from '../place-gazetteers/merge';
import { resolvePlace } from '../place-gazetteers/resolver';
import type {
  Person,
  PersonName,
  PersonIdentifier,
  Relationship,
  GenealogyEvent,
  EventParticipant,
  Place,
  Source,
  Citation,
  Media,
  MediaLink,
  MediaRegion,
} from '../types';

export interface SnapshotOptions {
  siteTitle: string;
  focusPersonId: string;
  scope: ScopeOptions;
  options: {
    includeMedia: boolean;
    includeReports: boolean;
    includePrints: boolean;
    excludeLiving: boolean;
    redactLiving: boolean;
    mediaPersonOnly: boolean;
  };
}

export interface Snapshot {
  meta: {
    siteTitle: string;
    focusPersonId: string;
    generatedAt: string;
  };
  persons: (Person & { redacted?: boolean })[];
  personNames: PersonName[];
  personIds: PersonIdentifier[];
  relationships: Relationship[];
  events: GenealogyEvent[];
  eventParticipants: EventParticipant[];
  places: Place[];
  sources: Source[];
  citations: Citation[];
  media: Media[];
  mediaLinks: MediaLink[];
  mediaRegions: MediaRegion[];
  settings: Record<string, string>;
}

export function buildSnapshot(db: Database, opts: SnapshotOptions): Snapshot {
  // 1. Compute scope — the set of person IDs to include
  const scopeSet = computeScope(db, opts.scope);

  // 2. Load all persons in bulk, then filter
  const allPersons = queryAll<Person>(db, 'SELECT * FROM persons');
  let persons = allPersons.filter(p => scopeSet.has(p.id));

  // 3. Apply excludeLiving / redactLiving
  if (opts.options.excludeLiving) {
    persons = persons.filter(p => !p.living);
  }

  const excludedIds = new Set(
    allPersons.filter(p => !scopeSet.has(p.id)).map(p => p.id)
  );
  // Also exclude living persons that were removed by excludeLiving
  if (opts.options.excludeLiving) {
    for (const p of allPersons) {
      if (p.living) excludedIds.add(p.id);
    }
  }

  const finalPersonIds = new Set(persons.map(p => p.id));

  const processedPersons = opts.options.redactLiving
    ? persons.map(p => redactPerson(p as any))
    : persons.map(p => ({ ...p, redacted: false }));

  // 4. Load all supporting tables in bulk, filter by person/relationship scope

  const allRelationships = queryAll<Relationship>(db, 'SELECT * FROM relationships');
  const relationships = allRelationships.filter(r => {
    const p1ok = !r.person1_id || finalPersonIds.has(r.person1_id);
    const p2ok = !r.person2_id || finalPersonIds.has(r.person2_id);
    return p1ok && p2ok;
  });
  const relationshipIds = new Set(relationships.map(r => r.id));

  const allPersonNames = queryAll<PersonName>(db, 'SELECT * FROM person_names ORDER BY person_id, sort_order');
  const personNames = allPersonNames.filter(n => finalPersonIds.has(n.person_id));

  const allPersonIdentifiers = queryAll<PersonIdentifier>(db, 'SELECT * FROM person_identifiers');
  const personIds = allPersonIdentifiers.filter(i => finalPersonIds.has(i.person_id));

  // Events: include events where at least one in-scope person participates,
  // or events linked to an in-scope relationship
  const allEventParticipants = queryAll<EventParticipant>(db, 'SELECT * FROM event_participants');
  const allEvents = queryAll<GenealogyEvent>(db, 'SELECT * FROM events');

  // Find event IDs that are relevant to our scope
  const scopedEventIds = new Set<string>();
  for (const ep of allEventParticipants) {
    if (finalPersonIds.has(ep.person_id)) {
      scopedEventIds.add(ep.event_id);
    }
  }
  for (const e of allEvents) {
    if (e.relationship_id && relationshipIds.has(e.relationship_id)) {
      scopedEventIds.add(e.id);
    }
  }

  const events = allEvents.filter(e => scopedEventIds.has(e.id));
  const eventParticipants = allEventParticipants.filter(
    ep => scopedEventIds.has(ep.event_id) && finalPersonIds.has(ep.person_id)
  );

  // Places: include places referenced by scoped events
  const referencedPlaceIds = new Set<string>(
    events.filter(e => e.place_id).map(e => e.place_id as string)
  );
  const allPlaces = queryAll<Place>(db, 'SELECT * FROM places');
  const placesById = new Map(allPlaces.map(p => [p.id, p]));
  const placesRaw = allPlaces.filter(p => referencedPlaceIds.has(p.id));

  // Resolve missing lat/lon via gazetteers — the static site can't load them
  // at runtime so we bake coordinates into the snapshot.
  let gazetteers: ReturnType<typeof loadGazetteers> = [];
  try {
    const configJson = getDbSetting(db, 'gazetteer_config');
    const config = configJson ? JSON.parse(configJson) as { enabledGazetteers?: string[] } : null;
    const enabled = config?.enabledGazetteers ?? [];
    if (enabled.length > 0) {
      gazetteers = loadGazetteers({ enabledGazetteers: enabled }, getAllGazetteers(), getImportedGazetteers(db));
    }
  } catch {
    // If gazetteer loading fails for any reason, ship places without resolved coords.
    gazetteers = [];
  }

  const places: Place[] = placesRaw.map(p => {
    if (p.latitude != null && p.longitude != null) return p;
    if (gazetteers.length === 0) return p;
    // Build "Place, Parent, Grandparent" string for the resolver
    const parts: string[] = [p.name];
    let cur = p.parent_place_id;
    while (cur) {
      const parent = placesById.get(cur);
      if (!parent) break;
      parts.push(parent.name);
      cur = parent.parent_place_id;
    }
    const resolved = resolvePlace(parts.join(', '), gazetteers);
    if (!resolved) return p;
    return { ...p, latitude: resolved.lat, longitude: resolved.lon };
  });

  // Citations: include those linked to scoped events/persons/relationships
  const allCitations = queryAll<Citation>(db, 'SELECT * FROM citations');
  const citations = allCitations.filter(c =>
    (c.event_id && scopedEventIds.has(c.event_id)) ||
    (c.person_id && finalPersonIds.has(c.person_id)) ||
    (c.relationship_id && relationshipIds.has(c.relationship_id)) ||
    (c.place_id && referencedPlaceIds.has(c.place_id))
  );

  // Sources: include those referenced by scoped citations
  const referencedSourceIds = new Set(citations.map(c => c.source_id));
  const allSources = queryAll<Source>(db, 'SELECT * FROM sources');
  const sources = allSources.filter(s => referencedSourceIds.has(s.id));

  // Media
  let media: Media[] = [];
  let mediaLinks: MediaLink[] = [];
  let mediaRegions: MediaRegion[] = [];

  if (opts.options.includeMedia) {
    const allMediaLinks = queryAll<MediaLink>(db, 'SELECT * FROM media_links');
    const scopedMediaLinks = allMediaLinks.filter(ml => {
      if (ml.entity_type === 'person') return finalPersonIds.has(ml.entity_id);
      if (opts.options.mediaPersonOnly) return false;
      if (ml.entity_type === 'event') return scopedEventIds.has(ml.entity_id);
      if (ml.entity_type === 'relationship') return relationshipIds.has(ml.entity_id);
      if (ml.entity_type === 'place') return referencedPlaceIds.has(ml.entity_id);
      if (ml.entity_type === 'source') return referencedSourceIds.has(ml.entity_id);
      return false;
    });
    // When mediaPersonOnly is set, also drop media that has zero person links
    // even if it has links to other entities (otherwise it'd be exported with
    // no link metadata, leaving an orphan file).
    const linkedMediaIds = new Set(scopedMediaLinks.map(ml => ml.media_id));
    const allMedia = queryAll<Media>(db, 'SELECT * FROM media');
    media = allMedia.filter(m => linkedMediaIds.has(m.id));
    mediaLinks = scopedMediaLinks;

    const allMediaRegions = queryAll<MediaRegion>(db, 'SELECT * FROM media_regions');
    mediaRegions = allMediaRegions.filter(r => linkedMediaIds.has(r.media_id));
  }

  return {
    meta: {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId,
      generatedAt: new Date().toISOString(),
    },
    persons: processedPersons,
    personNames,
    personIds,
    relationships,
    events,
    eventParticipants,
    places,
    sources,
    citations,
    media,
    mediaLinks,
    mediaRegions,
    settings: {},
  };
}
