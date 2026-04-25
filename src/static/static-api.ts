import type { Snapshot } from '../api/html_site/snapshot';
import type { GenealogyEvent, Media, MediaRegion, Place, Relationship, Source, Citation } from '../api/types';

// Indices built once from the snapshot for O(1) lookups
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
  relationshipsByPerson: Map<string, Relationship[]>;
  mediaById: Map<string, Media>;
  mediaLinksByEntity: Map<string, (Media & { link_id: string; link_type: string | null; sort_order: number })[]>;
  regionsByMedia: Map<string, MediaRegion[]>;
  regionsByPerson: Map<string, MediaRegion[]>;
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

  // Build event lookups via eventParticipants for person join
  const eventsByPerson = new Map<string, GenealogyEvent[]>();
  for (const ep of s.eventParticipants) {
    const event = eventById.get(ep.event_id);
    if (!event) continue;
    const list = eventsByPerson.get(ep.person_id) ?? [];
    list.push(event);
    eventsByPerson.set(ep.person_id, list);
  }

  // Build event lookups by relationship_id
  const eventsByRelationship = new Map<string, GenealogyEvent[]>();
  for (const e of s.events) {
    if (!e.relationship_id) continue;
    const list = eventsByRelationship.get(e.relationship_id) ?? [];
    list.push(e);
    eventsByRelationship.set(e.relationship_id, list);
  }

  // Build event lookups by place_id
  const eventsByPlace = new Map<string, GenealogyEvent[]>();
  for (const e of s.events) {
    if (!e.place_id) continue;
    const list = eventsByPlace.get(e.place_id) ?? [];
    list.push(e);
    eventsByPlace.set(e.place_id, list);
  }

  const sourceById = new Map(s.sources.map(src => [src.id, src]));

  // Citation lookups by entity
  const citationsByPerson = new Map<string, Citation[]>();
  const citationsByEvent = new Map<string, Citation[]>();
  const citationsByPlace = new Map<string, Citation[]>();
  const citationsByRelationship = new Map<string, Citation[]>();
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
  }

  // Relationship lookups — person can be person1_id or person2_id
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

  // Media links by entity key `${entity_type}:${entity_id}`
  const mediaLinksByEntity = new Map<string, (Media & { link_id: string; link_type: string | null; sort_order: number })[]>();
  for (const ml of s.mediaLinks) {
    const media = mediaById.get(ml.media_id);
    if (!media) continue;
    const key = `${ml.entity_type}:${ml.entity_id}`;
    const list = mediaLinksByEntity.get(key) ?? [];
    list.push({ ...media, link_id: ml.id, link_type: ml.link_type ?? null, sort_order: ml.sort_order });
    mediaLinksByEntity.set(key, list);
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

  return {
    personById,
    namesByPerson,
    idsByPerson,
    placeById,
    eventById,
    eventsByPerson,
    eventsByRelationship,
    eventsByPlace,
    sourceById,
    citationsByPerson,
    citationsByEvent,
    citationsByPlace,
    citationsByRelationship,
    relationshipsByPerson,
    mediaById,
    mediaLinksByEntity,
    regionsByMedia,
    regionsByPerson,
  };
}

