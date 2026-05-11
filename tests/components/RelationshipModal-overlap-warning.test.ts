import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RelationshipModal from '../../src/renderer/components/modals/RelationshipModal.vue';
import { i18n } from './setup';

// Plan: 2026-05-04-event-participants-and-marriage-flow Part D
//
// User goal: when the genealogist creates a new partnership while another is
// unresolved, the app warns before silent overlap. "Unresolved" means the
// existing couple relationship has no divorce event linked AND the other
// partner has no death event.
//
// The warning is informational only — the user can still proceed (genealogy
// regularly involves overlapping or undocumented separations). Cancel writes
// nothing (Prime Directive).

const PERSON1_ID = 'person-bengt';
const PERSON2_ID = 'person-inger';
const EXISTING_PARTNER_ID = 'person-anna';
const EXISTING_REL_ID = 'rel-existing';
const NEW_REL_ID = 'rel-new';

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

function mountModalEditing() {
  return mount(RelationshipModal, {
    global: { plugins: [i18n] },
    props: {
      editingRelationship: {
        id: NEW_REL_ID,
        type: 'couple',
        person1_id: PERSON1_ID,
        person2_id: PERSON2_ID,
        subtype: 'marriage',
        notes: null,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  api = {
    relationships: {
      create: vi
        .fn()
        .mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: NEW_REL_ID })),
      update: vi
        .fn()
        .mockImplementation(async (id: string, input: Record<string, unknown>) => ({ ...input, id })),
      // Default: person1 has no existing relationships — overrides per test.
      getForPerson: vi.fn().mockResolvedValue([]),
    },
    events: {
      forRelationship: vi.fn().mockResolvedValue([]),
      forPerson: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: 'event-new' })),
      update: vi.fn(),
    },
    eventParticipants: {
      add: vi.fn().mockResolvedValue({ id: 'participant-row' }),
      getForEvent: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(true),
    },
    citations: { forEvent: vi.fn().mockResolvedValue([]) },
    sources: { get: vi.fn().mockResolvedValue(null) },
    persons: {
      getNames: vi.fn().mockImplementation(async (personId: string) => {
        if (personId === EXISTING_PARTNER_ID) {
          return [{ given_name: 'Anna', surname: 'Andersson' }];
        }
        return [];
      }),
    },
    db: { getSetting: vi.fn().mockResolvedValue(null) },
  };

  (window as unknown as { api: unknown }).api = api;
});

function setUnresolvedExistingPartnership() {
  // person1 already has a couple relationship with EXISTING_PARTNER_ID. No
  // divorce, no death — unresolved.
  api.relationships.getForPerson.mockResolvedValue([
    {
      id: EXISTING_REL_ID,
      type: 'couple',
      person1_id: PERSON1_ID,
      person2_id: EXISTING_PARTNER_ID,
    },
  ]);
}

async function fillCoupleAndSave(wrapper: ReturnType<typeof mountModalNew>) {
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

function findOverlapWarning(wrapper: ReturnType<typeof mountModalNew>) {
  return wrapper
    .findAllComponents({ name: 'ConfirmModal' })
    .find((c) => c.props('visible') === true && c.props('title') === 'Existing partnership');
}

describe('RelationshipModal — overlap warning (Part D)', async () => {
  it('fires the warning when person1 has an existing couple relationship with no divorce and other partner alive', async () => {
    setUnresolvedExistingPartnership();

    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleAndSave(wrapper);

    const warning = findOverlapWarning(wrapper);
    expect(warning).toBeDefined();
    expect(warning!.props('title')).toBe('Existing partnership');
    expect(warning!.props('message')).toContain('Anna Andersson');

    // Prime Directive: nothing has been written yet.
    expect(api.relationships.create).not.toHaveBeenCalled();
  });

  it('does not fire when the other partner has a death event', async () => {
    setUnresolvedExistingPartnership();
    // Partner has died → resolved partnership.
    api.events.forPerson.mockImplementation(async (personId: string) => {
      if (personId === EXISTING_PARTNER_ID) return [{ event_type: 'death' }];
      return [];
    });

    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleAndSave(wrapper);

    const warning = findOverlapWarning(wrapper);
    expect(warning).toBeUndefined();
    // Save proceeded (no warning held it back).
    expect(api.relationships.create).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the existing relationship has a linked divorce event', async () => {
    setUnresolvedExistingPartnership();
    api.events.forRelationship.mockImplementation(async (relId: string) => {
      if (relId === EXISTING_REL_ID) return [{ event_type: 'divorce' }];
      return [];
    });

    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleAndSave(wrapper);

    const warning = findOverlapWarning(wrapper);
    expect(warning).toBeUndefined();
    expect(api.relationships.create).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel on the warning does NOT call relationships.create (Prime Directive)', async () => {
    setUnresolvedExistingPartnership();

    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleAndSave(wrapper);

    const warning = findOverlapWarning(wrapper);
    expect(warning).toBeDefined();
    warning!.vm.$emit('cancel');
    await flushPromises();

    expect(api.relationships.create).not.toHaveBeenCalled();
    expect(wrapper.emitted('saved')).toBeFalsy();
    // Warning closed; modal stays open for the user to reconsider.
    const stillVisible = wrapper
      .findAllComponents({ name: 'ConfirmModal' })
      .find((c) => c.props('visible') === true && c.props('title') === 'Existing partnership');
    expect(stillVisible).toBeUndefined();
  });

  it('clicking Add anyway calls relationships.create with the form payload', async () => {
    setUnresolvedExistingPartnership();

    const wrapper = mountModalNew();
    await flushPromises();
    await fillCoupleAndSave(wrapper);

    const warning = findOverlapWarning(wrapper);
    expect(warning).toBeDefined();
    warning!.vm.$emit('confirm');
    await flushPromises();

    expect(api.relationships.create).toHaveBeenCalledTimes(1);
    const payload = api.relationships.create.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.type).toBe('couple');
    expect(payload.person1_id).toBe(PERSON1_ID);
    expect(payload.person2_id).toBe(PERSON2_ID);
  });

  it('does not fire when editing an existing relationship (only on create)', async () => {
    setUnresolvedExistingPartnership();

    const wrapper = mountModalEditing();
    await flushPromises();
    const vm = wrapper.vm as unknown as { handleSave: () => Promise<void> };
    await vm.handleSave();
    await flushPromises();

    const warning = findOverlapWarning(wrapper);
    expect(warning).toBeUndefined();
    expect(api.relationships.update).toHaveBeenCalledTimes(1);
  });

  it('does not fire for non-couple relationship types (e.g. parent_child)', async () => {
    setUnresolvedExistingPartnership();

    const wrapper = mountModalNew();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { type: string; subtype: string; person1_id: string | null; person2_id: string | null };
      handleSave: () => Promise<void>;
    };
    vm.form.type = 'parent_child';
    vm.form.subtype = 'biological';
    vm.form.person1_id = PERSON1_ID;
    vm.form.person2_id = PERSON2_ID;
    await flushPromises();
    await vm.handleSave();
    await flushPromises();

    const warning = findOverlapWarning(wrapper);
    expect(warning).toBeUndefined();
    expect(api.relationships.create).toHaveBeenCalledTimes(1);
  });
});
