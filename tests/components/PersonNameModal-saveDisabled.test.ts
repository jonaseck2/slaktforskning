/**
 * User goal: in the "+ Namn" dialog the user never has to guess why Save
 * isn't working, and never starts a name event from a blank field when the
 * previous name is right there.
 *
 * Concretely:
 *   1. On a person with prior names, the modal opens with given_name and
 *      surname prefilled from the current displayed name.
 *   2. Save is disabled (DOM `disabled` attribute) when both given_name
 *      and surname are blank.
 *   3. Typing a single character in either name enables Save.
 *   4. Required-field markers (red asterisk + "Required" helper) appear
 *      on each empty name field while invalid; vanish once valid.
 *   5. Clicking Save anyway (Enter-key path) on an invalid form flashes
 *      the offending field, focuses it, and shows a toast — never silent.
 *
 * Verification mode: mount + flushPromises + assert DOM + assert payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonNameModal from '../../src/renderer/components/modals/PersonNameModal.vue';
import { i18n } from './setup';

interface ApiMocks {
  persons: {
    getNames: ReturnType<typeof vi.fn>;
    addName: ReturnType<typeof vi.fn>;
    updateName: ReturnType<typeof vi.fn>;
  };
  events: { forPerson: ReturnType<typeof vi.fn> };
  citations: {
    forPersonName: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  sources: { get: ReturnType<typeof vi.fn> };
  db: { getSetting: ReturnType<typeof vi.fn> };
}

function installApi(priorNames: Array<Record<string, unknown>> = []): ApiMocks {
  const api: ApiMocks = {
    persons: {
      getNames: vi.fn().mockResolvedValue(priorNames),
      addName: vi.fn().mockResolvedValue({ id: 'new-name-id' }),
      updateName: vi.fn().mockResolvedValue({}),
    },
    events: { forPerson: vi.fn().mockResolvedValue([]) },
    citations: {
      forPersonName: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'new-cit-id' }),
      delete: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
    },
    sources: { get: vi.fn().mockResolvedValue({ title: 'Test source' }) },
    db: { getSetting: vi.fn().mockResolvedValue(null) },
  };
  (window as unknown as { api: ApiMocks }).api = api;
  return api;
}

function findSaveButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('button.ep-save-btn');
}

describe('PersonNameModal — prefill given_name + surname from current displayed name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens with given_name AND surname prefilled when person has prior names', async () => {
    installApi([
      {
        id: 'prior-1',
        given_name: 'Anna',
        surname: 'Andersson',
        name_type: 'birth',
        sort_order: 0,
        date_from: null,
        date_to: null,
      },
    ]);

    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    // [0] = given_name, [1] = surname (in document order — given is first in template).
    expect((inputs[0].element as HTMLInputElement).value).toBe('Anna');
    expect((inputs[1].element as HTMLInputElement).value).toBe('Andersson');
  });

  it('does not prefill when person has no prior names', async () => {
    installApi([]);

    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    expect((inputs[0].element as HTMLInputElement).value).toBe('');
    expect((inputs[1].element as HTMLInputElement).value).toBe('');
  });

  it('respects defaultGivenName / defaultSurname props (caller already supplied prefill)', async () => {
    installApi([
      // Even with prior names, caller-supplied defaults win — the watch
      // sets form before the async prefill runs, and prefill bails out.
      { id: 'prior-1', given_name: 'IGNORED', surname: 'IGNORED', sort_order: 0 },
    ]);

    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        defaultGivenName: 'Bertil',
        defaultSurname: 'Bengtsson',
      },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    expect((inputs[0].element as HTMLInputElement).value).toBe('Bertil');
    expect((inputs[1].element as HTMLInputElement).value).toBe('Bengtsson');
  });

  it('PRIME DIRECTIVE — prefill is a suggestion, never persisted on its own', async () => {
    // Mount in add mode with a prefill, then user clears given_name and
    // saves. The save handler must write the form's *current* value
    // (empty given_name, prefilled surname), not the original prefill.
    const api = installApi([
      { id: 'prior-1', given_name: 'Anna', surname: 'Andersson', sort_order: 0 },
    ]);

    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    await inputs[0].setValue(''); // clear given
    await inputs[1].setValue('Andersson-Berg'); // change surname
    await flushPromises();

    await findSaveButton(wrapper).trigger('click');
    await flushPromises();

    expect(api.persons.addName).toHaveBeenCalledTimes(1);
    const [, payload] = api.persons.addName.mock.calls[0];
    expect((payload as { given_name: string; surname: string }).given_name).toBe('');
    expect((payload as { given_name: string; surname: string }).surname).toBe('Andersson-Berg');
  });
});

describe('PersonNameModal — Save is disabled until at least one identifier is provided', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empty form: Save is disabled', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const saveBtn = findSaveButton(wrapper);
    expect(saveBtn.exists()).toBe(true);
    expect(saveBtn.attributes('disabled')).toBeDefined();
    expect(saveBtn.attributes('aria-disabled')).toBe('true');
  });

  it('typing in given_name alone enables Save', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    await inputs[0].setValue('A');
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('typing in surname alone enables Save (mononym path)', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    await inputs[1].setValue('Andersson');
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('whitespace-only does NOT enable Save', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    await inputs[0].setValue('   ');
    await flushPromises();

    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('clearing both fields after typing re-disables Save', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    await inputs[0].setValue('A');
    await flushPromises();
    expect(findSaveButton(wrapper).attributes('disabled')).toBeUndefined();

    await inputs[0].setValue('');
    await flushPromises();
    expect(findSaveButton(wrapper).attributes('disabled')).toBeDefined();
  });
});

describe('PersonNameModal — required-field markers + ARIA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows red asterisk and "Required" helper on both fields when both empty', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const asterisks = wrapper.findAll('.ep-required-asterisk');
    expect(asterisks.length).toBe(2);

    const helpers = wrapper.findAll('.ep-field-required-helper');
    expect(helpers.length).toBe(2);
    helpers.forEach(h => expect(h.text()).toBe('Required'));
  });

  it('asterisks vanish once either field has content', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    await inputs[0].setValue('A');
    await flushPromises();

    expect(wrapper.findAll('.ep-required-asterisk').length).toBe(0);
    expect(wrapper.findAll('.ep-field-required-helper').length).toBe(0);
  });

  it('inputs carry aria-required="true" while invalid, drop it when valid', async () => {
    installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    let inputs = wrapper.findAll('input.ep-input');
    expect(inputs[0].attributes('aria-required')).toBe('true');
    expect(inputs[1].attributes('aria-required')).toBe('true');

    await inputs[0].setValue('A');
    await flushPromises();

    inputs = wrapper.findAll('input.ep-input');
    expect(inputs[0].attributes('aria-required')).toBeUndefined();
    expect(inputs[1].attributes('aria-required')).toBeUndefined();
  });
});

describe('PersonNameModal — Enter on invalid form flashes the field instead of saving silently', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pressing Enter on empty given_name triggers a flash class and does NOT call addName', async () => {
    const api = installApi([]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const inputs = wrapper.findAll('input.ep-input');
    await inputs[0].trigger('keydown.enter');
    await flushPromises();

    // No save call.
    expect(api.persons.addName).not.toHaveBeenCalled();

    // Offending field gets the flash class.
    const flashed = wrapper.findAll('.ep-input--flash');
    expect(flashed.length).toBeGreaterThan(0);
  });
});
