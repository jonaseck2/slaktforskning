import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import { i18n } from './setup';

// T22 — negative assertions (GEDCOM 7.0 NO X). The modal exposes a
// checkbox above the event type picker. When checked, the row is saved
// with `is_negation = true` and the negated event type recorded in
// `negation_event_type`. Participants section is hidden (only the primary
// participant — the panel-owner — makes sense for a negation).

describe('EventModal — T22 negation toggle', () => {
  const createMock = vi.fn();
  const updateMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: 'new-id' }));
    updateMock.mockImplementation(async (id: string, input: Record<string, unknown>) => ({ ...input, id }));
    (window as unknown as { api: unknown }).api = {
      events: {
        create: createMock,
        update: updateMock,
        forPerson: vi.fn().mockResolvedValue([]),
      },
      eventParticipants: {
        getForEvent: vi.fn().mockResolvedValue([]),
        add: vi.fn().mockResolvedValue(null),
      },
      citations: {
        forEvent: vi.fn().mockResolvedValue([]),
      },
      sources: { get: vi.fn().mockResolvedValue(null) },
      persons: {
        getNames: vi.fn().mockResolvedValue([]),
      },
      relationships: {
        getForPerson: vi.fn().mockResolvedValue([]),
      },
      checks: { runForEvent: vi.fn().mockResolvedValue([]) },
      db: { getSetting: vi.fn().mockResolvedValue(null) },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  it('renders the negation checkbox above the type picker', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {},
    });
    await flushPromises();

    const toggle = wrapper.find('.ep-negation-toggle');
    expect(toggle.exists()).toBe(true);
    const cb = toggle.find('input[type="checkbox"]');
    expect(cb.exists()).toBe(true);
  });

  it('hides participants section when is_negation is on', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {},
    });
    await flushPromises();

    // Initially, with is_negation=false, the participants section is rendered.
    expect(wrapper.findComponent({ name: 'EventParticipantsSection' }).exists()).toBe(true);

    // Flip the flag via the form ref.
    const vm = wrapper.vm as unknown as { form: { is_negation: boolean } };
    vm.form.is_negation = true;
    await flushPromises();

    expect(wrapper.findComponent({ name: 'EventParticipantsSection' }).exists()).toBe(false);
  });

  it('save payload writes is_negation + negation_event_type when checked', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {},
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as { form: { event_type: string; is_negation: boolean } };
    vm.form.event_type = 'marriage';
    vm.form.is_negation = true;
    await flushPromises();

    // Trigger save through the same path the existing tests use.
    await (wrapper.vm as unknown as { handleSave?: () => Promise<void> }).handleSave?.();
    const baseSubPanel = wrapper.findComponent({ name: 'BaseSubPanel' });
    if (baseSubPanel.exists()) {
      await baseSubPanel.vm.$emit('save');
      await flushPromises();
    }

    expect(createMock).toHaveBeenCalled();
    const payload = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.is_negation).toBe(true);
    expect(payload.negation_event_type).toBe('marriage');
  });

  it('save payload clears negation_event_type when the flag is off', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {},
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as { form: { event_type: string; is_negation: boolean } };
    vm.form.event_type = 'birth';
    vm.form.is_negation = false;
    await flushPromises();

    (wrapper.vm as unknown as { handleSave?: () => Promise<void> }).handleSave?.();
    await flushPromises();

    expect(createMock).toHaveBeenCalled();
    const payload = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.is_negation).toBe(false);
    expect(payload.negation_event_type).toBe('');
  });
});
