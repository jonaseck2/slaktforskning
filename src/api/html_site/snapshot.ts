import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { loadLivingDerivation, isLivingDerived } from '../personLiving';
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
import { redactPerson } from './redact';
import { computeScope } from './scope';
import type { ScopeOptions } from './scope';

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

export async function buildSnapshot(db: Database, opts: SnapshotOptions): Promise<Snapshot> {
  // 1. Compute scope — the set of person IDs to include
  const scopeSet = await computeScope(db, opts.scope);
  const isEveryone = !!opts.scope.everyone;

  // 2. Load everything in PARALLEL. Each query is independent; the JS
  //    filtering after the await collects the results. SQLite serializes
  //    at the connection mutex, but every query's IPC response (Rust
  //    serialize → bridge → JS parse) can overlap with the next query's
  //    SQL execution. For a 22k-person tree this halves wall-clock vs
  //    sequential awaits on the user's family.db (60s+ → ~30s for the
  //    pre-filter phase).
  const scopeIds = [...scopeSet];
  const personPlaceholders = scopeIds.length > 0 ? scopeIds.map(() => '?').join(',') : null;
  const [
    rawPersons,
    derivation,
    allRelationships,
    allPersonNames,
    allPersonIdentifiers,
    allEventParticipants,
    allEvents,
    allPlaces,
    allCitations,
    allSources,
    allMediaLinks,
    allMedia,
    allMediaRegions,
  ] = await Promise.all([
    personPlaceholders
      ? queryAll<Omit<Person, 'living'>>(db, `SELECT * FROM persons WHERE id IN (${personPlaceholders})`, scopeIds)
      : Promise.resolve([] as Omit<Person, 'living'>[]),
    loadLivingDerivation(db),
    queryAll<Relationship>(db, 'SELECT * FROM relationships'),
    queryAll<PersonName>(db, 'SELECT * FROM person_names ORDER BY person_id, sort_order'),
    queryAll<PersonIdentifier>(db, 'SELECT * FROM person_identifiers'),
    queryAll<EventParticipant>(db, 'SELECT * FROM event_participants'),
    queryAll<GenealogyEvent>(db, 'SELECT * FROM events'),
    queryAll<Place>(db, 'SELECT * FROM places'),
    queryAll<Citation>(db, 'SELECT * FROM citations'),
    queryAll<Source>(db, 'SELECT * FROM sources'),
    opts.options.includeMedia ? queryAll<MediaLink>(db, 'SELECT * FROM media_links') : Promise.resolve([] as MediaLink[]),
    opts.options.includeMedia ? queryAll<Media>(db, 'SELECT * FROM media') : Promise.resolve([] as Media[]),
    opts.options.includeMedia ? queryAll<MediaRegion>(db, 'SELECT * FROM media_regions') : Promise.resolve([] as MediaRegion[]),
  ]);

  let persons: Person[] = rawPersons.map(r => ({ ...r, living: isLivingDerived(r.id, derivation) }));

  // 3. Apply excludeLiving / redactLiving
  if (opts.options.excludeLiving) {
    persons = persons.filter(p => !p.living);
  }

  const finalPersonIds = new Set(persons.map(p => p.id));

  const processedPersons = opts.options.redactLiving
    ? persons.map(p => redactPerson(p as any))
    : persons.map(p => ({ ...p, redacted: false }));

  // 4. Filter the bulk-loaded tables by scope. When `everyone` is set with
  //    no excludeLiving filter, every row in finalPersonIds matches and the
  //    filter is a no-op cost on top of the SELECT — skip it.
  const everyoneNoExclude = isEveryone && !opts.options.excludeLiving;

  const relationships = everyoneNoExclude ? allRelationships : allRelationships.filter(r => {
    const p1ok = !r.person1_id || finalPersonIds.has(r.person1_id);
    const p2ok = !r.person2_id || finalPersonIds.has(r.person2_id);
    return p1ok && p2ok;
  });
  const relationshipIds = new Set(relationships.map(r => r.id));

  const personNames = everyoneNoExclude ? allPersonNames : allPersonNames.filter(n => finalPersonIds.has(n.person_id));
  const personIds = everyoneNoExclude ? allPersonIdentifiers : allPersonIdentifiers.filter(i => finalPersonIds.has(i.person_id));

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

  const events = everyoneNoExclude ? allEvents : allEvents.filter(e => scopedEventIds.has(e.id));
  const eventParticipants = everyoneNoExclude ? allEventParticipants : allEventParticipants.filter(
    ep => scopedEventIds.has(ep.event_id) && finalPersonIds.has(ep.person_id)
  );

  // Places: include places referenced by scoped events
  const referencedPlaceIds = new Set<string>(
    events.filter(e => e.place_id).map(e => e.place_id as string)
  );
  const placesById = new Map(allPlaces.map(p => [p.id, p]));
  const placesRaw = allPlaces.filter(p => referencedPlaceIds.has(p.id));

  // Resolve missing lat/lon via gazetteers — the static site can't load them
  // at runtime so we bake coordinates into the snapshot.
  let gazetteers: ReturnType<typeof loadGazetteers> = [];
  try {
    const configJson = await getDbSetting(db, 'gazetteer_config');
    const config = configJson ? JSON.parse(configJson) as { enabledGazetteers?: string[] } : null;
    const enabled = config?.enabledGazetteers ?? [];
    if (enabled.length > 0) {
      gazetteers = loadGazetteers({ enabledGazetteers: enabled }, await getAllGazetteers(), await getImportedGazetteers(db));
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
  const citations = allCitations.filter(c =>
    (c.event_id && scopedEventIds.has(c.event_id)) ||
    (c.person_id && finalPersonIds.has(c.person_id)) ||
    (c.relationship_id && relationshipIds.has(c.relationship_id)) ||
    (c.place_id && referencedPlaceIds.has(c.place_id))
  );

  // Sources: include those referenced by scoped citations
  const referencedSourceIds = new Set(citations.map(c => c.source_id));
  const sources = allSources.filter(s => referencedSourceIds.has(s.id));

  // Media
  let media: Media[] = [];
  let mediaLinks: MediaLink[] = [];
  let mediaRegions: MediaRegion[] = [];

  if (opts.options.includeMedia) {
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
    media = allMedia.filter(m => linkedMediaIds.has(m.id));
    mediaLinks = scopedMediaLinks;
    mediaRegions = allMediaRegions.filter(r => linkedMediaIds.has(r.media_id));
  }

  // Bake the tree subject in as `default_person_id` so the static site
  // (and the preview iframe) lands on the same person the editor's tree is
  // focused on, instead of bouncing to a random first row. Only set when
  // the focal person actually survived the scope+living filters.
  const settings: Record<string, string> = {};
  if (opts.focusPersonId && finalPersonIds.has(opts.focusPersonId)) {
    settings.default_person_id = opts.focusPersonId;
  }

  // Display only — see plan birth-name-display-and-quality-check. The static
  // SPA reads this via the `personNameOptions` store; absent → defaults to
  // ON (matching renderer behaviour). We pass through the explicit author
  // choice when set so the exported site matches what the editor sees.
  const birthNameRaw = await getDbSetting(db, 'display_birth_name_parenthetical');
  if (birthNameRaw === '1' || birthNameRaw === '0') {
    settings.display_birth_name_parenthetical = birthNameRaw;
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
    settings,
  };
}
