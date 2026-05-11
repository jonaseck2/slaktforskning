import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AMarriageReport from '../../../../src/renderer/components/reports/AMarriageReport.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  reports: {
    familyUnit: vi.fn(),
  },
  media: {
    forEntity: vi.fn(),
    readAsDataUrl: vi.fn(),
  },
  events: { forPerson: vi.fn() },
  places: { get: vi.fn(), getPath: vi.fn() },
  gazetteers: { getBundled: vi.fn(), getImported: vi.fn() },
  db: { getSetting: vi.fn() },
  citations: {
    forPerson: vi.fn(),
    forRelationship: vi.fn(),
    forEvent: vi.fn(),
  },
  sources: { get: vi.fn() },
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
  mockApi.citations.forPerson.mockResolvedValue([]);
  mockApi.citations.forRelationship.mockResolvedValue([]);
  mockApi.citations.forEvent.mockResolvedValue([]);
  mockApi.sources.get.mockResolvedValue(null);
  (window as unknown as { api: unknown }).api = mockApi;
});

function buildMember(id: string, given: string, surname: string, sex: 'M' | 'F' | 'U' = 'U') {
  return {
    person: { id, sex, living: false, notes: null },
    names: [{ given_name: given, surname, sort_order: 0, name_type: 'birth' }],
    birth_event: null,
    death_event: null,
  };
}

describe('AMarriageReport', async () => {
  it('renders cover with couple names', async () => {
    mockApi.reports.familyUnit.mockResolvedValue({
      relationship: { id: 'r1', type: 'couple', subtype: null, person1_id: 'p1', person2_id: 'p2', notes: null },
      person1: buildMember('p1', 'Anna', 'Andersson', 'F'),
      person2: buildMember('p2', 'Bo', 'Berg', 'M'),
      relationship_events: [],
      children: [],
    });

    const wrapper = mount(AMarriageReport, {
      props: { relationshipId: 'r1' },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Anna Andersson');
    expect(wrapper.text()).toContain('Bo Berg');
  });

  it('hides empty sections when no events, children, or sources', async () => {
    mockApi.reports.familyUnit.mockResolvedValue({
      relationship: { id: 'r1', type: 'couple', subtype: null, person1_id: 'p1', person2_id: 'p2', notes: null },
      person1: buildMember('p1', 'Anna', 'Andersson'),
      person2: buildMember('p2', 'Bo', 'Berg'),
      relationship_events: [],
      children: [],
    });

    const wrapper = mount(AMarriageReport, {
      props: { relationshipId: 'r1', showSources: true, showPhotos: true, showLifeMap: false },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.find('.children-grid').exists()).toBe(false);
    expect(wrapper.find('.event-list').exists()).toBe(false);
    expect(wrapper.find('.citation-list').exists()).toBe(false);
    expect(wrapper.find('.dual-map-grid').exists()).toBe(false);
  });
});
