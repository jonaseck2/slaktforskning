import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RelationshipSourcesSection from '../../src/renderer/components/RelationshipSourcesSection.vue';
import { i18n } from './setup';

const citations = [
  {
    id: 'c-1',
    source_id: 'src-1',
    page: 'fol. 12',
    confidence: 3,
    transcription: '',
    notes: '',
    date_accessed: '2026-01-01',
  },
];

const sources: Record<string, { id: string; title: string }> = {
  'src-1': { id: 'src-1', title: 'Marriage register 1840' },
};

describe('RelationshipSourcesSection', () => {
  const mockForRelationship = vi.fn();
  const mockGetSource = vi.fn();
  const mockDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSource.mockImplementation(async (id: string) => sources[id] ?? null);
    (window as unknown as { api: unknown }).api = {
      citations: {
        forRelationship: mockForRelationship,
        delete: mockDelete,
      },
      sources: {
        get: mockGetSource,
      },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  it('renders citations for the relationship with source title', async () => {
    mockForRelationship.mockResolvedValue(citations);

    const wrapper = mount(RelationshipSourcesSection, {
      global: { plugins: [i18n] },
      props: { relationshipId: 'rel-1' },
    });
    await flushPromises();

    expect(mockForRelationship).toHaveBeenCalledWith('rel-1');
    expect(wrapper.text()).toContain('Marriage register 1840');
    expect(wrapper.text()).toContain('fol. 12');
  });

  it('shows empty state when there are no citations', async () => {
    mockForRelationship.mockResolvedValue([]);

    const wrapper = mount(RelationshipSourcesSection, {
      global: { plugins: [i18n] },
      props: { relationshipId: 'rel-1' },
    });
    await flushPromises();

    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('emits editCitation when a row is clicked', async () => {
    mockForRelationship.mockResolvedValue(citations);

    const wrapper = mount(RelationshipSourcesSection, {
      global: { plugins: [i18n] },
      props: { relationshipId: 'rel-1' },
    });
    await flushPromises();

    await wrapper.findAll('tbody tr')[0].trigger('click');

    expect(wrapper.emitted('editCitation')).toBeTruthy();
  });

  it('reloads when relationshipId changes', async () => {
    mockForRelationship.mockResolvedValue([]);

    const wrapper = mount(RelationshipSourcesSection, {
      global: { plugins: [i18n] },
      props: { relationshipId: 'rel-1' },
    });
    await flushPromises();

    await wrapper.setProps({ relationshipId: 'rel-2' });
    await flushPromises();

    expect(mockForRelationship).toHaveBeenCalledWith('rel-2');
  });
});
