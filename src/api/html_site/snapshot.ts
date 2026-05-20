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
  Note,
  NoteLink,
  PersonAssociation,
  NameTranslation,
  PlaceTranslation,
  SourceCoverageEvent,
  Repository,
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
  notes: Note[];
  noteLinks: NoteLink[];
  personAssociations: PersonAssociation[];
  nameTranslations: NameTranslation[];
  placeTranslations: PlaceTranslation[];
  sourceCoverage: SourceCoverageEvent[];
  repositories: Repository[];
  sourceRepositories: { source_id: string; repository_id: string }[];
  settings: Record<string, string>;
}

export async function buildSnapshot(db: Database, opts: SnapshotOptions): Promise<Snapshot> {
  // 1. Compute scope — the set of person IDs to include
  const scopeSet = await computeScope(db, opts.scope);
  const isEveryone = !!opts.scope.everyone;

  // 2. Load supporting tables SEQUENTIALLY. Promise.all was tried and made
  //    things ~70% worse on a 22k-person family.db: every parallel query
  //    grabs the same SQLite connection mutex, so they queue, AND the burst
  //    of 13 mutex-holds starves concurrent quality-check IPCs of any slot.
  //    Sequential awaits let other IPCs interleave naturally between each
  //    queryAll, and the rusqlite `prepare_cached` path makes the per-query
  //    fixed cost cheap.
  const scopeIds = [...scopeSet];
  let persons: Person[] = [];
  if (scopeIds.length > 0) {
    const placeholders = scopeIds.map(() => '?').join(',');
    const rawPersons = await queryAll<Omit<Person, 'living'>>(
      db,
      `SELECT * FROM persons WHERE id IN (${placeholders})`,
      scopeIds,
    );
    const derivation = await loadLivingDerivation(db);
    persons = rawPersons.map(r => ({ ...r, living: isLivingDerived(r.id, derivation) }));
  }

  // 3. Apply excludeLiving / redactLiving
  if (opts.options.excludeLiving) {
    persons = persons.filter(p => !p.living);
  }

  const finalPersonIds = new Set(persons.map(p => p.id));

  const processedPersons = opts.options.redactLiving
    ? persons.map(p => redactPerson(p as any))
    : persons.map(p => ({ ...p, redacted: false }));

  // 4. Load + filter supporting tables. Sequential awaits so other IPCs
  //    (quality checks, list views) can interleave between each load. When
  //    `everyone` is set with no excludeLiving filter, every row in
  //    finalPersonIds matches and the JS-side filter is a no-op cost on top
  //    of the SELECT — short-circuit with a direct assignment.
  const everyoneNoExclude = isEveryone && !opts.options.excludeLiving;

  const allRelationships = await queryAll<Relationship>(db, 'SELECT * FROM relationships');
  const relationships = everyoneNoExclude ? allRelationships : allRelationships.filter(r => {
    const p1ok = !r.person1_id || finalPersonIds.has(r.person1_id);
    const p2ok = !r.person2_id || finalPersonIds.has(r.person2_id);
    return p1ok && p2ok;
  });
  const relationshipIds = new Set(relationships.map(r => r.id));

  const allPersonNames = await queryAll<PersonName>(db, 'SELECT * FROM person_names ORDER BY person_id, sort_order');
  const personNames = everyoneNoExclude ? allPersonNames : allPersonNames.filter(n => finalPersonIds.has(n.person_id));

  const allPersonIdentifiers = await queryAll<PersonIdentifier>(db, 'SELECT * FROM person_identifiers');
  const personIds = everyoneNoExclude ? allPersonIdentifiers : allPersonIdentifiers.filter(i => finalPersonIds.has(i.person_id));

  // Events: include events where at least one in-scope person participates,
  // or events linked to an in-scope relationship.
  const allEventParticipants = await queryAll<EventParticipant>(db, 'SELECT * FROM event_participants');
  const allEvents = await queryAll<GenealogyEvent>(db, 'SELECT * FROM events');

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
  const allPlaces = await queryAll<Place>(db, 'SELECT * FROM places');
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
  const allCitations = await queryAll<Citation>(db, 'SELECT * FROM citations');
  const citations = allCitations.filter(c =>
    (c.event_id && scopedEventIds.has(c.event_id)) ||
    (c.person_id && finalPersonIds.has(c.person_id)) ||
    (c.relationship_id && relationshipIds.has(c.relationship_id)) ||
    (c.place_id && referencedPlaceIds.has(c.place_id))
  );

  // Sources: include those referenced by scoped citations
  const referencedSourceIds = new Set(citations.map(c => c.source_id));
  const allSources = await queryAll<Source>(db, 'SELECT * FROM sources');
  const sources = allSources.filter(s => referencedSourceIds.has(s.id));

  // Media
  let media: Media[] = [];
  let mediaLinks: MediaLink[] = [];
  let mediaRegions: MediaRegion[] = [];

  if (opts.options.includeMedia) {
    const allMediaLinks = await queryAll<MediaLink>(db, 'SELECT * FROM media_links');
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
    const allMedia = await queryAll<Media>(db, 'SELECT * FROM media');
    media = allMedia.filter(m => linkedMediaIds.has(m.id));
    mediaLinks = scopedMediaLinks;
    const allMediaRegions = await queryAll<MediaRegion>(db, 'SELECT * FROM media_regions');
    mediaRegions = allMediaRegions.filter(r => linkedMediaIds.has(r.media_id));
  }

  // Notes + note_links: include notes that link to any in-scope entity (persons,
  // events, relationships, places, sources, repositories, media).
  const allNoteLinks = await queryAll<NoteLink>(db, 'SELECT * FROM note_links');
  const linkedMediaIdsSet = new Set(media.map(m => m.id));
  const scopedNoteLinks = allNoteLinks.filter(nl => {
    switch (nl.entity_type) {
      case 'person': return finalPersonIds.has(nl.entity_id);
      case 'event': return scopedEventIds.has(nl.entity_id);
      case 'relationship': return relationshipIds.has(nl.entity_id);
      case 'place': return referencedPlaceIds.has(nl.entity_id);
      case 'source': return referencedSourceIds.has(nl.entity_id);
      case 'media': return linkedMediaIdsSet.has(nl.entity_id);
      case 'repository': return true; // repositories are global
      case 'family': return relationshipIds.has(nl.entity_id);
      default: return false;
    }
  });
  const scopedNoteIds = new Set(scopedNoteLinks.map(nl => nl.note_id));
  const allNotes = await queryAll<Note>(db, 'SELECT * FROM notes');
  const notes = allNotes.filter(n => scopedNoteIds.has(n.id));

  // Person associations: include when both ends are in scope.
  const allPersonAssociations = await queryAll<PersonAssociation>(db, 'SELECT * FROM person_associations');
  const personAssociations = allPersonAssociations.filter(pa =>
    finalPersonIds.has(pa.person_id) && finalPersonIds.has(pa.related_person_id),
  );

  // Name translations: include for any person_name belonging to a scoped person.
  const scopedPersonNameIds = new Set(personNames.map(n => n.id));
  const allNameTranslations = await queryAll<NameTranslation>(db, 'SELECT * FROM name_translations');
  const nameTranslations = allNameTranslations.filter(nt => scopedPersonNameIds.has(nt.person_name_id));

  // Place translations: include for any in-scope place.
  const allPlaceTranslations = await queryAll<PlaceTranslation>(db, 'SELECT * FROM place_translations');
  const placeTranslations = allPlaceTranslations.filter(pt => referencedPlaceIds.has(pt.place_id));

  // Source coverage events: include for any in-scope source.
  const allSourceCoverage = await queryAll<SourceCoverageEvent>(db, 'SELECT * FROM source_coverage_events');
  const sourceCoverage = allSourceCoverage.filter(sc => referencedSourceIds.has(sc.source_id));

  // Repositories + source_repositories: include all repositories referenced by
  // an in-scope source, plus those that have note_links to in-scope notes.
  const allSourceRepositories = await queryAll<{ source_id: string; repository_id: string }>(
    db,
    'SELECT source_id, repository_id FROM source_repositories',
  );
  const sourceRepositories = allSourceRepositories.filter(sr => referencedSourceIds.has(sr.source_id));
  const referencedRepositoryIds = new Set<string>(sourceRepositories.map(sr => sr.repository_id));
  // Note-linked repositories (repository_id stored in entity_id of repository-typed note_links)
  for (const nl of scopedNoteLinks) {
    if (nl.entity_type === 'repository') referencedRepositoryIds.add(nl.entity_id);
  }
  const allRepositories = await queryAll<Repository>(db, 'SELECT * FROM repositories');
  const repositories = allRepositories.filter(r => referencedRepositoryIds.has(r.id));

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
    notes,
    noteLinks: scopedNoteLinks,
    personAssociations,
    nameTranslations,
    placeTranslations,
    sourceCoverage,
    repositories,
    sourceRepositories,
    settings,
  };
}
