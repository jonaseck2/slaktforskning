import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RelationshipModal from '../../src/renderer/components/modals/RelationshipModal.vue';
import { i18n } from './setup';

/**
 * Plan: 2026-05-06-relationship-modal-broken
 *
 * User goal:
 * 1. The Save button is *visibly disabled* (DOM `disabled` attribute) when
 *    the form isn't ready to save — never the "looks active but does
 *    nothing" UX that triggered beta-tester report 78.
 * 2. When save fails, the error toast surfaces the underlying error message
 *    rather than the generic "Could not save. Please try again." that hides
 *    the actual cause.
 *
 * These tests observe the user-visible DOM and emitted toast text — not
 * structural hygiene. A passing run proves the user goal as stated.
 */

const REL_ID = 'rel-edit-1';
const PERSON1_ID = 'person-z';
const PERSON2_ID = 'person-p';

interface ApiSurface {
  relationships: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    getForPerson: ReturnType<typeof vi.fn>;
  };
  events: {
    forRelationship: ReturnType<typeof vi.fn>;
    forPerson: ReturnType<typeof vi.fn>;
  };
  persons: { getNames: ReturnType<typeof vi.fn> };
}

let api: ApiSurface;
const toastErrorSpy = vi.fn();

vi.mock('../../src/renderer/composables/useToast', () => ({
  useToast: () => ({
    error: toastErrorSpy,
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  toastErrorSpy.mockReset();

  api = {
    relationships: {
      create: vi.fn().mockResolvedValue({ id: REL_ID }),
      update: vi.fn().mockResolvedValue({ id: REL_ID }),
      getForPerson: vi.fn().mockResolvedValue([]),
    },
    events: {
      forRelationship: vi.fn().mockResolvedValue([]),
      forPerson: vi.fn().mockResolvedValue([]),
    },
    persons: { getNames: vi.fn().mockResolvedValue([]) },
  };

  (window as unknown as { api: unknown }).api = api;
});

function findSaveButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('button.ep-save-btn');
}

describe('RelationshipModal — Save is visibly disabled until the form is valid', () => {
  it('create mode: Save is disabled with no persons picked, enables when both are picked', async () => {
    const wrapper = mount(RelationshipModal, {
      global: { plugins: [i18n] },
      props: {},
    });
    await flushPromises();

    const saveBtn = findSaveButton(wrapper);
    expect(saveBtn.exists()).toBe(true);
    // Empty form (no person1_id, no person2_id) — must be disabled.
    expect(saveBtn.attributes('disabled')).toBeDefined();

    const vm = wrapper.vm as unknown as {
      form: { type: string; subtype: string; person1_id: string | null; person2_id: string | null };
    };
    vm.form.person1_id = PERSON1_ID;
    await flushPromises();
    // Only person1 picked — still disabled.
    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();

    vm.form.person2_id = PERSON2_ID;
    await flushPromises();
    // Both picked — enabled (no `disabled` attribute).
    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('Save is disabled when both persons resolve to the same id (self-link guard)', async () => {
    const wrapper = mount(RelationshipModal, {
      global: { plugins: [i18n] },
      props: {},
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      form: { type: string; subtype: string; person1_id: string | null; person2_id: string | null };
    };
    vm.form.person1_id = PERSON1_ID;
    vm.form.person2_id = PERSON1_ID;
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('edit mode: Save is enabled when an existing relationship is loaded, disabled when person is cleared', async () => {
    const wrapper = mount(RelationshipModal, {
      global: { plugins: [i18n] },
      props: {
        editingRelationship: {
          id: REL_ID,
          type: 'couple',
          subtype: 'cohabitation',
          person1_id: PERSON1_ID,
          person2_id: PERSON2_ID,
          notes: null,
        },
      },
    });
    await flushPromises();

    // Both persons already set from the editing prop — Save must be enabled.
    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();

    // Simulate the user clearing person2 — Save disables.
    const vm = wrapper.vm as unknown as {
      form: { person2_id: string | null };
    };
    vm.form.person2_id = null;
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();
  });
});

describe('RelationshipModal — save error surfaces the underlying detail', () => {
  it('toast.error contains the rejected error message, not just the generic prefix', async () => {
    api.relationships.update.mockRejectedValueOnce(new Error('FOREIGN KEY constraint failed'));

    const wrapper = mount(RelationshipModal, {
      global: { plugins: [i18n] },
      props: {
        editingRelationship: {
          id: REL_ID,
          type: 'couple',
          subtype: 'cohabitation',
          person1_id: PERSON1_ID,
          person2_id: PERSON2_ID,
          notes: null,
        },
      },
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as { handleSave: () => Promise<void> };
    await vm.handleSave();
    await flushPromises();

    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    const message = toastErrorSpy.mock.calls[0][0] as string;
    // The error detail must appear in the toast text — that's the
    // user-observable contract this test guards.
    expect(message).toContain('FOREIGN KEY constraint failed');
  });

  it('toast still shows a fallback when the rejected value is not an Error (string / undefined)', async () => {
    api.relationships.update.mockRejectedValueOnce('string error');

    const wrapper = mount(RelationshipModal, {
      global: { plugins: [i18n] },
      props: {
        editingRelationship: {
          id: REL_ID,
          type: 'couple',
          subtype: 'cohabitation',
          person1_id: PERSON1_ID,
          person2_id: PERSON2_ID,
          notes: null,
        },
      },
    });
    await flushPromises();

    const vm = wrapper.vm as unknown as { handleSave: () => Promise<void> };
    await vm.handleSave();
    await flushPromises();

    expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    const message = toastErrorSpy.mock.calls[0][0] as string;
    expect(message).toContain('string error');
  });
});
