import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonModal from '../../src/renderer/components/modals/PersonModal.vue';
import { i18n } from './setup';

/**
 * User goal: the genealogist cannot accidentally create a `persons` row with
 * no `names` row attached. Save in NewPersonModal is *visibly disabled* until
 * at least one identifier is typed (or, in existing-person link mode, a
 * person has been picked).
 *
 * These tests assert the user-observable DOM contract: the actual `disabled`
 * attribute on the save button. Lint and type-check are hygiene; they cannot
 * prove this behavior.
 */
describe('PersonModal — Save is disabled until an identifier is provided', async () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      persons: {
        createWithEvent: vi.fn().mockResolvedValue({ person: { id: 'p1', sex: 'U', living: true }, event: null, citation: null }),
        get: vi.fn().mockResolvedValue({ id: 'existing-id', sex: 'U', living: true }),
        getNames: vi.fn().mockResolvedValue([]),
        listPage: vi.fn().mockResolvedValue({ persons: [], total: 0 }),
      },
      relationships: {
        create: vi.fn().mockResolvedValue({ id: 'r1' }),
        getForPerson: vi.fn().mockResolvedValue([]),
      },
      events: { forPerson: vi.fn().mockResolvedValue([]) },
      sources: { list: vi.fn().mockResolvedValue([]) },
      db: { getSetting: vi.fn().mockResolvedValue(null) },
    };
  });

  function findSaveButton(wrapper: ReturnType<typeof mount>) {
    // The save button is the only `.ep-save-btn` in the rendered tree.
    return wrapper.find('button.ep-save-btn');
  }

  it('create mode: Save is disabled on empty form, enables when a name is typed, disables again on clear', async () => {
    const wrapper = mount(PersonModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    const saveBtn = findSaveButton(wrapper);
    expect(saveBtn.exists()).toBe(true);
    // Empty form → Save disabled (the user-observable contract).
    expect(saveBtn.attributes('disabled')).toBeDefined();

    // Type one character into the given-name input.
    const nameInputs = wrapper.findAll('input.ep-input--name');
    expect(nameInputs.length).toBeGreaterThan(0);
    await nameInputs[0].setValue('A');
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();

    // Clear it again → Save disabled.
    await nameInputs[0].setValue('');
    await flushPromises();
    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('create mode: typing in surname alone also enables Save', async () => {
    const wrapper = mount(PersonModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();

    const nameInputs = wrapper.findAll('input.ep-input--name');
    // [0] = given_name, [1] = surname.
    await nameInputs[1].setValue('Andersson');
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('create mode: whitespace-only input does NOT enable Save', async () => {
    const wrapper = mount(PersonModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    const nameInputs = wrapper.findAll('input.ep-input--name');
    await nameInputs[0].setValue('   ');
    await flushPromises();
    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('addRelatedTo "existing" mode: Save is disabled until a person is picked', async () => {
    const wrapper = mount(PersonModal, {
      global: { plugins: [i18n] },
      props: {
        mode: 'standalone',
        addRelatedTo: { personId: 'current', mode: 'father' },
      },
    });
    await flushPromises();

    // Switch to existing-person mode (the toggle button labelled by addRelated.existingPerson).
    const segOpts = wrapper.findAll('.ep-seg-opt');
    // First two .ep-seg-opt buttons in document order are [existing, new] (the entry-mode segmented control).
    await segOpts[0].trigger('click');
    await flushPromises();

    // No person picked yet → Save disabled.
    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();

    // Simulate the PersonPicker selecting a person by emitting update:model-value.
    const picker = wrapper.findComponent({ name: 'PersonPicker' });
    expect(picker.exists()).toBe(true);
    await picker.vm.$emit('update:model-value', 'picked-person-id');
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();
  });
});
