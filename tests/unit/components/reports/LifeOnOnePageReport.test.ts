import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import LifeOnOnePageReport from '../../../../src/renderer/components/reports/LifeOnOnePageReport.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  reports: {
    personSummary: vi.fn(),
  },
  media: {
    forEntity: vi.fn(),
    readAsDataUrl: vi.fn(),
  },
  events: { forPerson: vi.fn() },
  places: { get: vi.fn(), getPath: vi.fn() },
  gazetteers: { getBundled: vi.fn(), getImported: vi.fn() },
  db: { getSetting: vi.fn() },
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockApi.media.forEntity.mockResolvedValue([]);
  mockApi.media.readAsDataUrl.mockResolvedValue(null);
  mockApi.events.forPerson.mockResolvedValue([]);
  mockApi.places.get.mockResolvedValue(null);
  mockApi.places.getPath.mockResolvedValue('');
  mockApi.gazetteers.getBundled.mockResolvedValue([]);
  mockApi.gazetteers.getImported.mockResolvedValue([]);
  mockApi.db.getSetting.mockResolvedValue(null);
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('LifeOnOnePageReport', async () => {
  it('renders name header with person primary name', async () => {
    mockApi.reports.personSummary.mockResolvedValue({
      person: { id: 'p1', sex: 'F', living: false, notes: null },
      names: [{ given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' }],
      events: [],
      relationships: [],
      citations: [],
    });

    const wrapper = mount(LifeOnOnePageReport, {
      props: { personId: 'p1' },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const name = wrapper.find('.op-name');
    expect(name.exists()).toBe(true);
    expect(name.text()).toContain('Anna Andersson');
  });

  it('hides map, photos, and snippet sections when person has no events, media, or notes', async () => {
    mockApi.reports.personSummary.mockResolvedValue({
      person: { id: 'p1', sex: 'U', living: false, notes: null },
      names: [{ given_name: 'X', surname: null, sort_order: 0, name_type: 'birth' }],
      events: [],
      relationships: [],
      citations: [],
    });

    const wrapper = mount(LifeOnOnePageReport, {
      props: { personId: 'p1', showLifeMap: false },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.find('.op-map').exists()).toBe(false);
    expect(wrapper.find('.op-photos').exists()).toBe(false);
    expect(wrapper.find('.op-snippet').exists()).toBe(false);
  });
});
