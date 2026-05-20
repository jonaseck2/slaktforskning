import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonNameTranslationsSection from '../../src/renderer/components/PersonNameTranslationsSection.vue';
import { i18n } from './setup';

const nameRows = [
  { id: 't-1', person_name_id: 'pn-1', value: 'Иван', language: 'ru', transliteration_scheme: '', created_at: '2026-01-01' },
  { id: 't-2', person_name_id: 'pn-1', value: 'Ivan', language: 'en', transliteration_scheme: 'BGN/PCGN', created_at: '2026-01-02' },
];

const placeRows = [
  { id: 'pt-1', place_id: 'pl-1', value: 'København', language: 'da', transliteration_scheme: '', created_at: '2026-01-01' },
];

function installMockApi() {
  const nameForName = vi.fn().mockResolvedValue(nameRows);
  const nameCreate = vi.fn().mockResolvedValue({ id: 't-new' });
  const nameDelete = vi.fn().mockResolvedValue(true);
  const placeForPlace = vi.fn().mockResolvedValue(placeRows);
  const placeCreate = vi.fn().mockResolvedValue({ id: 'pt-new' });
  const placeDelete = vi.fn().mockResolvedValue(true);
  (window as unknown as { api: unknown }).api = {
    nameTranslations: { forName: nameForName, create: nameCreate, update: vi.fn(), delete: nameDelete },
    placeTranslations: { forPlace: placeForPlace, create: placeCreate, update: vi.fn(), delete: placeDelete },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
  };
  return { nameForName, nameCreate, nameDelete, placeForPlace, placeCreate, placeDelete };
}

describe('PersonNameTranslationsSection (kind="name")', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads + renders name translations for the host name', async () => {
    const m = installMockApi();
    const wrapper = mount(PersonNameTranslationsSection, {
      global: { plugins: [i18n] },
      props: { kind: 'name', parentId: 'pn-1' },
    });
    await flushPromises();

    expect(m.nameForName).toHaveBeenCalledWith('pn-1');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.text()).toContain('Иван');
    expect(wrapper.text()).toContain('ru');
    expect(wrapper.text()).toContain('BGN/PCGN');
  });

  it('inline add row creates a new translation with parent flowing in (context lift)', async () => {
    const m = installMockApi();
    const wrapper = mount(PersonNameTranslationsSection, {
      global: { plugins: [i18n] },
      props: { kind: 'name', parentId: 'pn-1' },
    });
    await flushPromises();

    // Open the inline form via defineExpose
    (wrapper.vm as unknown as { openAdd: () => void }).openAdd();
    await flushPromises();

    const inputs = wrapper.findAll('.tr-input');
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    await inputs[0].setValue('Iwan');
    await inputs[1].setValue('de');
    // Click Save (first AppButton inside the form)
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save');
    expect(saveBtn).toBeTruthy();
    await saveBtn!.trigger('click');
    await flushPromises();

    // Host parent flows into the create payload
    expect(m.nameCreate).toHaveBeenCalledWith({
      person_name_id: 'pn-1',
      value: 'Iwan',
      language: 'de',
      transliteration_scheme: '',
    });
  });

  it('exposes count for the parent header', async () => {
    installMockApi();
    const wrapper = mount(PersonNameTranslationsSection, {
      global: { plugins: [i18n] },
      props: { kind: 'name', parentId: 'pn-1' },
    });
    await flushPromises();
    expect((wrapper.vm as unknown as { count: number }).count).toBe(2);
  });
});

describe('PersonNameTranslationsSection (kind="place")', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads + renders place translations via placeTranslations.forPlace', async () => {
    const m = installMockApi();
    const wrapper = mount(PersonNameTranslationsSection, {
      global: { plugins: [i18n] },
      props: { kind: 'place', parentId: 'pl-1' },
    });
    await flushPromises();

    expect(m.placeForPlace).toHaveBeenCalledWith('pl-1');
    expect(wrapper.text()).toContain('København');
    expect(wrapper.text()).toContain('da');
  });

  it('create payload routes via placeTranslations.create with place_id flowing in', async () => {
    const m = installMockApi();
    const wrapper = mount(PersonNameTranslationsSection, {
      global: { plugins: [i18n] },
      props: { kind: 'place', parentId: 'pl-1' },
    });
    await flushPromises();

    (wrapper.vm as unknown as { openAdd: () => void }).openAdd();
    await flushPromises();

    const inputs = wrapper.findAll('.tr-input');
    await inputs[0].setValue('Copenhagen');
    await inputs[1].setValue('en');
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save');
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(m.placeCreate).toHaveBeenCalledWith({
      place_id: 'pl-1',
      value: 'Copenhagen',
      language: 'en',
      transliteration_scheme: '',
    });
  });
});
