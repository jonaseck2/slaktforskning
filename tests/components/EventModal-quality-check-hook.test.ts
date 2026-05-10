import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import { useToast } from '../../src/renderer/composables/useToast';
import { i18n } from './setup';

// User-goal verification: when an event is saved that lies outside the
// person's lifespan, the EventModal must surface a non-blocking warning
// toast. The save itself must still succeed — the toast is informational,
// never authoritative.
//
// This is the modal-side counterpart to the per-event quality check engine.
// Engine-level coverage lives in tests/unit/checks-event-outside-lifespan.

describe('EventModal — post-save quality check toast', () => {
  let toast: ReturnType<typeof useToast>;
  const updateMock = vi.fn();
  const createMock = vi.fn();
  const runForEventMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    toast = useToast();
    // Drain any leftover toasts from previous tests
    while (toast.toasts.length > 0) toast.dismiss(toast.toasts[0].id);
    updateMock.mockImplementation(async (id: string, input: Record<string, unknown>) => ({ ...input, id }));
    createMock.mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: 'new-event-id' }));
    runForEventMock.mockResolvedValue([]); // default: no warnings
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
      checks: {
        runForEvent: runForEventMock,
      },
    };
  });

  function makeBeforeBirthEvent() {
    return {
      id: 'event-1',
      event_type: 'name_change',
      date_type: 'exact' as const,
      date_value: '1943-01-01',
      date_value_end: null,
      date_original: '1943-01-01',
      place_id: null,
      cause: null,
      value: null,
      notes: '',
    };
  }

  it('shows a warning toast when checks.runForEvent returns ≥1 row', async () => {
    runForEventMock.mockResolvedValue([
      { code: 'EVENT_BEFORE_BIRTH', severity: 'warning', message: 'before birth', personIds: ['p1'] },
    ]);

    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeBeforeBirthEvent() },
    });
    await flushPromises();

    await (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave();
    await flushPromises();

    expect(updateMock).toHaveBeenCalled();
    expect(runForEventMock).toHaveBeenCalledWith('event-1');
    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].type).toBe('warning');
  });

  it('does NOT show a toast when checks.runForEvent returns an empty array', async () => {
    runForEventMock.mockResolvedValue([]);

    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeBeforeBirthEvent() },
    });
    await flushPromises();

    await (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave();
    await flushPromises();

    expect(toast.toasts.length).toBe(0);
  });

  it('still emits saved even when the quality probe throws (non-blocking contract)', async () => {
    runForEventMock.mockRejectedValue(new Error('worker offline'));

    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeBeforeBirthEvent() },
    });
    await flushPromises();

    await (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave();
    await flushPromises();

    expect(updateMock).toHaveBeenCalled();
    // The save event must still emit even though the post-save probe failed.
    expect(wrapper.emitted('saved')).toBeTruthy();
  });
});
