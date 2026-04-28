import lunr from 'lunr';
import type { Snapshot } from '../api/html_site/snapshot';
import type { GenealogyEvent, Media, MediaRegion, Place, Relationship, Source, Citation } from '../api/types';

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
    sourceById, citationsByPerson, citationsByEvent, citationsByPlace, citationsByRelationship, citationsBySource,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildStaticApi(snapshot: Snapshot): Record<string, any> {
  const idx = buildIndices(snapshot);

  const personsWithNames = snapshot.persons.map(p => {
    const name = idx.namesByPerson.get(p.id)?.[0];
    return { ...p, given_name: name?.given_name ?? '', surname: name?.surname ?? '' };
  });

  const noop = async () => null;
  const noopFalse = async () => false;
  const noopVoid = async () => {};

  const persons = {
    list: async () => personsWithNames,
    listPage: async (limit: number, offset: number) => ({
      persons: personsWithNames.slice(offset, offset + limit),
      total: personsWithNames.length,
    }),
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
    create: noop, createWithEvent: noop, update: noop, delete: noopFalse,
    addName: noop, updateName: noop, deleteName: noopFalse,
    addIdentifier: noop, deleteIdentifier: noopFalse,
  };

  const places = {
    list: async () => snapshot.places,
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
    findOrCreate: noop, create: noop, update: noop, delete: noopFalse,
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
    add: noop, remove: noopFalse,
  };

  const sources = {
    list: async () => snapshot.sources,
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
    search: async () => [],
    create: noop, update: noop, delete: noopFalse,
  };

  const groups = {
    list: async () => [],
    get: noop,
    getMembers: async () => [],
    forPerson: async () => [],
    forPlace: async () => [],
    forMedia: async () => [],
    create: noop, update: noop, delete: noopFalse, addMember: noop, removeMember: noopFalse,
    addLink: noop, removeLink: noopFalse, removeLinkByEntity: noopFalse, getLinks: async () => [],
  };

  const repositories = {
    list: async () => [],
    get: noop,
    forSource: async () => [],
    create: noop, update: noop, delete: noopFalse, linkSource: noop, unlinkSource: noopFalse,
  };

  const researchTasks = {
    list: async () => [],
    get: noop,
    forPerson: async () => [],
    forPlace: async () => [],
    forMedia: async () => [],
    create: noop, update: noop, delete: noopFalse,
    addLink: noop, removeLink: noopFalse, getLinks: async () => [],
  };

  const reports = {
    personSummary: noop,
    familyUnit: noop,
    ancestorTree: noop,
    placeHistory: noop,
    researchGaps: noop,
    timeline: async () => [],
    aliveInYear: async (year: number) => ({ year, persons: [] }),
  };

  const checks = {
    runAll: async () => null,
    forPerson: async () => [],
    forPlace: async () => [],
    forMedia: async () => [],
  };

  const media = {
    list: async () => snapshot.media,
    listPage: async (limit: number, offset: number) => ({
      items: snapshot.media.slice(offset, offset + limit).map(m => ({
        ...m,
        is_missing: 0,
        link_count: idx.mediaLinkCounts.get(m.id) ?? 0,
      })),
      total: snapshot.media.length,
    }),
    get: async (id: string) => idx.mediaById.get(id) ?? null,
    forEntity: async (entityType: string, entityId: string) =>
      idx.mediaLinksByEntity.get(`${entityType}:${entityId}`) ?? [],
    linksForMedia: async (mediaId: string) => idx.mediaLinksByMedia.get(mediaId) ?? [],
    readAsDataUrl: async (mediaId: string) => mediaUrl(idx.mediaById.get(mediaId)),
    getFilePath: async (mediaId: string) => mediaUrl(idx.mediaById.get(mediaId)),
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
    getTimeline: async () => [],
    create: noop, update: noop, delete: noopFalse,
    addLink: noop, removeLink: noopFalse, reorder: noopVoid, attach: noop, openFile: noopVoid,
  };

  const mediaRegions = {
    getForMedia: async (mediaId: string) => idx.regionsByMedia.get(mediaId) ?? [],
    getForPerson: async (personId: string) => idx.regionsByPerson.get(personId) ?? [],
    create: noop, update: noop, updateGeometry: noop, delete: noopFalse,
  };

  const db = {
    getSetting: async (key: string) => (snapshot.settings as Record<string, unknown>)[key] ?? null,
    setSetting: noopVoid,
    deleteSetting: noopVoid,
    onSwitched: () => {},
    getCurrent: async () => null,
    getRecent: async () => [],
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
    list: async () => [], import: noop, export: noop, delete: noopFalse,
    getImported: async () => [], getSchema: async () => null, getBundled: async () => [],
  };
  const duplicates = { find: async () => [], merge: noop };
  const gedcom = { selectFile: noop, preview: noop, import: noop, export: noop };
  const importApi = {
    genneyCheckDocker: async () => false, genneySelectDerby: noop, genneySelectArchive: noop,
    genneySelectMedia: noop, genneyDiscover: noop, genneyRun: noop, onProgress: () => {},
    holgerSelectFile: noop, holgerSelectMedia: noop, holgerRun: noop, onHolgerProgress: () => {},
  };
  const archive = { export: noop, import: noop };
  const website = { export: noop };
  const chart = {
    saveSvg: noop, savePdf: noop,
    onGetVisiblePersons: () => {}, onSelectPerson: () => {},
    onFocusPerson: () => {}, onGetLayout: () => {}, removeAllChartHandlers: () => {},
  };

  return {
    persons, places, events, eventParticipants, sources, citations, relationships,
    groups, repositories, researchTasks, reports, checks, media, mediaRegions,
    db, undo, shell, export: exportApi, print: printApi, csv, backup, gazetteers,
    duplicates, gedcom, import: importApi, archive, website, chart,
    onDataChanged: () => {},
  };
}

export function installStaticApiWith(snapshot: Snapshot): void {
  (globalThis as { api: unknown }).api = buildStaticApi(snapshot);
}

export async function installStaticApi(): Promise<void> {
  const injected = (globalThis as { __SNAPSHOT__?: Snapshot }).__SNAPSHOT__;
  if (injected) {
    installStaticApiWith(injected);
    return;
  }
  // Dev mode fallback: load from data.json (served via npm run dev:static)
  const res = await fetch('./data.json');
  const snap = (await res.json()) as Snapshot;
  installStaticApiWith(snap);
}
