import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventParticipantsSection from '../../src/renderer/components/EventParticipantsSection.vue';
import { i18n } from './setup';

// Plan: 2026-05-04-event-participants-and-marriage-flow Part A.2.
//
// User goal: when Bengt opens any event (baptism, funeral, wedding, …) in
// EventModal, he sees a Deltagare (Participants) section with the SAME
// affordance regardless of event type, so he can record godparents on a
// baptism, mourners on a funeral, witnesses on a wedding. Today only
// couple events expose any "other persons" UI.

describe('EventParticipantsSection', async () => {
  const getForEventMock = vi.fn();
  const addMock = vi.fn();
  const removeMock = vi.fn();
  const getNamesMock = vi.fn();
  const forPersonMock = vi.fn();

  const EVENT_ID = 'event-baptism-1';
  const PRIMARY_ID = 'person-primary';
  const GODPARENT_ID = 'person-godparent';
  const NEW_GUEST_ID = 'person-new-guest';
  const PARTICIPANT_ROW_ID = 'participant-row-godparent';

  beforeEach(() => {
    vi.clearAllMocks();
    addMock.mockResolvedValue({ id: 'new-row' });
    removeMock.mockResolvedValue(true);
    getForEventMock.mockResolvedValue([
      { id: 'participant-primary-row', event_id: EVENT_ID, person_id: PRIMARY_ID, role: 'primary' },
      { id: PARTICIPANT_ROW_ID, event_id: EVENT_ID, person_id: GODPARENT_ID, role: 'other' },
    ]);
    getNamesMock.mockImplementation(async (id: string) => {
      if (id === GODPARENT_ID) {
        return [{
          id: 'name-1', given_name: 'Anna', surname: 'Andersson',
          preferred_name: null, nickname: null,
          sort_order: 0, name_type: 'birth', date_from: null,
        }];
      }
      return [{
        id: 'name-x', given_name: 'X', surname: 'X',
        preferred_name: null, nickname: null,
        sort_order: 0, name_type: 'birth', date_from: null,
      }];
    });
    forPersonMock.mockResolvedValue([]);

    (window as unknown as { api: unknown }).api = {
      eventParticipants: {
        getForEvent: getForEventMock,
        add: addMock,
        remove: removeMock,
      },
      persons: { getNames: getNamesMock },
      events: { forPerson: forPersonMock },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  // Rapport 102 §4 (plan 2026-05-31-ben-feedback-polish): on an unsaved event
  // the picker is now ALWAYS rendered (no static "save first" hint). Picking a
  // person emits `request-save` so the parent (EventModal) can offer
  // save-and-continue, instead of silently doing nothing.
  it('renders the PersonPicker (no save-first hint) and emits request-save when eventId is null', async () => {
    const wrapper = mount(EventParticipantsSection, {
      global: { plugins: [i18n] },
      props: { eventId: null, excludePersonIds: [] },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain('Save the event first to add additional participants');
    const picker = wrapper.findComponent({ name: 'PersonPicker' });
    expect(picker.exists()).toBe(true);

    // Picking a person on an unsaved event must NOT call the add API directly;
    // it emits request-save with the picked person id for the parent to handle.
    picker.vm.$emit('update:modelValue', NEW_GUEST_ID);
    await flushPromises();

    expect(addMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('request-save')).toBeTruthy();
    expect(wrapper.emitted('request-save')![0]).toEqual([NEW_GUEST_ID]);
  });

  it('renders only non-excluded participants and shows the PersonPicker for adding more', async () => {
    const wrapper = mount(EventParticipantsSection, {
      global: { plugins: [i18n] },
      props: { eventId: EVENT_ID, excludePersonIds: [PRIMARY_ID] },
    });
    await flushPromises();
    await flushPromises();

    // Picker is visible — same affordance regardless of event type.
    expect(wrapper.findComponent({ name: 'PersonPicker' }).exists()).toBe(true);

    // The primary is excluded, only the godparent should appear in the row.
    const text = wrapper.text();
    expect(text).toContain('Anna');
    expect(text).toContain('Andersson');

    // Exactly one extra participant row rendered.
    const rows = wrapper.findAll('.ep-entity-row');
    expect(rows.length).toBe(1);
  });

  it('clicking the remove button calls eventParticipants.remove with the participant row id', async () => {
    const wrapper = mount(EventParticipantsSection, {
      global: { plugins: [i18n] },
      props: { eventId: EVENT_ID, excludePersonIds: [PRIMARY_ID] },
    });
    await flushPromises();
    await flushPromises();

    const removeBtn = wrapper.find('.ep-entity-row .btn-delete');
    expect(removeBtn.exists()).toBe(true);
    await removeBtn.trigger('click');
    await flushPromises();

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(PARTICIPANT_ROW_ID);
  });

  it('picking a person via PersonPicker calls eventParticipants.add with role "other"', async () => {
    const wrapper = mount(EventParticipantsSection, {
      global: { plugins: [i18n] },
      props: { eventId: EVENT_ID, excludePersonIds: [PRIMARY_ID] },
    });
    await flushPromises();
    await flushPromises();

    const picker = wrapper.findComponent({ name: 'PersonPicker' });
    expect(picker.exists()).toBe(true);

    // PersonPicker emits update:modelValue when a person is chosen.
    picker.vm.$emit('update:modelValue', NEW_GUEST_ID);
    await flushPromises();

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith({
      event_id: EVENT_ID,
      person_id: NEW_GUEST_ID,
      role: 'other',
    });
  });
});
