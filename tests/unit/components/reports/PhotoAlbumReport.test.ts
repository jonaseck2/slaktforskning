import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PhotoAlbumReport from '../../../../src/renderer/components/reports/PhotoAlbumReport.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  media: {
    list: vi.fn(),
    forEntity: vi.fn(),
    readAsDataUrl: vi.fn(),
  },
  persons: { getNames: vi.fn() },
  places: { get: vi.fn() },
  relationships: { get: vi.fn() },
  db: { getSetting: vi.fn() },
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockApi.media.list.mockResolvedValue([]);
  mockApi.media.forEntity.mockResolvedValue([]);
  mockApi.media.readAsDataUrl.mockResolvedValue('data:image/jpeg;base64,xyz');
  mockApi.persons.getNames.mockResolvedValue([]);
  mockApi.places.get.mockResolvedValue(null);
  mockApi.relationships.get.mockResolvedValue(null);
  mockApi.db.getSetting.mockResolvedValue(null);
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('PhotoAlbumReport', async () => {
  it('renders cover with person-scoped title when media and subject available', async () => {
    mockApi.media.forEntity.mockResolvedValue([
      {
        id: 'm1',
        title: 'Photo 1',
        notes: null,
        file_ref: '/photos/anna.jpg',
        format: 'image/jpeg',
        is_printable: 1,
        sort_order: 0,
      },
    ]);
    mockApi.persons.getNames.mockResolvedValue([
      { given_name: 'Anna', surname: 'Andersson', sort_order: 0, name_type: 'birth' },
    ]);

    const wrapper = mount(PhotoAlbumReport, {
      props: { subjectType: 'person', subjectId: 'p1' },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // Title template: "Photos of {name}"
    expect(wrapper.text()).toContain('Anna Andersson');
  });

  it('renders nothing when there is no media (cover hidden entirely)', async () => {
    mockApi.media.list.mockResolvedValue([]);

    const wrapper = mount(PhotoAlbumReport, {
      props: { subjectType: 'all' },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    // Component template hides both cover and index when displayItems is empty
    expect(wrapper.find('.cover').exists()).toBe(false);
    expect(wrapper.find('.index-list').exists()).toBe(false);
    expect(wrapper.find('.report-section').exists()).toBe(false);
  });
});
