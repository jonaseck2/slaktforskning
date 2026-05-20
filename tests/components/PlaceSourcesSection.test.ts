import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PlaceSourcesSection from '../../src/renderer/components/PlaceSourcesSection.vue';
import { i18n } from './setup';

const citations = [
  {
    id: 'c-1',
    source_id: 'src-1',
    page: 'sheet 4',
    confidence: 3,
    transcription: '',
    notes: '',
    date_accessed: '2026-01-01',
  },
];

const sources: Record<string, { id: string; title: string }> = {
  'src-1': { id: 'src-1', title: 'Generalstabskartan 1872' },
};

describe('PlaceSourcesSection', () => {
  const mockForPlace = vi.fn();
  const mockGetSource = vi.fn();
  const mockDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSource.mockImplementation(async (id: string) => sources[id] ?? null);
    (window as unknown as { api: unknown }).api = {
      citations: {
        forPlace: mockForPlace,
        delete: mockDelete,
      },
      sources: {
        get: mockGetSource,
      },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  it('renders citations for the place with source title', async () => {
    mockForPlace.mockResolvedValue(citations);

    const wrapper = mount(PlaceSourcesSection, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    expect(mockForPlace).toHaveBeenCalledWith('place-1');
    expect(wrapper.text()).toContain('Generalstabskartan 1872');
    expect(wrapper.text()).toContain('sheet 4');
  });

  it('shows empty state when there are no citations', async () => {
    mockForPlace.mockResolvedValue([]);

    const wrapper = mount(PlaceSourcesSection, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('emits editCitation when a row is clicked', async () => {
    mockForPlace.mockResolvedValue(citations);

    const wrapper = mount(PlaceSourcesSection, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    await wrapper.findAll('tbody tr')[0].trigger('click');

    expect(wrapper.emitted('editCitation')).toBeTruthy();
  });

  it('reloads when placeId changes', async () => {
    mockForPlace.mockResolvedValue([]);

    const wrapper = mount(PlaceSourcesSection, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    await wrapper.setProps({ placeId: 'place-2' });
    await flushPromises();

    expect(mockForPlace).toHaveBeenCalledWith('place-2');
  });
});
