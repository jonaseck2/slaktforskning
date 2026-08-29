import lunr from 'lunr';
import type { Snapshot } from '../api/html_site/snapshot';
import type {
  GenealogyEvent,
  Media,
  MediaRegion,
  Place,
  Relationship,
  Source,
  Citation,
  Note,
  NoteLink,
  PersonAssociation,
  NameTranslation,
  PlaceTranslation,
  SourceCoverageEvent,
  Repository,
} from '../api/types';

// Builds rich indices once from the snapshot for O(1) lookups.
interface Indices {
  personById: Map<string, Snapshot['persons'][number]>;
  namesByPerson: Map<string, Snapshot['personNames']>;
  idsByPerson: Map<string, Snapshot['personIds']>;
  placeById: Map<string, Place>;
  eventById: Map<string, GenealogyEvent>;
  eventsByPerson: Map<string, GenealogyEvent[]>;
  eventsByRelationship: Map<string, GenealogyEvent[]>;
  eventsByPlace: Map<string, GenealogyEvent[]>;
  sourceById: Map<string, Source>;
  citationsByPerson: Map<string, Citation[]>;
  citationsByEvent: Map<string, Citation[]>;
  citationsByPlace: Map<string, Citation[]>;
  citationsByRelationship: Map<string, Citation[]>;
  citationsBySource: Map<string, Citation[]>;
  citationsByPersonName: Map<string, Citation[]>;
  relationshipsByPerson: Map<string, Relationship[]>;
  mediaById: Map<string, Media>;
  mediaLinksByEntity: Map<string, (Media & { link_id: string; link_type: string | null; sort_order: number })[]>;
  mediaLinksByMedia: Map<string, { entity_type: string; entity_id: string }[]>;
  mediaLinkCounts: Map<string, number>;
  regionsByMedia: Map<string, MediaRegion[]>;
  regionsByPerson: Map<string, MediaRegion[]>;
  participantsByEvent: Map<string, Snapshot['eventParticipants']>;
  participantsByPerson: Map<string, Snapshot['eventParticipants']>;
  searchIndex: lunr.Index;
}

