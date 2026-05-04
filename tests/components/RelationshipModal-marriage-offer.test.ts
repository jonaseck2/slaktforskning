import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RelationshipModal from '../../src/renderer/components/modals/RelationshipModal.vue';
import { i18n } from './setup';

// Plan: 2026-05-04-event-participants-and-marriage-flow Part C
//
// User goal: when the genealogist saves a couple+marriage relationship and
// hasn't recorded the wedding event yet, the app gently offers to record it
// inline. Decline writes nothing (Prime Directive). Accept opens EventModal
// pre-filled with marriage / person1 / person2 / relationshipId.

const REL_ID = 'rel-1';
const PERSON1_ID = 'person-bengt';
const PERSON2_ID = 'person-inger';

interface ApiSurface {
  relationships: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    getForPerson: ReturnType<typeof vi.fn>;
  };
  events: {
    forRelationship: ReturnType<typeof vi.fn>;
    forPerson: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  eventParticipants: {
    add: ReturnType<typeof vi.fn>;
    getForEvent: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  citations: { forEvent: ReturnType<typeof vi.fn> };
  sources: { get: ReturnType<typeof vi.fn> };
  persons: { getNames: ReturnType<typeof vi.fn> };
  db: { getSetting: ReturnType<typeof vi.fn> };
}

let api: ApiSurface;

function mountModalNew() {
  return mount(RelationshipModal, {
    global: { plugins: [i18n] },
    props: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  api = {
    relationships: {
      create: vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: REL_ID })),
      update: vi.fn().mockImplementation(async (id: string, input: Record<string, unknown>) => ({ ...input, id })),
      getForPerson: vi.fn().mockResolvedValue([]),
    },
    events: {
      // Default: no existing wedding event for the saved relationship.
      forRelationship: vi.fn().mockResolvedValue([]),
      forPerson: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: 'event-new' })),
      update: vi.fn(),
    },
    eventParticipants: {
      add: vi.fn().mockResolvedValue({ id: 'participant-row' }),
      getForEvent: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(true),
    },
    citations: { forEvent: vi.fn().mockResolvedValue([]) },
    sources: { get: vi.fn().mockResolvedValue(null) },
    persons: { getNames: vi.fn().mockResolvedValue([]) },
    db: { getSetting: vi.fn().mockResolvedValue(null) },
  };

  (window as unknown as { api: unknown }).api = api;
});

async function fillCoupleMarriageAndSave(wrapper: ReturnType<typeof mountModalNew>) {
  const vm = wrapper.vm as unknown as {
    form: { type: string; subtype: string; person1_id: string | null; person2_id: string | null };
    handleSave: () => Promise<void>;
  };
  vm.form.type = 'couple';
  vm.form.subtype = 'marriage';
  vm.form.person1_id = PERSON1_ID;
  vm.form.person2_id = PERSON2_ID;
  await flushPromises();
  await vm.handleSave();
  await flushPromises();
}

describe('RelationshipModal — marriage wedding offer (Part C)', () => {
  it('renders the wedding-offer ConfirmModal after saving a couple+marriage relationship with no linked wedding event', async () => {
    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleMarriageAndSave(wrapper);

    const confirms = wrapper.findAllComponents({ name: 'ConfirmModal' });
    const offer = confirms.find((c) => c.props('visible') === true);
    expect(offer).toBeDefined();
    expect(offer!.props('title')).toBe('Record a wedding?');

    // The relationship was persisted but `saved` is held back until the user
    // resolves the offer, otherwise the parent would tear us down.
    expect(api.relationships.create).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('saved')).toBeFalsy();
  });

  it('declining the offer emits saved exactly once and never creates an event row (Prime Directive)', async () => {
    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleMarriageAndSave(wrapper);

    // Trigger the cancel emit on the ConfirmModal directly — equivalent to
    // the user clicking the "Inte nu" / "Not now" button.
    const offer = wrapper
      .findAllComponents({ name: 'ConfirmModal' })
      .find((c) => c.props('visible') === true);
    expect(offer).toBeDefined();
    offer!.vm.$emit('cancel');
    await flushPromises();

    expect(api.events.create).not.toHaveBeenCalled();
    expect(wrapper.emitted('saved')).toHaveLength(1);
    const savedPayload = (wrapper.emitted('saved')![0] as unknown[])[0] as { id: string };
    expect(savedPayload.id).toBe(REL_ID);
  });

  it('accepting the offer opens an EventModal pre-filled with marriage / person1 / person2 / relationshipId', async () => {
    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleMarriageAndSave(wrapper);

    const offer = wrapper
      .findAllComponents({ name: 'ConfirmModal' })
      .find((c) => c.props('visible') === true);
    expect(offer).toBeDefined();
    offer!.vm.$emit('confirm');
    await flushPromises();

    const eventModal = wrapper.findComponent({ name: 'EventModal' });
    expect(eventModal.exists()).toBe(true);
    expect(eventModal.props('defaultEventType')).toBe('marriage');
    expect(eventModal.props('personId')).toBe(PERSON1_ID);
    expect(eventModal.props('relationshipId')).toBe(REL_ID);

    // `saved` should still be held back — we only emit after the wedding
    // event flow completes (or the user backs out of EventModal).
    expect(wrapper.emitted('saved')).toBeFalsy();
  });

  it('does not offer the wedding when the couple subtype is not marriage', async () => {
    const wrapper = mountModalNew();
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      form: { type: string; subtype: string; person1_id: string | null; person2_id: string | null };
      handleSave: () => Promise<void>;
    };
    vm.form.type = 'couple';
    vm.form.subtype = 'cohabitation';
    vm.form.person1_id = PERSON1_ID;
    vm.form.person2_id = PERSON2_ID;
    await flushPromises();
    await vm.handleSave();
    await flushPromises();

    const offer = wrapper
      .findAllComponents({ name: 'ConfirmModal' })
      .find((c) => c.props('visible') === true);
    expect(offer).toBeUndefined();
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('does not offer the wedding when a marriage event is already linked to the relationship', async () => {
    api.events.forRelationship.mockResolvedValue([
      { event_type: 'marriage' },
    ]);

    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleMarriageAndSave(wrapper);

    const offer = wrapper
      .findAllComponents({ name: 'ConfirmModal' })
      .find((c) => c.props('visible') === true);
    expect(offer).toBeUndefined();
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });
});
