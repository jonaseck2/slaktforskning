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

describe('EventForm source section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      events: {
        create: vi.fn().mockResolvedValue({ id: 'new-evt' }),
        update: vi.fn().mockResolvedValue({}),
      },
      eventParticipants: { add: vi.fn().mockResolvedValue({}) },
      citations: { create: vi.fn().mockResolvedValue({ id: 'new-cit' }), forEvent: vi.fn().mockResolvedValue([]) },
      sources: {
        list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]),
        get: vi.fn().mockResolvedValue({ title: 'Church Records' }),
        search: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]),
      },
    };
  });

  it('shows source section when creating a new event', async () => {
    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    expect(wrapper.find('.source-section').exists()).toBe(true);
  });

  it('shows source section when editing an existing event', async () => {
    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1', editingEvent },
    });
    await flushPromises();

    expect(wrapper.find('.source-section').exists()).toBe(true);
  });

  it('creates a citation linked to the event when source is provided', async () => {
    const mockEventsCreate = vi.fn().mockResolvedValue({ id: 'new-evt' });
    const mockCitationsCreate = vi.fn().mockResolvedValue({ id: 'new-cit' });
    (window as unknown as { api: unknown }).api = {
      events: { create: mockEventsCreate },
      eventParticipants: { add: vi.fn().mockResolvedValue({}) },
      citations: { create: mockCitationsCreate, forEvent: vi.fn().mockResolvedValue([]) },
      sources: {
        list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]),
        get: vi.fn().mockResolvedValue({ title: 'Church Records' }),
        search: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]),
      },
    };

    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    // Set event type
    await wrapper.find('select').setValue('birth');

    // Set source via the SourcePicker's internal model
    const sourcePicker = wrapper.findComponent({ name: 'SourcePicker' });
    if (sourcePicker.exists()) {
      sourcePicker.vm.$emit('update:modelValue', 'src-1');
      await wrapper.vm.$nextTick();
    }

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
