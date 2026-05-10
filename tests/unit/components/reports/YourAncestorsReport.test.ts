import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import YourAncestorsReport from '../../../../src/renderer/components/reports/YourAncestorsReport.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  reports: {
    ancestorTree: vi.fn(),
    personSummary: vi.fn(),
  },
  persons: { get: vi.fn(), getNames: vi.fn() },
  events: { forPerson: vi.fn() },
  places: { get: vi.fn() },
  media: {
    forEntity: vi.fn(),
    readAsDataUrl: vi.fn(),
    profilePicRef: vi.fn().mockResolvedValue(null),
  },
  relationships: { getForPerson: vi.fn(), get: vi.fn() },
  db: { getSetting: vi.fn() },
};

beforeEach(async () => {
  vi.clearAllMocks();
  // FanChartReport calls fetchPedigreeTree which throws if persons.get returns null.
  // Return a minimal person for any id so the fan chart renders (or silently has no data).
  mockApi.persons.get.mockImplementation(async (id: string) => ({
    id,
    sex: 'U',
    living: false,
    notes: null,
  }));
  mockApi.persons.getNames.mockResolvedValue([]);
  mockApi.events.forPerson.mockResolvedValue([]);
  mockApi.places.get.mockResolvedValue(null);
  mockApi.media.forEntity.mockResolvedValue([]);
  mockApi.media.readAsDataUrl.mockResolvedValue(null);
  mockApi.relationships.getForPerson.mockResolvedValue([]);
  mockApi.relationships.get.mockResolvedValue(null);
  mockApi.db.getSetting.mockResolvedValue(null);
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('YourAncestorsReport', async () => {
  it('renders cover with root person name when tree and summary are available', async () => {
    const rootNode = {
      person: { id: 'p1', sex: 'F', living: false, notes: null },
      names: [{ given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' }],
      birth_event: null,
      death_event: null,
      marriage_event: null,
      father: null,
      mother: null,
    };
    mockApi.reports.ancestorTree.mockResolvedValue(rootNode);
    mockApi.reports.personSummary.mockResolvedValue({
      person: { id: 'p1', sex: 'F', living: false, notes: null },
      names: [{ given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' }],
      events: [],
      relationships: [],
      citations: [],
    });

    const wrapper = mount(YourAncestorsReport, {
      props: { personId: 'p1', generations: 2 },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Anna Andersson');
  });

  it('hides ancestor pages, surname index, and sources when no ancestors exist', async () => {
    const rootNode = {
      person: { id: 'p1', sex: 'U', living: false, notes: null },
      names: [{ given_name: 'X', surname: null, sort_order: 0, name_type: 'birth' }],
      birth_event: null,
      death_event: null,
      marriage_event: null,
      father: null,
      mother: null,
    };
    mockApi.reports.ancestorTree.mockResolvedValue(rootNode);
    mockApi.reports.personSummary.mockResolvedValue({
      person: { id: 'p1', sex: 'U', living: false, notes: null },
      names: [{ given_name: 'X', surname: null, sort_order: 0, name_type: 'birth' }],
      events: [],
      relationships: [],
      citations: [],
    });

    const wrapper = mount(YourAncestorsReport, {
      props: { personId: 'p1', generations: 2, showSources: true },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // No ancestors (only root with ahnentafel=1) → no ancestor pages
    expect(wrapper.find('.ancestor-page').exists()).toBe(false);
    // No sources and no surname index when there are no ancestor surnames
    expect(wrapper.find('.citation-list').exists()).toBe(false);
  });
});
