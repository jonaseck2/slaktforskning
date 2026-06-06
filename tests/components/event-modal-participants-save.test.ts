import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import { i18n } from './setup';

// Ben rapport 102 §4 — C4: save-and-continue when adding a participant on an
// unsaved event.
//
// User goal: when Ben picks a participant on a not-yet-saved event, a confirm
// dialog appears ("Händelsen måste sparas" in sv / "Event must be saved" in en).
// Confirming "Save and continue" saves the event and attaches the participant
// in one shot.

// The PersonPicker is complex (teleports, async search). Stub it with a
// minimal component that exposes the same emitted interface — `update:modelValue`
// — so EventParticipantsSection's onPicked handler runs for real.
const StubPersonPicker = defineComponent({
  name: 'PersonPicker',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () => h('button', {
      'data-testid': 'stub-person-picker-trigger',
      onClick: () => emit('update:modelValue', 'person-abc'),
    }, 'Pick person-abc');
  },
});

const SAVED_EVENT_ID = 'new-event-999';
const PERSON_ID = 'person-abc';

function makeWindowApi(overrides: Record<string, unknown> = {}) {
  const eventsSave = vi.fn().mockResolvedValue({ id: SAVED_EVENT_ID });
  return {
    events: {
      create: eventsSave,
      update: vi.fn().mockResolvedValue({ id: SAVED_EVENT_ID }),
      forPerson: vi.fn().mockResolvedValue([]),
    },
    eventParticipants: {
      getForEvent: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue({ id: 'ep-1' }),
    },
    citations: {
      forEvent: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    sources: {
      get: vi.fn().mockResolvedValue(null),
    },
    persons: {
      getNames: vi.fn().mockResolvedValue([]),
    },
    relationships: {
      getForPerson: vi.fn().mockResolvedValue([]),
    },
    checks: {
      runForEvent: vi.fn().mockResolvedValue([]),
    },
    db: {
      getSetting: vi.fn().mockResolvedValue(null),
    },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
    ...overrides,
  };
}

describe('EventModal — save-and-continue for participant on unsaved event (Ben rapport 102 §4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = makeWindowApi();
  });

  // Mount EventModal in CREATE mode (no editingEvent → savedEventId is null).
  function mountUnsaved() {
    return mount(EventModal, {
      global: {
        plugins: [i18n],
        stubs: {
          PersonPicker: StubPersonPicker,
          // Keep other components real; Teleport already stubbed in setup.ts
        },
      },
      props: {
        // No editingEvent → CREATE mode → savedEventId = null
        defaultEventType: 'birth',
      },
    });
  }

  it('C4a — picking a participant on an unsaved event shows the save-first confirm dialog', async () => {
    const wrapper = mountUnsaved();
    await flushPromises();
    await flushPromises();

    // Find the stub picker button inside EventParticipantsSection.
    const triggerBtn = wrapper.find('[data-testid="stub-person-picker-trigger"]');
    expect(triggerBtn.exists()).toBe(true);

    // Click it — this emits update:modelValue with person-abc.
    await triggerBtn.trigger('click');
    await flushPromises();

    // The confirm dialog must now be visible. It carries the title text
    // from events.participantSaveFirstTitle (en: "Event must be saved").
    const dialogText = wrapper.text();
    expect(dialogText).toContain('Event must be saved');
  });

  it('C4b — confirming "Save and continue" calls events.create then eventParticipants.add with (savedEventId, personId, "other")', async () => {
    const api = makeWindowApi();
    (window as unknown as { api: unknown }).api = api;

    const wrapper = mountUnsaved();
    await flushPromises();
    await flushPromises();

    // Pick a participant on the unsaved event.
    const triggerBtn = wrapper.find('[data-testid="stub-person-picker-trigger"]');
    await triggerBtn.trigger('click');
    await flushPromises();

    // The confirm dialog must be visible.
    expect(wrapper.text()).toContain('Event must be saved');

    // Click the confirm button (Save and continue).
    // ConfirmModal renders a button with the confirmLabel text.
    const buttons = wrapper.findAll('button');
    const confirmBtn = buttons.find((b) => b.text().includes('Save and continue'));
    expect(confirmBtn).toBeDefined();
    await confirmBtn!.trigger('click');
    await flushPromises();
    await flushPromises();

    // events.create (the save) must have been called.
    expect(api.events.create).toHaveBeenCalled();

    // eventParticipants.add must have been called with the saved event id,
    // the picked person id, and the default role 'other' (same as the normal add flow).
    // Note: add may also be called for the primary participant — we look for the
    // specific call that attaches the extra participant with role 'other'.
    const addCalls = (api.eventParticipants.add as ReturnType<typeof vi.fn>).mock.calls;
    const extraParticipantCall = addCalls.find(
      ([arg]: [{ event_id: string; person_id: string; role: string }]) =>
        arg.person_id === PERSON_ID && arg.role === 'other',
    );
    expect(extraParticipantCall).toBeDefined();
    expect(extraParticipantCall![0]).toMatchObject({
      event_id: SAVED_EVENT_ID,
      person_id: PERSON_ID,
      role: 'other',
    });
  });
});
