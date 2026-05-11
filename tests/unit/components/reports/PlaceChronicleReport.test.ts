import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PlaceChronicleReport from '../../../../src/renderer/components/reports/PlaceChronicleReport.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  reports: {
    placeHistory: vi.fn(),
  },
  places: { get: vi.fn(), list: vi.fn() },
  media: {
    forEntity: vi.fn(),
    readAsDataUrl: vi.fn(),
  },
  db: { getSetting: vi.fn() },
  citations: {
    forPlace: vi.fn(),
    forEvent: vi.fn(),
  },
  sources: { get: vi.fn() },
  gazetteers: { getImported: vi.fn() },
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockApi.places.get.mockResolvedValue(null);
  mockApi.places.list.mockResolvedValue([]);
  mockApi.media.forEntity.mockResolvedValue([]);
  mockApi.media.readAsDataUrl.mockResolvedValue(null);
  mockApi.db.getSetting.mockResolvedValue(null);
  mockApi.citations.forPlace.mockResolvedValue([]);
  mockApi.citations.forEvent.mockResolvedValue([]);
  mockApi.sources.get.mockResolvedValue(null);
  mockApi.gazetteers.getImported.mockResolvedValue([]);
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('PlaceChronicleReport', async () => {
  it('renders cover with place name', async () => {
    mockApi.reports.placeHistory.mockResolvedValue({
      place_id: 'pl1',
      place_name: 'Stockholm',
      place_path: 'Stockholm, Sweden',
      events: [],
    });
    mockApi.places.get.mockResolvedValue({
      id: 'pl1',
      name: 'Stockholm',
      place_type: null,
      parent_place_id: null,
      latitude: null,
      longitude: null,
      date_from: null,
      date_to: null,
      notes: '',
    });

    const wrapper = mount(PlaceChronicleReport, {
      props: { placeId: 'pl1' },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Stockholm');
  });

  it('hides empty sections when place has no events, persons, notes, or child places', async () => {
    mockApi.reports.placeHistory.mockResolvedValue({
      place_id: 'pl1',
      place_name: 'Empty Place',
      place_path: 'Empty Place',
      events: [],
    });
    mockApi.places.get.mockResolvedValue({
      id: 'pl1',
      name: 'Empty Place',
      place_type: null,
      parent_place_id: null,
      latitude: null,
      longitude: null,
      date_from: null,
      date_to: null,
      notes: '',
    });

    const wrapper = mount(PlaceChronicleReport, {
      props: { placeId: 'pl1', showChildPlaces: true, showSources: true },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.find('.event-list').exists()).toBe(false);
    expect(wrapper.find('.person-list').exists()).toBe(false);
    expect(wrapper.find('.child-places-list').exists()).toBe(false);
    expect(wrapper.find('.citation-list').exists()).toBe(false);
  });
});
