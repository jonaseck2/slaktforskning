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
  relationships: [],
  events: [],
  eventParticipants: [],
  places: [],
  sources: [],
  citations: [],
  media: [],
  mediaLinks: [],
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
