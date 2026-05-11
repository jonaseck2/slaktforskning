/**
 * User goal coverage for PersonNameModal:
 *   1. Editing a `name_change` row gets a citation block (Hänvisning) under
 *      "Mer", and `Giltigt till` is hidden because a name change date marks
 *      *when the new name took effect* — the name doesn't expire on its own.
 *   2. `alias` / `aka` rows DO surface a date_to field, relabelled
 *      "Användes till" / "Used until" since those names live for a period.
 *   3. PRIME DIRECTIVE — hiding the input does not null the value. A legacy
 *      `name_change` row with `date_to` already filled keeps that value when
 *      the user opens the modal and saves without other changes.
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

function installApi(): ApiMocks {
  const api: ApiMocks = {
    persons: {
      getNames: vi.fn().mockResolvedValue([
        { id: 'name-1', given_name: 'Anna', surname: 'Andersson' },
      ]),
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

function nameRow(overrides: Record<string, unknown>) {
  return {
    id: 'existing-name-id',
    person_id: 'p1',
    given_name: 'Anna',
    surname: 'Andersson',
    name_type: 'birth',
    name_prefix: null,
    name_suffix: null,
    name_qualifier: null,
    patronymic_base: null,
    preferred_name: null,
    nickname: null,
    date_from: null,
    date_to: null,
    sort_order: 0,
    ...overrides,
  };
}

describe('PersonNameModal — date_to visibility per name_type', async () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installApi();
  });

  it('name_change: hides date_to entirely', async () => {
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({ name_type: 'name_change' }),
      },
    });
    await flushPromises();
    // Open the <details> "Mer" section so its children render in JSDOM.
    const details = wrapper.find('details.ep-details');
    (details.element as HTMLDetailsElement).open = true;
    await wrapper.vm.$nextTick();

    const labels = wrapper.findAll('.ep-field-label').map(e => e.text());
    expect(labels).not.toContain('Valid to');
    expect(labels).not.toContain('Used until');
  });

  it('birth: hides date_to (replaced by next name change / married event)', async () => {
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({ name_type: 'birth' }),
      },
    });
    await flushPromises();
    const details = wrapper.find('details.ep-details');
    (details.element as HTMLDetailsElement).open = true;
    await wrapper.vm.$nextTick();

    const labels = wrapper.findAll('.ep-field-label').map(e => e.text());
    expect(labels).not.toContain('Valid to');
    expect(labels).not.toContain('Used until');
  });

  it('married: shows date_to with the generic "Valid to" label', async () => {
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({ name_type: 'married' }),
      },
    });
    await flushPromises();
    const details = wrapper.find('details.ep-details');
    (details.element as HTMLDetailsElement).open = true;
    await wrapper.vm.$nextTick();

    const labels = wrapper.findAll('.ep-field-label').map(e => e.text());
    expect(labels).toContain('Valid to');
    expect(labels).not.toContain('Used until');
  });

  it('alias: shows date_to relabelled "Used until"', async () => {
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({ name_type: 'alias' }),
      },
    });
    await flushPromises();
    const details = wrapper.find('details.ep-details');
    (details.element as HTMLDetailsElement).open = true;
    await wrapper.vm.$nextTick();

    const labels = wrapper.findAll('.ep-field-label').map(e => e.text());
    expect(labels).toContain('Used until');
    expect(labels).not.toContain('Valid to');
  });

  it('aka: shows date_to relabelled "Used until"', async () => {
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({ name_type: 'aka' }),
      },
    });
    await flushPromises();
    const details = wrapper.find('details.ep-details');
    (details.element as HTMLDetailsElement).open = true;
    await wrapper.vm.$nextTick();

    const labels = wrapper.findAll('.ep-field-label').map(e => e.text());
    expect(labels).toContain('Used until');
  });
});

describe('PersonNameModal — Prime Directive: hidden field does not null authored data', async () => {
  it('saving a name_change row that already has date_to keeps the value', async () => {
    const api = installApi();
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({
          name_type: 'name_change',
          date_to: '2020-01-01',
        }),
      },
    });
    await flushPromises();
    // Save without touching anything. The field is hidden in the UI but
    // form.date_to was hydrated from the row, so the save payload must
    // still carry '2020-01-01'.
    (await wrapper.find('button[data-test-id="basesubpanel-save"], .ep-save, button[type="submit"]')).exists()
      ? wrapper.find('button[type="submit"]').trigger('click')
      : (wrapper.vm as unknown as { handleSave: () => Promise<void> }).handleSave();
    await flushPromises();

    expect(api.persons.updateName).toHaveBeenCalledTimes(1);
    const [calledId, payload] = api.persons.updateName.mock.calls[0];
    expect(calledId).toBe('existing-name-id');
    expect((payload as { date_to: string | null }).date_to).toBe('2020-01-01');
  });
});

describe('PersonNameModal — citation block', async () => {
  it('renders the Hänvisning section header with an "+ Add citation" button', async () => {
    installApi();
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({ name_type: 'name_change' }),
      },
    });
    await flushPromises();
    const citationHeader = wrapper.find('.ep-sec-header[data-entity="citation"]');
    expect(citationHeader.exists()).toBe(true);
    // Action button label is the entity-typed Add CTA from sourceDetail.addCitation
    const actionBtn = citationHeader.find('.ep-sec-action');
    expect(actionBtn.exists()).toBe(true);
    expect(actionBtn.text()).toContain('Citation');
  });

  it('loads existing citations for the edited name on mount', async () => {
    const api = installApi();
    api.citations.forPersonName.mockResolvedValueOnce([
      { id: 'cit-1', source_id: 'src-1', page: 'p. 5', confidence: 3 },
    ]);
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: {
        personId: 'p1',
        editingName: nameRow({ id: 'name-9', name_type: 'name_change' }),
      },
    });
    await flushPromises();
    expect(api.citations.forPersonName).toHaveBeenCalledWith('name-9');
    // The chip row renders the source title resolved via sources.get
    const rows = wrapper.findAll('.ep-entity-row');
    expect(rows.length).toBe(1);
    expect(rows[0].text()).toContain('p. 5');
    expect(rows[0].text()).toContain('Test source');
  });
});
