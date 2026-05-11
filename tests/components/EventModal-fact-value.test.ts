import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import { i18n } from './setup';

// Prime Directive guard for the fact-value split.
//
// When event_type toggles from a fact-shaped type (occupation) to a non-fact
// type (marriage), the value field is hidden in the UI — but the form's
// `value` state must NOT be discarded, and Save must still send the authored
// value. Hiding a field is not consent to null it out. See CLAUDE.md.

describe('EventModal — fact-value Prime Directive guard', async () => {
  const updateMock = vi.fn();
  const createMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockImplementation(async (id: string, input: Record<string, unknown>) => ({ ...input, id }));
    createMock.mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: 'new-id' }));
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
      db: {
        getSetting: vi.fn().mockResolvedValue(null),
      },
    };
  });

  function makeOccupationEvent() {
    return {
      id: 'event-1',
      event_type: 'occupation',
      date_type: 'exact' as const,
      date_value: '1900-01-01',
      date_value_end: null,
      date_original: '1900-01-01',
      place_id: null,
      cause: null,
      value: 'Carpenter',
      notes: 'Worked at the shipyard',
    };
  }

  it('renders the value field with the OCCU label and the authored value', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeOccupationEvent() },
    });
    await flushPromises();

    const valueField = wrapper.find('[data-testid="event-value-field"]');
    expect(valueField.exists()).toBe(true);
    const input = valueField.find('input').element as HTMLInputElement;
    expect(input.value).toBe('Carpenter');
    expect(valueField.text()).toContain('Occupation');
  });

  it('hides the value field when event_type toggles to a non-fact type, but preserves form.value', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeOccupationEvent() },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="event-value-field"]').exists()).toBe(true);

    // Toggle to marriage (a non-fact type) via the form reactive — the
    // segmented control wires `@click="form.event_type = et"` and we want to
    // assert the same effect without coupling the test to button DOM.
    const vm = wrapper.vm as unknown as { form: { event_type: string; value: string | null } };
    vm.form.event_type = 'marriage';
    await flushPromises();

    expect(wrapper.find('[data-testid="event-value-field"]').exists()).toBe(false);
    // Critical: form.value must still hold the authored value even though the
    // field is hidden. Hiding is not consent to discard.
    expect(vm.form.value).toBe('Carpenter');

    // Toggle back to occupation — the field reappears with the same value.
    vm.form.event_type = 'occupation';
    await flushPromises();
    const reappeared = wrapper.find('[data-testid="event-value-field"]');
    expect(reappeared.exists()).toBe(true);
    expect((reappeared.find('input').element as HTMLInputElement).value).toBe('Carpenter');
  });

  it('save sends value and notes even when value field is hidden by a non-fact event_type', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeOccupationEvent() },
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as { form: { event_type: string; value: string | null; notes: string }; };
    // Switch to a non-fact type so the value field becomes hidden.
    vm.form.event_type = 'marriage';
    await flushPromises();
    expect(wrapper.find('[data-testid="event-value-field"]').exists()).toBe(false);

    // Trigger save through the BaseSubPanel emit (handleSave is wired to
    // @save). Calling it via the exposed handler keeps the assertion focused
    // on the save payload contract.
    await (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave?.();
    // Fall back: emit the save event up through BaseSubPanel.
    const baseSubPanel = wrapper.findComponent({ name: 'BaseSubPanel' });
    if (baseSubPanel.exists()) {
      await baseSubPanel.vm.$emit('save');
      await flushPromises();
    }

    expect(updateMock).toHaveBeenCalled();
    const payload = updateMock.mock.calls[0][1] as { value: string | null; notes: string; event_type: string };
    expect(payload.event_type).toBe('marriage');
    // Authored value MUST still be persisted even though the value field was
    // hidden at save time. This is the project Prime Directive.
    expect(payload.value).toBe('Carpenter');
    expect(payload.notes).toBe('Worked at the shipyard');
  });
});
