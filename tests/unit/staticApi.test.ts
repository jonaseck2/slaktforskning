import { describe, it, expect, beforeEach } from 'vitest';
import { installStaticApiWith } from '../../src/static/static-api';
import type { Snapshot } from '../../src/api/html_site/snapshot';

const fixture: Snapshot = {
  meta: {
    siteTitle: 'T',
    focusPersonId: 'p1',
    generatedAt: '',
  },
  persons: [
    { id: 'p1', sex: 'F', living: false, notes: '', created_at: '', updated_at: '', redacted: false },
    { id: 'p2', sex: 'M', living: false, notes: '', created_at: '', updated_at: '', redacted: false },
  ],
  personNames: [
    { id: 'n1', person_id: 'p1', given_name: 'Anna', surname: 'A', name_type: 'birth', sort_order: 0, date_from: null, date_to: null, name_prefix: null, name_suffix: null, patronymic_base: null, name_qualifier: null, preferred_name: null, nickname: null },
    { id: 'n2', person_id: 'p2', given_name: 'Björn', surname: 'B', name_type: 'birth', sort_order: 0, date_from: null, date_to: null, name_prefix: null, name_suffix: null, patronymic_base: null, name_qualifier: null, preferred_name: null, nickname: null },
  ],
  personIds: [],
  relationships: [
    { id: 'r1', type: 'couple', person1_id: 'p1', person2_id: 'p2', subtype: null, notes: '', created_at: '', updated_at: '' },
  ],
  events: [
    { id: 'e1', event_type: 'birth', date_type: 'exact', date_value: '1800-01-01', date_value_end: null, date_original: '1800', place_id: null, place_address: null, cause: null, description: '', relationship_id: null, created_at: '', updated_at: '' },
  ],
  eventParticipants: [
    { id: 'ep1', event_id: 'e1', person_id: 'p1', role: 'primary' },
  ],
  places: [
    { id: 'pl1', name: 'Stockholm', normalized_name: 'stockholm', place_type: null, parent_place_id: null, latitude: null, longitude: null, date_from: null, date_to: null, notes: '', street: null, postal_code: null, city: null, country: null },
  ],
  sources: [
    { id: 's1', title: 'Birth record', author: '', publication_info: '', repository: '', url: '', source_type: 'vital_record', call_number: null, abstract: null, created_at: '', updated_at: '' },
  ],
  citations: [
    { id: 'c1', source_id: 's1', page: '', date_accessed: '', confidence: 2, transcription: '', notes: '', event_id: null, person_id: 'p1', relationship_id: null, place_id: null, created_at: '' },
  ],
  media: [
    { id: 'm1', file_ref: 'photo.jpg', title: 'Photo', format: null, notes: '', is_printable: false, created_at: '' },
  ],
  mediaLinks: [
    { id: 'ml1', media_id: 'm1', entity_type: 'person', entity_id: 'p1', link_type: null, sort_order: 0, created_at: '' },
  ],
  mediaRegions: [],
  settings: { default_person_id: 'p1' },
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).api = undefined;
  installStaticApiWith(fixture);
});

describe('static-api persons', () => {
  it('listPage returns snapshot persons with names', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.persons.listPage(10, 0) as { persons: Array<{ given_name: string }>, total: number };
    expect(result.total).toBe(2);
    expect(result.persons).toHaveLength(2);
    expect(result.persons[0].given_name).toBe('Anna');
  });

  it('listPage respects offset and limit', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.persons.listPage(1, 1) as { persons: Array<{ given_name: string }> };
    expect(result.persons).toHaveLength(1);
    expect(result.persons[0].given_name).toBe('Björn');
  });

  it('search finds by given_name substring', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.persons.search('Anna') as Array<{ given_name: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].given_name).toBe('Anna');
  });

  it('getNames returns names for a person', async () => {
    const names = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.persons.getNames('p1') as Array<{ given_name: string }>;
    expect(names).toHaveLength(1);
    expect(names[0].given_name).toBe('Anna');
  });

  it('db.getSetting returns value from settings', async () => {
    const val = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.db.getSetting('default_person_id');
    expect(val).toBe('p1');
  });
});

describe('static-api places', () => {
  it('list returns all places', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.places.list() as Array<{ name: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Stockholm');
  });
});

describe('static-api events', () => {
  it('getEventsForPerson returns events via participant join', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.events.forPerson('p1') as Array<{ event_type: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].event_type).toBe('birth');
  });

  it('getEventsForPerson returns empty for unknown person', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.events.forPerson('unknown') as Array<unknown>;
    expect(result).toHaveLength(0);
  });
});

describe('static-api relationships', () => {
  it('getOfPerson returns relationships where person is person1 or person2', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.relationships.getForPerson('p1') as Array<{ id: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('getOfPerson also finds person2 membership', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.relationships.getForPerson('p2') as Array<{ id: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });
});

describe('static-api citations', () => {
  it('getCitationsForPerson returns citations linked to that person', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.citations.forPerson('p1') as Array<{ id: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  it('getCitationsForPerson returns empty for unknown person', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.citations.forPerson('unknown') as Array<unknown>;
    expect(result).toHaveLength(0);
  });
});

describe('static-api media', () => {
  it('getForEntity returns media merged with link fields', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.media.forEntity('person', 'p1') as Array<{ id: string; link_id: string; sort_order: number }>;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
    expect(result[0].link_id).toBe('ml1');
    expect(result[0].sort_order).toBe(0);
  });

  it('getForEntity returns empty for entity with no media', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.media.forEntity('person', 'p2') as Array<unknown>;
    expect(result).toHaveLength(0);
  });
});

describe('static-api search', () => {
  it('persons.search finds partial match via lunr', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.persons.search('Ann') as Array<{ given_name: string }>;
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].given_name).toBe('Anna');
  });

  it('persons.search returns empty array for non-matching query', async () => {
    const result = await (globalThis as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>).api.persons.search('zzznomatch') as Array<unknown>;
    expect(result).toHaveLength(0);
  });
});
