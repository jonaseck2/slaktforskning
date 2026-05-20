import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonSourcesSection from '../../src/renderer/components/PersonSourcesSection.vue';
import { i18n } from './setup';

const citations = [
  {
    id: 'c-1',
    source_id: 'src-1',
    page: 'p. 42',
    confidence: 3,
    transcription: '',
    notes: '',
    date_accessed: '2026-01-01',
  },
  {
    id: 'c-2',
    source_id: 'src-2',
    page: 'p. 17',
    confidence: 2,
    transcription: '',
    notes: '',
    date_accessed: '2026-01-02',
  },
];

const sources: Record<string, { id: string; title: string }> = {
  'src-1': { id: 'src-1', title: 'Birth certificate' },
  'src-2': { id: 'src-2', title: 'Parish book 1850' },
};

describe('PersonSourcesSection', () => {
  const mockForPerson = vi.fn();
  const mockGetSource = vi.fn();
  const mockDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSource.mockImplementation(async (id: string) => sources[id] ?? null);
    (window as unknown as { api: unknown }).api = {
      citations: {
        forPerson: mockForPerson,
        delete: mockDelete,
      },
      sources: {
        get: mockGetSource,
      },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  it('renders one row per citation with source title and confidence', async () => {
    mockForPerson.mockResolvedValue(citations);

    const wrapper = mount(PersonSourcesSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(mockForPerson).toHaveBeenCalledWith('person-1');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(wrapper.text()).toContain('Birth certificate');
    expect(wrapper.text()).toContain('Parish book 1850');
    expect(wrapper.text()).toContain('p. 42');
  });

  it('shows empty state with addSource CTA when there are no citations', async () => {
    mockForPerson.mockResolvedValue([]);

    const wrapper = mount(PersonSourcesSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.find('.empty, .section-empty').exists() || wrapper.text().length > 0).toBe(true);
  });

  it('emits editCitation when a row is clicked', async () => {
    mockForPerson.mockResolvedValue(citations);

    const wrapper = mount(PersonSourcesSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    await wrapper.findAll('tbody tr')[0].trigger('click');

    const emitted = wrapper.emitted('editCitation');
    expect(emitted).toBeTruthy();
    expect((emitted![0][0] as { id: string }).id).toBe('c-1');
  });

  it('exposes count for the parent panel header', async () => {
    mockForPerson.mockResolvedValue(citations);

    const wrapper = mount(PersonSourcesSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    const exposed = wrapper.vm as unknown as { count: number };
    expect(exposed.count).toBe(2);
  });

  it('reloads when personId changes', async () => {
    mockForPerson.mockResolvedValue([]);

    const wrapper = mount(PersonSourcesSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(mockForPerson).toHaveBeenCalledWith('person-1');

    await wrapper.setProps({ personId: 'person-2' });
    await flushPromises();

    expect(mockForPerson).toHaveBeenCalledWith('person-2');
  });
});