function buildIndices(s: Snapshot): Indices {
  const personById = new Map(s.persons.map(p => [p.id, p]));

  const namesByPerson = new Map<string, Snapshot['personNames']>();
  for (const n of s.personNames) {
    const list = namesByPerson.get(n.person_id) ?? [];
    list.push(n);
    namesByPerson.set(n.person_id, list);
  }

  const idsByPerson = new Map<string, Snapshot['personIds']>();
  for (const i of s.personIds) {
    const list = idsByPerson.get(i.person_id) ?? [];
    list.push(i);
    idsByPerson.set(i.person_id, list);
  }

  const placeById = new Map(s.places.map(p => [p.id, p]));
  const eventById = new Map(s.events.map(e => [e.id, e]));

  const eventsByPerson = new Map<string, GenealogyEvent[]>();
  const participantsByEvent = new Map<string, Snapshot['eventParticipants']>();
  const participantsByPerson = new Map<string, Snapshot['eventParticipants']>();
  for (const ep of s.eventParticipants) {
    const event = eventById.get(ep.event_id);
    if (event) {
      const list = eventsByPerson.get(ep.person_id) ?? [];
      list.push(event);
      eventsByPerson.set(ep.person_id, list);
    }
    const evList = participantsByEvent.get(ep.event_id) ?? [];
    evList.push(ep);
    participantsByEvent.set(ep.event_id, evList);
    const peList = participantsByPerson.get(ep.person_id) ?? [];
    peList.push(ep);
    participantsByPerson.set(ep.person_id, peList);
  }

  const eventsByRelationship = new Map<string, GenealogyEvent[]>();
  const eventsByPlace = new Map<string, GenealogyEvent[]>();
  for (const e of s.events) {
    if (e.relationship_id) {
      const list = eventsByRelationship.get(e.relationship_id) ?? [];
      list.push(e);
      eventsByRelationship.set(e.relationship_id, list);
    }
    if (e.place_id) {
      const list = eventsByPlace.get(e.place_id) ?? [];
      list.push(e);
      eventsByPlace.set(e.place_id, list);
    }
  }

  const sourceById = new Map(s.sources.map(src => [src.id, src]));

  const citationsByPerson = new Map<string, Citation[]>();
  const citationsByEvent = new Map<string, Citation[]>();
  const citationsByPlace = new Map<string, Citation[]>();
  const citationsByRelationship = new Map<string, Citation[]>();
  const citationsBySource = new Map<string, Citation[]>();
  const citationsByPersonName = new Map<string, Citation[]>();
  for (const c of s.citations) {
    if (c.person_id) {
      const list = citationsByPerson.get(c.person_id) ?? [];
      list.push(c);
      citationsByPerson.set(c.person_id, list);
    }
    if (c.event_id) {
      const list = citationsByEvent.get(c.event_id) ?? [];
      list.push(c);
      citationsByEvent.set(c.event_id, list);
    }
    if (c.place_id) {
      const list = citationsByPlace.get(c.place_id) ?? [];
      list.push(c);
      citationsByPlace.set(c.place_id, list);
    }
    if (c.relationship_id) {
      const list = citationsByRelationship.get(c.relationship_id) ?? [];
      list.push(c);
      citationsByRelationship.set(c.relationship_id, list);
    }
    if (c.person_name_id) {
      const list = citationsByPersonName.get(c.person_name_id) ?? [];
      list.push(c);
      citationsByPersonName.set(c.person_name_id, list);
    }
    const srcList = citationsBySource.get(c.source_id) ?? [];
    srcList.push(c);
    citationsBySource.set(c.source_id, srcList);
  }

  const relationshipsByPerson = new Map<string, Relationship[]>();
  for (const r of s.relationships) {
    if (r.person1_id) {
      const list = relationshipsByPerson.get(r.person1_id) ?? [];
      list.push(r);
      relationshipsByPerson.set(r.person1_id, list);
    }
    if (r.person2_id && r.person2_id !== r.person1_id) {
      const list = relationshipsByPerson.get(r.person2_id) ?? [];
      list.push(r);
      relationshipsByPerson.set(r.person2_id, list);
    }
  }

  const mediaById = new Map(s.media.map(m => [m.id, m]));

  const mediaLinksByEntity = new Map<string, (Media & { link_id: string; link_type: string | null; sort_order: number })[]>();
  const mediaLinksByMedia = new Map<string, { entity_type: string; entity_id: string }[]>();
  const mediaLinkCounts = new Map<string, number>();
  for (const ml of s.mediaLinks) {
    const media = mediaById.get(ml.media_id);
    if (!media) continue;
    const key = `${ml.entity_type}:${ml.entity_id}`;
    const list = mediaLinksByEntity.get(key) ?? [];
    list.push({ ...media, link_id: ml.id, link_type: ml.link_type ?? null, sort_order: ml.sort_order });
    mediaLinksByEntity.set(key, list);
    const mlist = mediaLinksByMedia.get(ml.media_id) ?? [];
    mlist.push({ entity_type: ml.entity_type, entity_id: ml.entity_id });
    mediaLinksByMedia.set(ml.media_id, mlist);
    mediaLinkCounts.set(ml.media_id, (mediaLinkCounts.get(ml.media_id) ?? 0) + 1);
  }
  // Sort by sort_order so the first link is the profile pic
  for (const list of mediaLinksByEntity.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  const regionsByMedia = new Map<string, MediaRegion[]>();
  const regionsByPerson = new Map<string, MediaRegion[]>();
  for (const r of s.mediaRegions) {
    const ml = regionsByMedia.get(r.media_id) ?? [];
    ml.push(r);
    regionsByMedia.set(r.media_id, ml);
    if (r.person_id) {
      const pl = regionsByPerson.get(r.person_id) ?? [];
      pl.push(r);
      regionsByPerson.set(r.person_id, pl);
    }
  }

  const searchIndex = lunr(function () {
    this.ref('id');
    this.field('given_name');
    this.field('surname');
    for (const p of s.persons) {
      const name = namesByPerson.get(p.id)?.[0];
      this.add({ id: p.id, given_name: name?.given_name ?? '', surname: name?.surname ?? '' });
    }
  });

  return {
    personById, namesByPerson, idsByPerson, placeById, eventById,
    eventsByPerson, eventsByRelationship, eventsByPlace,
    sourceById, citationsByPerson, citationsByEvent, citationsByPlace, citationsByRelationship, citationsBySource, citationsByPersonName,
    relationshipsByPerson, mediaById, mediaLinksByEntity, mediaLinksByMedia, mediaLinkCounts,
    regionsByMedia, regionsByPerson, participantsByEvent, participantsByPerson, searchIndex,
  };
}

// Resolve a media file to its exported URL — files are renamed to `${id}${ext}` on export.
function mediaUrl(m: Media | undefined): string | null {
  if (!m?.file_ref) return null;
  const ext = m.file_ref.match(/\.[^./\\]+$/)?.[0] ?? '';
  return `./media/full/${m.id}${ext}`;
}

// Filter+sort helpers that mirror the SQL behavior of listPage on the main side.
// Static mode loads everything in memory anyway, but applying filter/sort here
// keeps the listPage semantics consistent across modes.
type PersonRow = Snapshot['persons'][number] & { given_name: string; surname: string };
function filterAndSortPersons(rows: PersonRow[], sortBy?: string, sortDir?: string, query?: string): PersonRow[] {
  const tokens = (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = tokens.length === 0 ? rows : rows.filter(p => {
    const haystack = `${p.given_name} ${p.surname}`.toLowerCase();
    return tokens.every(t => haystack.includes(t));
  });
  const dir = sortDir === 'desc' ? -1 : 1;
  const key = (sortBy as 'surname' | 'given_name' | 'birth_date') ?? 'surname';
  const out = [...filtered];
  out.sort((a, b) => {
    const av = (key === 'given_name' ? a.given_name : a.surname).toLowerCase();
    const bv = (key === 'given_name' ? b.given_name : b.surname).toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return out;
}

function filterAndSortPlaces(rows: Place[], sortBy?: string, sortDir?: string, query?: string): Place[] {
  const q = (query ?? '').trim().toLowerCase();
  const filtered = !q ? rows : rows.filter(p =>
    (p.name ?? '').toLowerCase().includes(q) ||
    (p.city ?? '').toLowerCase().includes(q) ||
    (p.country ?? '').toLowerCase().includes(q)
  );
  const dir = sortDir === 'desc' ? -1 : 1;
  const key = (sortBy as 'name' | 'place_type') ?? 'name';
  const out = [...filtered];
  out.sort((a, b) => {
    const av = (key === 'place_type' ? a.place_type ?? '' : a.name ?? '').toLowerCase();
    const bv = (key === 'place_type' ? b.place_type ?? '' : b.name ?? '').toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return out;
}

function filterAndSortSources(rows: Source[], sortBy?: string, sortDir?: string, query?: string): Source[] {
  const q = (query ?? '').trim().toLowerCase();
  const filtered = !q ? rows : rows.filter(s =>
    (s.title ?? '').toLowerCase().includes(q) ||
    (s.author ?? '').toLowerCase().includes(q) ||
    (s.publication_info ?? '').toLowerCase().includes(q)
  );
  const dir = sortDir === 'desc' ? -1 : 1;
  const key = (sortBy as 'title' | 'author' | 'source_type') ?? 'title';
  const out = [...filtered];
  out.sort((a, b) => {
    const av = ((a as unknown as Record<string, string>)[key] ?? '').toLowerCase();
    const bv = ((b as unknown as Record<string, string>)[key] ?? '').toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return out;
}

type MediaListFiltersStub = {
  type?: 'image' | 'document' | 'audio' | 'video';
  status?: 'missing' | 'orphan';
  faceTag?: 'tagged' | 'untagged';
};

const STATIC_MEDIA_TYPE_FORMATS: Record<NonNullable<MediaListFiltersStub['type']>, Set<string>> = {
  image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'heic', 'heif']),
  document: new Set(['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md']),
  audio: new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']),
  video: new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv']),
};

function filterAndSortMedia(
  rows: Media[],
  sortBy: string | undefined,
  sortDir: string | undefined,
  query: string | undefined,
  filters: MediaListFiltersStub | undefined,
  ctx: { linkCounts: Map<string, number>; faceTagged: Set<string> },
): Media[] {
  const q = (query ?? '').trim().toLowerCase();
  let filtered = !q ? rows : rows.filter(m =>
    (m.title ?? '').toLowerCase().includes(q) ||
    ((m as unknown as { notes?: string }).notes ?? '').toLowerCase().includes(q) ||
    (m.format ?? '').toLowerCase().includes(q) ||
    (m.file_ref ?? '').toLowerCase().includes(q)
  );
  if (filters?.type) {
    const exts = STATIC_MEDIA_TYPE_FORMATS[filters.type];
    filtered = filtered.filter(m => exts.has((m.format ?? '').toLowerCase()));
  }
  if (filters?.status === 'orphan') {
    filtered = filtered.filter(m => (ctx.linkCounts.get(m.id) ?? 0) === 0);
  }
  // 'missing' is a no-op in static mode (snapshot has no is_missing flag).
  if (filters?.faceTag === 'tagged') {
    filtered = filtered.filter(m => ctx.faceTagged.has(m.id));
  } else if (filters?.faceTag === 'untagged') {
    filtered = filtered.filter(m => !ctx.faceTagged.has(m.id));
  }
  const dir = sortDir === 'desc' ? -1 : 1;
  const key = (sortBy as 'title' | 'format' | 'created_at') ?? 'title';
  const out = [...filtered];
  out.sort((a, b) => {
    const av = ((a as unknown as Record<string, string>)[key] ?? '').toLowerCase();
    const bv = ((b as unknown as Record<string, string>)[key] ?? '').toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildStaticApi(snapshot: Snapshot): Record<string, any> {
  const idx = buildIndices(snapshot);

  // Backward-compat: older snapshots predate T26/T27 and don't carry the
  // new tables. Default each to [] so the static SPA mounts cleanly against
  // any vintage of exported site.
  const notesData: Note[] = snapshot.notes ?? [];
  const noteLinksData: NoteLink[] = snapshot.noteLinks ?? [];
  const personAssociationsData: PersonAssociation[] = snapshot.personAssociations ?? [];
  const nameTranslationsData: NameTranslation[] = snapshot.nameTranslations ?? [];
  const placeTranslationsData: PlaceTranslation[] = snapshot.placeTranslations ?? [];
  const sourceCoverageData: SourceCoverageEvent[] = snapshot.sourceCoverage ?? [];
  const repositoriesData: Repository[] = snapshot.repositories ?? [];
  const sourceRepositoriesData: { source_id: string; repository_id: string }[] =
    snapshot.sourceRepositories ?? [];

  // Indices for the new tables
  const notesById = new Map(notesData.map(n => [n.id, n]));
  const noteLinksByEntity = new Map<string, NoteLink[]>();
  const noteLinksByNote = new Map<string, NoteLink[]>();
  for (const nl of noteLinksData) {
    const key = `${nl.entity_type}:${nl.entity_id}`;
    const list = noteLinksByEntity.get(key) ?? [];
    list.push(nl);
    noteLinksByEntity.set(key, list);
    const byNote = noteLinksByNote.get(nl.note_id) ?? [];
    byNote.push(nl);
    noteLinksByNote.set(nl.note_id, byNote);
  }
  const personAssociationsByPerson = new Map<string, PersonAssociation[]>();
  const personAssociationsToPerson = new Map<string, PersonAssociation[]>();
  for (const pa of personAssociationsData) {
    const a = personAssociationsByPerson.get(pa.person_id) ?? [];
    a.push(pa);
    personAssociationsByPerson.set(pa.person_id, a);
    const b = personAssociationsToPerson.get(pa.related_person_id) ?? [];
    b.push(pa);
    personAssociationsToPerson.set(pa.related_person_id, b);
  }
  const nameTranslationsByName = new Map<string, NameTranslation[]>();
  for (const nt of nameTranslationsData) {
    const list = nameTranslationsByName.get(nt.person_name_id) ?? [];
    list.push(nt);
    nameTranslationsByName.set(nt.person_name_id, list);
  }
  const placeTranslationsByPlace = new Map<string, PlaceTranslation[]>();
  for (const pt of placeTranslationsData) {
    const list = placeTranslationsByPlace.get(pt.place_id) ?? [];
    list.push(pt);
    placeTranslationsByPlace.set(pt.place_id, list);
  }
  const sourceCoverageBySource = new Map<string, SourceCoverageEvent[]>();
  for (const sc of sourceCoverageData) {
    const list = sourceCoverageBySource.get(sc.source_id) ?? [];
    list.push(sc);
    sourceCoverageBySource.set(sc.source_id, list);
  }
  const repositoriesById = new Map(repositoriesData.map(r => [r.id, r]));
  const repositoriesBySource = new Map<string, Repository[]>();
  const sourcesByRepository = new Map<string, string[]>();
  for (const sr of sourceRepositoriesData) {
    const repo = repositoriesById.get(sr.repository_id);
    if (repo) {
      const list = repositoriesBySource.get(sr.source_id) ?? [];
      list.push(repo);
      repositoriesBySource.set(sr.source_id, list);
    }
    const srcList = sourcesByRepository.get(sr.repository_id) ?? [];
    srcList.push(sr.source_id);
    sourcesByRepository.set(sr.repository_id, srcList);
  }

  const personsWithNames = snapshot.persons.map(p => {
    const name = idx.namesByPerson.get(p.id)?.[0];
    return { ...p, given_name: name?.given_name ?? '', surname: name?.surname ?? '' };
  });

  const noop = async () => null;
  const noopFalse = async () => false;
  const noopVoid = async () => {};

  const persons = {
    list: async () => personsWithNames,
    listPage: async (limit: number, offset: number, sortBy?: string, sortDir?: string, query?: string) => {
      const filtered = filterAndSortPersons(personsWithNames, sortBy, sortDir, query);
      return {
        persons: filtered.slice(offset, offset + limit),
        total: filtered.length,
      };
    },
    get: async (id: string) => idx.personById.get(id) ?? null,
    getNames: async (id: string) => idx.namesByPerson.get(id) ?? [],
    getIdentifiers: async (id: string) => idx.idsByPerson.get(id) ?? [],
    search: async (q: string) => {
      try {
        const hits = idx.searchIndex.search(q + '*');
        return hits.map(h => personsWithNames.find(p => p.id === h.ref)).filter(Boolean);
      } catch { return []; }
    },
    searchWithDetails: async (q: string) => {
      try {
        const hits = idx.searchIndex.search(q + '*');
        return hits.map(h => personsWithNames.find(p => p.id === h.ref)).filter(Boolean);
      } catch { return []; }
    },
    listUnsourcedPage: async () => ({ persons: [], total: 0 }),
    refreshQualityIssueCounts: noopVoid,
    getQualityIssueCounts: async (personIds: string[]) => {
      const out: Record<string, number> = {};
      for (const id of personIds) out[id] = 0;
      return out;
    },
    create: noop, createWithEvent: noop, update: noop, delete: noopFalse,
    addName: noop, updateName: noop, deleteName: noopFalse,
    addIdentifier: noop, deleteIdentifier: noopFalse,
  };

  const places = {
    list: async () => snapshot.places,
    listPage: async (limit: number, offset: number, sortBy?: string, sortDir?: string, query?: string) => {
      const filtered = filterAndSortPlaces(snapshot.places, sortBy, sortDir, query);
      return {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
      };
    },
    get: async (id: string) => idx.placeById.get(id) ?? null,
    search: async (q: string) => {
      const ql = q.toLowerCase();
      return snapshot.places.filter(p => p.name.toLowerCase().includes(ql));
    },
    getPath: async (id: string) => {
      const path: Place[] = [];
      let cur = idx.placeById.get(id);
      while (cur) {
        path.unshift(cur);
        cur = cur.parent_place_id ? idx.placeById.get(cur.parent_place_id) : undefined;
      }
      return path;
    },
    listChildren: async (parentId: string | null) => {
      const all = parentId === null
        ? snapshot.places.filter(p => !p.parent_place_id)
        : snapshot.places.filter(p => p.parent_place_id === parentId);
      const childMap = new Map<string | null, number>();
      for (const p of snapshot.places) {
        const k = p.parent_place_id ?? null;
        childMap.set(k, (childMap.get(k) ?? 0) + 1);
      }
      return all
        .map(p => ({ ...p, hasChildren: (childMap.get(p.id) ?? 0) > 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    getAncestors: async (id: string) => {
      const out: Place[] = [];
      let cur = idx.placeById.get(id);
      let depth = 0;
      while (cur && depth < 32) {
        out.push(cur);
        cur = cur.parent_place_id ? idx.placeById.get(cur.parent_place_id) : undefined;
        depth++;
      }
      return out.reverse();
    },
    getPersons: async (placeId: string) => {
      const events = idx.eventsByPlace.get(placeId) ?? [];
      const out: { person_id: string; given_name: string; surname: string; event_type: string; event_date: string | null }[] = [];
      for (const e of events) {
        const parts = idx.participantsByEvent.get(e.id) ?? [];
        for (const ep of parts) {
          const name = idx.namesByPerson.get(ep.person_id)?.[0];
          out.push({
            person_id: ep.person_id,
            given_name: name?.given_name ?? '',
            surname: name?.surname ?? '',
            event_type: e.event_type,
            event_date: e.date_value,
          });
        }
      }
      return out;
    },
    findOrCreate: noop, findOrCreateWithChain: noop, create: noop, update: noop, delete: noopFalse,
  };

  const events = {
    get: async (id: string) => idx.eventById.get(id) ?? null,
    forPerson: async (personId: string) => idx.eventsByPerson.get(personId) ?? [],
    forRelationship: async (relationshipId: string) => idx.eventsByRelationship.get(relationshipId) ?? [],
    forPlace: async (placeId: string) => idx.eventsByPlace.get(placeId) ?? [],
    create: noop, update: noop, delete: noopFalse,
  };

  const eventParticipants = {
    getForEvent: async (eventId: string) => idx.participantsByEvent.get(eventId) ?? [],
    add: noop, update: noop, remove: noopFalse,
  };

  const sources = {
    list: async () => snapshot.sources,
    listPage: async (limit: number, offset: number, sortBy?: string, sortDir?: string, query?: string) => {
      const filtered = filterAndSortSources(snapshot.sources, sortBy, sortDir, query);
      return {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
      };
    },
    get: async (id: string) => idx.sourceById.get(id) ?? null,
    search: async (q: string) => {
      const ql = q.toLowerCase();
      return snapshot.sources.filter(s => s.title && s.title.toLowerCase().includes(ql));
    },
    create: noop, update: noop, delete: noopFalse,
  };

  const citations = {
    get: async (id: string) => snapshot.citations.find(c => c.id === id) ?? null,
    forSource: async (sourceId: string) => idx.citationsBySource.get(sourceId) ?? [],
    forEvent: async (eventId: string) => idx.citationsByEvent.get(eventId) ?? [],
    forPerson: async (personId: string) => idx.citationsByPerson.get(personId) ?? [],
    forRelationship: async (relationshipId: string) => idx.citationsByRelationship.get(relationshipId) ?? [],
    forPlace: async (placeId: string) => idx.citationsByPlace.get(placeId) ?? [],
    forPersonName: async (personNameId: string) => idx.citationsByPersonName.get(personNameId) ?? [],
    create: noop, update: noop, delete: noopFalse,
  };

  const relationships = {
    list: async () => snapshot.relationships,
    listPage: async (limit: number, offset: number) => ({
      relationships: snapshot.relationships.slice(offset, offset + limit),
      total: snapshot.relationships.length,
    }),
    get: async (id: string) => snapshot.relationships.find(r => r.id === id) ?? null,
    getForPerson: async (personId: string) => idx.relationshipsByPerson.get(personId) ?? [],
    search: async (): Promise<never[]> => [],
    create: noop, update: noop, delete: noopFalse,
  };

  const groups = {
    list: async (): Promise<never[]> => [],
    get: noop,
    getMembers: async (): Promise<never[]> => [],
    forPerson: async (): Promise<never[]> => [],
    forPlace: async (): Promise<never[]> => [],
    forMedia: async (): Promise<never[]> => [],
    create: noop, update: noop, delete: noopFalse, addMember: noop, removeMember: noopFalse,
    addLink: noop, removeLink: noopFalse, removeLinkByEntity: noopFalse, getLinks: async (): Promise<never[]> => [],
  };

  const repositories = {
    list: async () => repositoriesData,
    listPage: async (limit: number, offset: number, _sortBy?: string, _sortDir?: string, query?: string) => {
      const q = (query ?? '').trim().toLowerCase();
      const filtered = !q ? repositoriesData : repositoriesData.filter(r =>
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q) ||
        (r.country ?? '').toLowerCase().includes(q),
      );
      const out = [...filtered].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      return { items: out.slice(offset, offset + limit), total: out.length };
    },
    get: async (id: string) => repositoriesById.get(id) ?? null,
    forSource: async (sourceId: string) => repositoriesBySource.get(sourceId) ?? [],
    forRepository: async (repoId: string) => {
      const srcIds = sourcesByRepository.get(repoId) ?? [];
      return srcIds.map(id => idx.sourceById.get(id)).filter(Boolean);
    },
    create: noop, update: noop, delete: noopFalse, linkSource: noop, unlinkSource: noopFalse,
  };

  const notes = {
    list: async () => notesData,
    get: async (id: string) => notesById.get(id) ?? null,
    forEntity: async (entityType: string, entityId: string) => {
      const links = noteLinksByEntity.get(`${entityType}:${entityId}`) ?? [];
      return links.map(l => notesById.get(l.note_id)).filter(Boolean) as Note[];
    },
    create: noop, update: noop, delete: noopFalse,
  };

  const noteLinks = {
    link: noop, unlink: noopFalse,
    forNote: async (noteId: string) => noteLinksByNote.get(noteId) ?? [],
  };

  const personAssociations = {
    create: noop,
    get: async (id: string) => personAssociationsData.find(pa => pa.id === id) ?? null,
    forPerson: async (personId: string) => personAssociationsByPerson.get(personId) ?? [],
    toPerson: async (personId: string) => personAssociationsToPerson.get(personId) ?? [],
    update: noop, delete: noopFalse,
  };

  const nameTranslations = {
    forName: async (personNameId: string) => nameTranslationsByName.get(personNameId) ?? [],
    create: noop, update: noop, delete: noopFalse,
  };

  const placeTranslations = {
    forPlace: async (placeId: string) => placeTranslationsByPlace.get(placeId) ?? [],
    create: noop, update: noop, delete: noopFalse,
  };

  const sourceCoverage = {
    get: async (id: string) => sourceCoverageData.find(sc => sc.id === id) ?? null,
    forSource: async (sourceId: string) => sourceCoverageBySource.get(sourceId) ?? [],
    create: noop, update: noop, delete: noopFalse,
  };

  // FK-only Source ↔ Repository link table — exposed for any consumer that
  // wants the raw join rows (matches the IPC `sourceRepositories.*` namespace
  // in tauri-window-api.ts).
  const sourceRepositories = {
    forSource: async (sourceId: string) => repositoriesBySource.get(sourceId) ?? [],
    forRepository: async (repoId: string) => {
      const srcIds = sourcesByRepository.get(repoId) ?? [];
      return srcIds.map(id => idx.sourceById.get(id)).filter(Boolean);
    },
  };

  const researchTasks = {
    list: async (): Promise<never[]> => [],
    get: noop,
    forPerson: async (): Promise<never[]> => [],
    forPlace: async (): Promise<never[]> => [],
    forMedia: async (): Promise<never[]> => [],
    create: noop, update: noop, delete: noopFalse,
    addLink: noop, removeLink: noopFalse, getLinks: async (): Promise<never[]> => [],
  };

  const reports = {
    personSummary: noop,
    familyUnit: noop,
    ancestorTree: noop,
    placeHistory: noop,
    researchGaps: noop,
    timeline: async (_personId: string, _options?: { includeChildrenMarriages?: boolean; includeSiblingDeaths?: boolean }) => [],
    aliveInYear: async (year: number) => ({ year, persons: [] }),
  };

  const checks = {
    runAll: async () => null,
    forPerson: async (): Promise<never[]> => [],
    forPlace: async (): Promise<never[]> => [],
    forMedia: async (): Promise<never[]> => [],
    runForEvent: async (): Promise<never[]> => [],
  };

  const media = {
    list: async () => snapshot.media,
    listPage: async (limit: number, offset: number, sortBy?: string, sortDir?: string, query?: string, filters?: MediaListFiltersStub) => {
      const faceTagged = new Set(idx.regionsByMedia.keys());
      const filtered = filterAndSortMedia(snapshot.media, sortBy, sortDir, query, filters, {
        linkCounts: idx.mediaLinkCounts,
        faceTagged,
      });
      return {
        items: filtered.slice(offset, offset + limit).map(m => ({
          ...m,
          is_missing: 0,
          link_count: idx.mediaLinkCounts.get(m.id) ?? 0,
          face_tag_count: idx.regionsByMedia.get(m.id)?.length ?? 0,
        })),
        total: filtered.length,
        total_missing: 0,
      };
    },
    get: async (id: string) => idx.mediaById.get(id) ?? null,
    forEntity: async (entityType: string, entityId: string) =>
      idx.mediaLinksByEntity.get(`${entityType}:${entityId}`) ?? [],
    linksForMedia: async (mediaId: string) => idx.mediaLinksByMedia.get(mediaId) ?? [],
    readAsDataUrl: async (mediaId: string) => {
      // In the website-export preview, the main process inlines a small
      // subset of resized thumbnails into snapshot.meta.previewMediaDataUrls
      // so the iframe (which can't read absolute file:// paths) can still
      // show real photos. Fall through to the relative file URL otherwise —
      // that's what the actual exported site uses.
      const inlined = (snapshot.meta as { previewMediaDataUrls?: Record<string, string> }).previewMediaDataUrls?.[mediaId];
      if (inlined) return inlined;
      return mediaUrl(idx.mediaById.get(mediaId));
    },
    getFilePath: async (mediaId: string) => mediaUrl(idx.mediaById.get(mediaId)),
    // The static export ships full-size images and lets the browser scale them
    // in-place, so the thumbnail endpoint just produces a regular media URL.
    // It's keyed by file_ref to match the Electron handler — the runtime caller
    // passes whatever file_ref came back from listPage / forEntity. We look up
    // the matching media row to honour the inlined-thumb cache used by the
    // website-export preview.
    thumbnailDataUrl: async (fileRef: string) => {
      const m = Array.from(idx.mediaById.values()).find(it => it.file_ref === fileRef);
      if (!m) return null;
      const inlined = (snapshot.meta as { previewMediaDataUrls?: Record<string, string> }).previewMediaDataUrls?.[m.id];
      if (inlined) return inlined;
      return mediaUrl(m);
    },
    profilePicRef: async (personId: string) => {
      // Use first media link for the person, sorted by sort_order
      const links = idx.mediaLinksByEntity.get(`person:${personId}`);
      if (!links || links.length === 0) return null;
      const m = links[0];
      const region = (idx.regionsByPerson.get(personId) ?? []).find(r => r.media_id === m.id);
      return { mediaId: m.id, region: region ?? null, url: mediaUrl(m) };
    },
    profilePicRefs: async (personIds: string[]) => {
      const out: Record<string, unknown> = {};
      for (const id of personIds) {
        const links = idx.mediaLinksByEntity.get(`person:${id}`);
        if (!links || links.length === 0) { out[id] = null; continue; }
        const m = links[0];
        const region = (idx.regionsByPerson.get(id) ?? []).find(r => r.media_id === m.id);
        out[id] = { mediaId: m.id, region: region ?? null, url: mediaUrl(m) };
      }
      return out;
    },
    getTimeline: async (): Promise<never[]> => [],
    create: noop, update: noop, delete: noopFalse,
    addLink: noop, removeLink: noopFalse, reorder: noopVoid, attach: noop, createFromFile: noop, openFile: noopVoid,
  };

  const mediaRegions = {
    getForMedia: async (mediaId: string) => idx.regionsByMedia.get(mediaId) ?? [],
    getForPerson: async (personId: string) => idx.regionsByPerson.get(personId) ?? [],
    create: noop, update: noop, delete: noopFalse,
  };

  const db = {
    getSetting: async (key: string) => (snapshot.settings as Record<string, unknown>)[key] ?? null,
    setSetting: noopVoid,
    deleteSetting: noopVoid,
    onSwitched: () => {},
    getCurrent: async () => null,
    getRecent: async (): Promise<never[]> => [],
    createNew: noop, openExisting: noop, switchTo: noop,
  };

  const undo = {
    onPerformed: () => {},
    onChanged: () => {},
    undo: noopVoid, redo: noopVoid,
    // 'undo:state' is the IPC channel name; preload exposes it as getState — both are stubs here.
    state: async () => ({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null }),
    getState: async () => ({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null }),
    beginGroup: noopVoid, endGroup: noopVoid,
  };

  // 'open-external' matches the IPC channel name 'shell:open-external'; openExternal is the preload alias.
  const shell = { openExternal: noopVoid, 'open-external': noopVoid };
  const exportApi = { openFolder: noopVoid };
  const printApi = { print: noopVoid, exportPdf: noop };
  const csv = { export: noop };
  const backup = { backup: noop, restore: noop };
  const gazetteers = {
    list: async (): Promise<never[]> => [], import: noop, export: noop, delete: noopFalse,
    getImported: async (): Promise<never[]> => [], getSchema: async () => null, getBundled: async (): Promise<never[]> => [],
  };
  const duplicates = {
    find: async (): Promise<never[]> => [], findPage: async () => ({ items: [], total: 0 }), count: async () => 0,
    merge: noop, ignore: noop,
    findPlaces: async (): Promise<never[]> => [], countPlaces: async () => 0, ignorePlace: noop, mergePlaces: noop,
    findSources: async (): Promise<never[]> => [], countSources: async () => 0, ignoreSource: noop, mergeSources: noop,
    findMedia: async (): Promise<never[]> => [], countMedia: async () => 0, ignoreMedia: noop, mergeMedia: noop,
    findExactClusters: async (): Promise<never[]> => [], findFuzzyClusters: async (): Promise<never[]> => [],
    applyCluster: noop, declineCluster: noop,
  };
  const gedcom = { selectFile: noop, selectFiles: async (): Promise<never[]> => [], preview: noop, import: noop, export: noop };
  const importApi = {
    genneyCheckDocker: async () => false, genneySelectDerby: noop, genneySelectArchive: noop,
    genneySelectArchives: async (): Promise<never[]> => [],
    genneySelectMedia: noop, genneyDiscover: noop, genneyRun: noop, onProgress: () => {},
    holgerSelectFile: noop, holgerSelectFiles: async (): Promise<never[]> => [],
    holgerSelectMedia: noop, holgerRun: noop, onHolgerProgress: () => {},
    rootsmagicSelectFile: noop, rootsmagicSelectFiles: async (): Promise<never[]> => [],
    rootsmagicRun: noop, onRootsmagicProgress: () => {},
    grampsSelectFile: noop, grampsSelectFiles: async (): Promise<never[]> => [],
    grampsRun: noop, onGrampsProgress: () => {},
  };
  const archive = { export: noop, import: noop, selectFiles: async (): Promise<never[]> => [] };
  const website = { export: noop, previewSnapshot: noop };
  const chart = {
    saveSvg: noop, savePdf: noop,
    onGetVisiblePersons: () => {}, onSelectPerson: () => {},
    onFocusPerson: () => {}, onGetLayout: () => {}, removeAllChartHandlers: () => {},
  };
  // Static SPA never triggers onboarding (read-only export); stub for shape
  // parity so any composable that touches window.api.onboarding doesn't crash.
  const onboarding = {
    getSeen: async () => ({}), markSeen: noopVoid, reset: noopVoid,
  };

  return {
    persons, places, events, eventParticipants, sources, citations, relationships,
    groups, repositories, researchTasks, reports, checks, media, mediaRegions,
    notes, noteLinks, personAssociations, nameTranslations, placeTranslations,
    sourceCoverage, sourceRepositories,
    db, undo, shell, export: exportApi, print: printApi, csv, backup, gazetteers,
    duplicates, gedcom, import: importApi, archive, website, chart, onboarding,
    onDataChanged: () => {},
    offDataChanged: () => {},
  };
}

export function installStaticApiWith(snapshot: Snapshot): void {
  (globalThis as { api: unknown }).api = buildStaticApi(snapshot);
}

async function decompressGzipBase64(b64: string): Promise<Snapshot> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text) as Snapshot;
}

async function decompressGzipResponse(res: Response): Promise<Snapshot> {
  const stream = (res.body as ReadableStream).pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text) as Snapshot;
}

export async function installStaticApi(): Promise<void> {
  // Path 1: legacy raw snapshot inlined as `<script src="./data.js">` setting
  // window.__SNAPSHOT__. Old exports (pre-gzip) shipped this shape; the static
  // bundle still mounts them when a user revisits an old folder.
  const injected = (globalThis as { __SNAPSHOT__?: Snapshot }).__SNAPSHOT__;
  if (injected) {
    installStaticApiWith(injected);
    return;
  }
  // Path 2: portable mode — gz+base64 embedded directly in index.html via
  // <script>window.__SNAPSHOT_GZ__='...'</script>. No fetch needed; works
  // when the file is opened by double-click from a `file://` URL.
  const embedded = (globalThis as { __SNAPSHOT_GZ__?: string }).__SNAPSHOT_GZ__;
  if (embedded) {
    installStaticApiWith(await decompressGzipBase64(embedded));
    return;
  }
  // Path 3: split mode — sibling data.json.gz alongside index.html. Requires
  // a host (http://) because file:// fetch of a relative binary is blocked
  // in Chromium/Firefox/Safari by default.
  try {
    const gzRes = await fetch('./data.json.gz');
    if (gzRes.ok) {
      installStaticApiWith(await decompressGzipResponse(gzRes));
      return;
    }
  } catch { /* file:// blocks fetch; fall through to dev path */ }
  // Path 4: dev mode (npm run dev:static) — raw data.json served by Vite.
  const res = await fetch('./data.json');
  installStaticApiWith((await res.json()) as Snapshot);
}
