import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventList from '../../src/renderer/components/EventList.vue';
import { i18n } from './setup';

const sampleEvent = {
  id: 'event-1',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1850-01-01',
  date_value_end: null,
  date_original: '1850-01-01',
  place_id: null,
  description: 'Born',
};

describe('EventList citation badges', () => {
  const mockForPerson = vi.fn();
  const mockForEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      events: {
        forPerson: mockForPerson,
        forRelationship: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
      },
      citations: { forEvent: mockForEvent },
      sources: { list: vi.fn().mockResolvedValue([]) },
    };
  });

  it('shows Unsourced badge when event has no citations', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);
    mockForEvent.mockResolvedValue([]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('.unsourced-badge').exists()).toBe(true);
    expect(wrapper.find('.source-count-badge').exists()).toBe(false);
  });

  it('shows source count badge when event has citations', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);
    mockForEvent.mockResolvedValue([{ id: 'cit-1' }, { id: 'cit-2' }]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('.source-count-badge').exists()).toBe(true);
    expect(wrapper.find('.source-count-badge').text()).toContain('2');
    expect(wrapper.find('.unsourced-badge').exists()).toBe(false);
  });

  it('clicking Cite button renders the CitationForm', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);
    mockForEvent.mockResolvedValue([]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    await wrapper.find('.btn-cite').trigger('click');
    await wrapper.vm.$nextTick();

    // CitationForm renders inside EventList — its content includes a form
    expect(wrapper.html()).toContain('modal');
  });
});
