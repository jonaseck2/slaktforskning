import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ALifeReport from '../../../../src/renderer/components/reports/ALifeReport.vue';
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
  places: { get: vi.fn() },
  db: { getSetting: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.media.forEntity.mockResolvedValue([]);
  mockApi.media.readAsDataUrl.mockResolvedValue(null);
  mockApi.events.forPerson.mockResolvedValue([]);
  mockApi.places.get.mockResolvedValue(null);
  mockApi.db.getSetting.mockResolvedValue(null);
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('ALifeReport', () => {
  it('renders cover with primary person name', async () => {
    mockApi.reports.personSummary.mockResolvedValue({
      person: { id: 'p1', sex: 'F', living: false, notes: null },
      names: [
        { given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' },
      ],
      events: [],
      relationships: [],
      citations: [],
    });

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1' },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Anna Andersson');
  });

  it('hides empty sections when person has no events, family, or sources', async () => {
    mockApi.reports.personSummary.mockResolvedValue({
      person: { id: 'p1', sex: 'U', living: false, notes: null },
      names: [
        { given_name: 'X', surname: null, sort_order: 0, name_type: 'birth' },
      ],
      events: [],
      relationships: [],
      citations: [],
    });

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1', showSources: true, showPhotos: true },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // Section headings are rendered inside <h2 class="section-heading"> — none should exist
    expect(wrapper.findAll('.section-heading').length).toBe(0);
    expect(wrapper.find('.event-list').exists()).toBe(false);
    expect(wrapper.find('.citation-list').exists()).toBe(false);
  });
});
