import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ALifeReport from '../../../../src/renderer/components/reports/ALifeReport.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  reports: {
    personSummary: vi.fn(),
    timeline: vi.fn(),
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
  mockApi.reports.timeline.mockResolvedValue([]);
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

  it('timeline renders relationship-suffixed labels for family events (mother death, son birth) and bare label for self', async () => {
    mockApi.reports.personSummary.mockResolvedValue(baseSummary);
    mockApi.reports.timeline.mockResolvedValue([
      {
        event: { id: 'e-self-birth', event_type: 'birth', date_value: '1900-01-01', date_value_end: null, place_id: null, place_name: 'Stockholm', place_path: null, description: null, cause: null, date_type: 'exact', date_original: null },
        person_id: 'p1',
        person_given_name: 'Anna',
        person_surname: 'Andersson',
        relationship_label: 'self',
      },
      {
        event: { id: 'e-mother-death', event_type: 'death', date_value: '1925-06-01', date_value_end: null, place_id: null, place_name: null, place_path: null, description: null, cause: null, date_type: 'exact', date_original: null },
        person_id: 'p-mom',
        person_given_name: 'Maria',
        person_surname: 'Larsson',
        relationship_label: 'mother',
      },
      {
        event: { id: 'e-son-birth', event_type: 'birth', date_value: '1930-03-15', date_value_end: null, place_id: null, place_name: 'Uppsala', place_path: null, description: null, cause: null, date_type: 'exact', date_original: null },
        person_id: 'p-son',
        person_given_name: 'Lars',
        person_surname: 'Andersson',
        relationship_label: 'son',
      },
      {
        event: { id: 'e-spouse-death', event_type: 'death', date_value: '1960-08-08', date_value_end: null, place_id: null, place_name: null, place_path: null, description: null, cause: null, date_type: 'exact', date_original: null },
        person_id: 'p-spouse',
        person_given_name: 'Karl',
        person_surname: 'Andersson',
        relationship_label: 'spouse',
      },
    ]);

    const wrapper = mount(ALifeReport, {
      props: { personId: 'p1', showLifeMap: false },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(mockApi.reports.timeline).toHaveBeenCalledWith('p1', {
      includeChildrenMarriages: false,
      includeSiblingDeaths: false,
    });

    const labels = wrapper.findAll('.marker-label').map(n => n.text());
    // Self birth — no suffix, place after middot
    expect(labels.some(l => l.includes('Stockholm') && !l.includes('('))).toBe(true);
    // Mother death — "mother" suffix, no place
    expect(labels.some(l => l.includes('Maria') && l.includes('(mother)'))).toBe(true);
    // Son birth — "son" suffix and place
    expect(labels.some(l => l.includes('Lars') && l.includes('(son)') && l.includes('Uppsala'))).toBe(true);
    // Spouse death — "spouse" suffix
    expect(labels.some(l => l.includes('Karl') && l.includes('(spouse)'))).toBe(true);
  });

  it('passes optional categories to the timeline API when props enabled', async () => {
    mockApi.reports.personSummary.mockResolvedValue(baseSummary);
    mockApi.reports.timeline.mockResolvedValue([]);

    mount(ALifeReport, {
      props: {
        personId: 'p1',
        showLifeMap: false,
        includeChildrenMarriages: true,
        includeSiblingDeaths: true,
      },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(mockApi.reports.timeline).toHaveBeenCalledWith('p1', {
      includeChildrenMarriages: true,
      includeSiblingDeaths: true,
    });
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