export function installStaticApiWith(snapshot: Snapshot): void {
  const idx = buildIndices(snapshot);

  const personsWithNames = snapshot.persons.map(p => {
    const name = idx.namesByPerson.get(p.id)?.[0];
    return { ...p, given_name: name?.given_name ?? '', surname: name?.surname ?? '' };
  });

  const personsApi = {
    async listPage(limit: number, offset: number) {
      return { persons: personsWithNames.slice(offset, offset + limit), total: personsWithNames.length };
    },
    async list() {
      return personsWithNames;
    },
    async get(id: string) {
      return idx.personById.get(id) ?? null;
    },
    async getNames(personId: string) {
      return idx.namesByPerson.get(personId) ?? [];
    },
    async getIdentifiers(personId: string) {
      return idx.idsByPerson.get(personId) ?? [];
    },
    async search(q: string) {
      const ql = q.toLowerCase();
      return personsWithNames.filter(p =>
        (p.given_name && p.given_name.toLowerCase().includes(ql)) ||
        (p.surname && p.surname.toLowerCase().includes(ql))
      );
    },
    // No-op mutating methods (static site is read-only)
    async create() { return null; },
    async update() { return null; },
    async delete() { return false; },
    async addName() { return null; },
    async deleteName() { return false; },
    async createWithEvent() { return null; },
  };

  const placesApi = {
    async list() { return snapshot.places; },
    async listPage(limit: number, offset: number) {
      return { places: snapshot.places.slice(offset, offset + limit), total: snapshot.places.length };
    },
    async get(id: string) { return idx.placeById.get(id) ?? null; },
    async search(q: string) {
      const ql = q.toLowerCase();
      return snapshot.places.filter(p => p.name.toLowerCase().includes(ql));
    },
    async getPersons(_placeId: string) { return []; },
    async create() { return null; },
    async update() { return null; },
    async delete() { return false; },
  };

  const eventsApi = {
    async get(id: string) { return idx.eventById.get(id) ?? null; },
    async getEventsForPerson(personId: string) { return idx.eventsByPerson.get(personId) ?? []; },
    async getEventsForRelationship(relationshipId: string) { return idx.eventsByRelationship.get(relationshipId) ?? []; },
    async getEventsForPlace(placeId: string) { return idx.eventsByPlace.get(placeId) ?? []; },
    async getParticipants(eventId: string) {
      return snapshot.eventParticipants.filter(ep => ep.event_id === eventId);
    },
    async create() { return null; },
    async update() { return null; },
    async delete() { return false; },
  };

  const sourcesApi = {
    async get(id: string) { return idx.sourceById.get(id) ?? null; },
    async list() { return snapshot.sources; },
    async search(q: string) {
      const ql = q.toLowerCase();
      return snapshot.sources.filter(s => s.title && s.title.toLowerCase().includes(ql));
    },
    async create() { return null; },
    async update() { return null; },
    async delete() { return false; },
  };

  const citationsApi = {
    async getCitationsForPerson(personId: string) { return idx.citationsByPerson.get(personId) ?? []; },
    async getCitationsForEvent(eventId: string) { return idx.citationsByEvent.get(eventId) ?? []; },
    async getCitationsForPlace(placeId: string) { return idx.citationsByPlace.get(placeId) ?? []; },
    async getCitationsForRelationship(relationshipId: string) { return idx.citationsByRelationship.get(relationshipId) ?? []; },
    async create() { return null; },
    async delete() { return false; },
  };

  const relationshipsApi = {
    async get(id: string) { return snapshot.relationships.find(r => r.id === id) ?? null; },
    async getOfPerson(personId: string) { return idx.relationshipsByPerson.get(personId) ?? []; },
    async list() { return snapshot.relationships; },
    async create() { return null; },
    async update() { return null; },
    async delete() { return false; },
    async addParticipant() { return null; },
    async removeParticipant() { return false; },
  };

  const mediaApi = {
    async get(id: string) { return idx.mediaById.get(id) ?? null; },
    async list() { return snapshot.media; },
    async listPage(limit: number, offset: number) {
      return { media: snapshot.media.slice(offset, offset + limit), total: snapshot.media.length };
    },
    async getForEntity(entityType: string, entityId: string) {
      return idx.mediaLinksByEntity.get(`${entityType}:${entityId}`) ?? [];
    },
    async getRegions(mediaId: string) { return idx.regionsByMedia.get(mediaId) ?? []; },
    async getRegionsForPerson(personId: string) { return idx.regionsByPerson.get(personId) ?? []; },
    async readAsDataUrl(mediaId: string) {
      const m = idx.mediaById.get(mediaId);
      if (!m?.file_ref) return null;
      return `./media/full/${m.file_ref}`;
    },
    async attach() { return null; },
    async unlink() { return false; },
    async reorder() {},
    async delete() { return false; },
  };

  (globalThis as { api: unknown }).api = {
    persons: personsApi,
    places: placesApi,
    events: eventsApi,
    sources: sourcesApi,
    citations: citationsApi,
    relationships: relationshipsApi,
    media: mediaApi,
    db: {
      async getSetting(key: string) {
        return (snapshot.settings as Record<string, unknown>)[key] ?? null;
      },
      async setSetting() {},
      async deleteSetting() {},
      onSwitched() {},
    },
    undo: {
      onPerformed() {},
      onChanged() {},
    },
    onDataChanged() {},
    checks: {
      async runAll() { return null; },
    },
  };
}

export async function installStaticApi(): Promise<void> {
  const res = await fetch('./data.json');
  const snap = (await res.json()) as Snapshot;
  installStaticApiWith(snap);
}
