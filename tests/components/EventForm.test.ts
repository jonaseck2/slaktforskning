import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventForm from '../../src/renderer/components/EventForm.vue';
import { i18n } from './setup';

const editingEvent = {
  id: 'e1',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1850-01-01',
  date_value_end: null,
  date_original: '1 JAN 1850',
  place_id: null,
  description: '',
};

describe('EventForm optional source section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      events: {
        create: vi.fn().mockResolvedValue({ id: 'new-evt' }),
        update: vi.fn().mockResolvedValue({}),
      },
      eventParticipants: { add: vi.fn().mockResolvedValue({}) },
      citations: { create: vi.fn().mockResolvedValue({ id: 'new-cit' }) },
      sources: {
        list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]),
      },
    };
  });

  it('shows source toggle when creating a new event', async () => {
    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    expect(wrapper.find('.source-toggle').exists()).toBe(true);
  });

  it('hides source toggle when editing an existing event', async () => {
    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1', editingEvent },
    });
    await flushPromises();

    expect(wrapper.find('.source-toggle').exists()).toBe(false);
  });

  it('creates a citation linked to the event when source is selected', async () => {
    const mockEventsCreate = vi.fn().mockResolvedValue({ id: 'new-evt' });
    const mockCitationsCreate = vi.fn().mockResolvedValue({ id: 'new-cit' });
    (window as unknown as { api: unknown }).api = {
      events: { create: mockEventsCreate },
      eventParticipants: { add: vi.fn().mockResolvedValue({}) },
      citations: { create: mockCitationsCreate },
      sources: {
        list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]),
      },
    };

    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    // Set event type (first select)
    await wrapper.find('select').setValue('birth');

    // Check the "Add Source" checkbox
    await wrapper.find('.source-toggle input[type="checkbox"]').setValue(true);
    await wrapper.vm.$nextTick();

    // Source picker appears after event-type select and date-type select (from DateInput)
    const selects = wrapper.findAll('select');
    // selects[0] = event type, selects[1] = date type (DateInput), selects[2] = source
    await selects[selects.length - 1].setValue('src-1');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockEventsCreate).toHaveBeenCalled();
    expect(mockCitationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 'src-1',
        event_id: 'new-evt',
      }),
    );
  });
});
