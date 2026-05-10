import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import { i18n } from './setup';

// Plan: 2026-05-04-event-participants-and-marriage-flow Part A.1
//
// User goal: when a genealogist re-opens a wedding/marriage/engagement/divorce
// in edit mode from a person panel, the "Andra personen" picker is visible
// AND pre-filled with the existing spouse, exactly the same way it appears at
// create time. Bengt's regression: opening his Vigsel hid the field entirely
// and there was no UI path to see who Inger was on this event.

describe('EventModal — second-person picker in edit mode', async () => {
  const updateMock = vi.fn();
  const createMock = vi.fn();
  const addParticipantMock = vi.fn();
  const removeParticipantMock = vi.fn();
  const getForEventMock = vi.fn();

  const PRIMARY_ID = 'person-bengt';
  const OLD_SPOUSE_ID = 'person-inger';
  const NEW_SPOUSE_ID = 'person-other';
  const SPOUSE_PARTICIPANT_ROW_ID = 'participant-spouse-row';
  const NEW_PARTICIPANT_ROW_ID = 'participant-new-row';

  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockImplementation(async (id: string, input: Record<string, unknown>) => ({ ...input, id }));
    createMock.mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: 'new-id' }));
    addParticipantMock.mockResolvedValue({ id: NEW_PARTICIPANT_ROW_ID });
    removeParticipantMock.mockResolvedValue(true);
    // First call returns the original spouse; subsequent calls reflect mutations.
    getForEventMock.mockResolvedValue([
      { id: 'participant-primary-row', event_id: 'event-1', person_id: PRIMARY_ID, role: 'primary' },
      { id: SPOUSE_PARTICIPANT_ROW_ID, event_id: 'event-1', person_id: OLD_SPOUSE_ID, role: 'spouse' },
    ]);

    (window as unknown as { api: unknown }).api = {
      events: {
        create: createMock,
        update: updateMock,
        forPerson: vi.fn().mockResolvedValue([]),
      },
      eventParticipants: {
        getForEvent: getForEventMock,
        add: addParticipantMock,
        remove: removeParticipantMock,
      },
      citations: {
        forEvent: vi.fn().mockResolvedValue([]),
      },
      sources: { get: vi.fn().mockResolvedValue(null) },
      persons: {
        getNames: vi.fn().mockResolvedValue([]),
      },
      relationships: {
        // Bengt has no other partner relationships → partnerOptions stays
        // empty so the picker falls back to the PersonPicker branch.
        getForPerson: vi.fn().mockResolvedValue([]),
      },
      db: {
        getSetting: vi.fn().mockResolvedValue(null),
      },
    };
  });

  function makeWeddingEvent() {
    return {
      id: 'event-1',
      event_type: 'wedding',
      date_type: 'exact' as const,
      date_value: '1965-06-12',
      date_value_end: null,
      date_original: '1965-06-12',
      place_id: null,
      cause: null,
      value: null,
      notes: '',
    };
  }

  it('renders the second-person picker and pre-fills it from event_participants when editing', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {
        editingEvent: makeWeddingEvent(),
        personId: PRIMARY_ID,
      },
    });
    await flushPromises();

    // The PersonPicker child should be rendered (showSecondPersonField true)
    // and bound to the spouse from event_participants.
    const personPicker = wrapper.findComponent({ name: 'PersonPicker' });
    expect(personPicker.exists()).toBe(true);
    expect(personPicker.props('modelValue')).toBe(OLD_SPOUSE_ID);

    // And the underlying form state reflects it (used by handleSave logic).
    const vm = wrapper.vm as unknown as { secondPersonId: string | null };
    expect(vm.secondPersonId).toBe(OLD_SPOUSE_ID);
  });

  it('save with unchanged spouse is a no-op for participants (Prime Directive: no blind delete + reinsert)', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {
        editingEvent: makeWeddingEvent(),
        personId: PRIMARY_ID,
      },
    });
    await flushPromises();

    await (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave();
    await flushPromises();

    expect(updateMock).toHaveBeenCalled();
    expect(addParticipantMock).not.toHaveBeenCalled();
    expect(removeParticipantMock).not.toHaveBeenCalled();
  });

  it('save with a changed spouse removes the old row and adds a new one', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {
        editingEvent: makeWeddingEvent(),
        personId: PRIMARY_ID,
      },
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as { secondPersonId: string | null };
    vm.secondPersonId = NEW_SPOUSE_ID;
    await flushPromises();

    await (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave();
    await flushPromises();

    expect(removeParticipantMock).toHaveBeenCalledWith(SPOUSE_PARTICIPANT_ROW_ID);
    expect(addParticipantMock).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'event-1',
      person_id: NEW_SPOUSE_ID,
      role: 'spouse',
    }));
  });

  it('save with cleared spouse removes the existing spouse row and does not add a replacement', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {
        editingEvent: makeWeddingEvent(),
        personId: PRIMARY_ID,
      },
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as { secondPersonId: string | null };
    vm.secondPersonId = null;
    await flushPromises();

    await (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave();
    await flushPromises();

    expect(removeParticipantMock).toHaveBeenCalledWith(SPOUSE_PARTICIPANT_ROW_ID);
    expect(addParticipantMock).not.toHaveBeenCalled();
  });
});
