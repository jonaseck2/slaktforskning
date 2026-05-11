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
  notes: 'Born',
};

describe('EventList', async () => {
  const mockForPerson = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      events: {
        forPerson: mockForPerson,
        forRelationship: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
      },
      citations: { forEvent: vi.fn().mockResolvedValue([]) },
      sources: { list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
    };
  });

  it('clicking a row opens the EventForm', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
    (await wrapper.find('.clickable-row')).trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
  });

  it('has no Edit button — rows are clickable instead', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('.btn-edit').exists()).toBe(false);
    expect(wrapper.find('.clickable-row').exists()).toBe(true);
  });

  it('shows event badge for each event', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('.event-badge').exists()).toBe(true);
  });

  it('discards stale results when personId changes mid-fetch', async () => {
    let resolveA: (v: unknown) => void = () => {};
    mockForPerson.mockImplementation((id: string) => {
      if (id === 'person-A') return new Promise((r) => { resolveA = r; });
      return Promise.resolve([{ ...sampleEvent, id: 'event-B', event_type: 'birth' }]);
    });

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-A' },
    });
    await flushPromises();

    await wrapper.setProps({ personId: 'person-B' });
    await flushPromises();
    resolveA([{ ...sampleEvent, id: 'event-A-stale', event_type: 'death' }]);
    await flushPromises();

    expect(wrapper.text()).not.toContain('event-A-stale');
  });
});
