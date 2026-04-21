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
  places: { get: vi.fn(), getPath: vi.fn() },
  gazetteers: { getBundled: vi.fn(), getImported: vi.fn() },
  db: { getSetting: vi.fn() },
};

const baseSummary = {
  person: { id: 'p1', sex: 'F', living: false, notes: null },
  names: [{ given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' }],
  events: [],
  relationships: [],
  citations: [],
};

beforeEach(() => {
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

describe('ALifeReport', () => {
  it('renders cover with primary person name', async () => {
    mockApi.reports.personSummary.mockResolvedValue(baseSummary);

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
      names: [{ given_name: 'X', surname: null, sort_order: 0, name_type: 'birth' }],
      events: [],
      relationships: [],
      citations: [],
    });

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1', showSources: true, showPhotos: true, showLifeMap: false },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // Section headings are rendered inside <h2 class="section-heading"> — none should exist
    expect(wrapper.findAll('.section-heading').length).toBe(0);
    expect(wrapper.find('.event-list').exists()).toBe(false);
    expect(wrapper.find('.citation-list').exists()).toBe(false);
  });

  it('hides life map when showLifeMap is false', async () => {
    mockApi.reports.personSummary.mockResolvedValue(baseSummary);

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1', showLifeMap: false },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.find('.life-map').exists()).toBe(false);
  });

  it('auto-hides life map when showLifeMap is true but person has no geocoded events', async () => {
    mockApi.reports.personSummary.mockResolvedValue(baseSummary);

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1', showLifeMap: true },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // PersonLifeMap renders nothing when there are no resolved coordinates
    expect(wrapper.find('.life-map').exists()).toBe(false);
  });

  it('family members have id anchors for within-report linking', async () => {
    mockApi.reports.personSummary.mockResolvedValue({
      ...baseSummary,
      relationships: [
        {
          id: 'r1', type: 'couple',
          person1_id: 'p1', person2_id: 'p2',
          subtype: null, other_person_id: 'p2', other_person_sex: 'M',
          other_person_names: [{ given_name: 'Karl', surname: 'Karlsson', sort_order: 0, name_type: 'birth' }],
        },
        {
          id: 'r2', type: 'parent_child',
          person1_id: 'p1', person2_id: 'p3',
          subtype: null, other_person_id: 'p3', other_person_sex: 'U',
          other_person_names: [{ given_name: 'Barn', surname: null, sort_order: 0, name_type: 'birth' }],
        },
      ],
    });

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1' },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.find('#person-p2').exists()).toBe(true);
    expect(wrapper.find('#person-p3').exists()).toBe(true);
  });

  it('no links in the report navigate outside (all hrefs start with #)', async () => {
    mockApi.reports.personSummary.mockResolvedValue({
      ...baseSummary,
      relationships: [
        {
          id: 'r1', type: 'couple',
          person1_id: 'p1', person2_id: 'p2',
          subtype: null, other_person_id: 'p2', other_person_sex: 'M',
          other_person_names: [{ given_name: 'Karl', surname: 'Karlsson', sort_order: 0, name_type: 'birth' }],
        },
      ],
    });

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1', showLifeMap: true },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const links = wrapper.findAll('a[href]');
    for (const link of links) {
      const href = link.attributes('href') ?? '';
      expect(href.startsWith('#'), `External link found: ${href}`).toBe(true);
    }
  });
});
