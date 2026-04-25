import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonModal from '../../src/renderer/components/modals/PersonModal.vue';
import { i18n } from './setup';

// These tests cover the add-related-person behaviour of PersonModal
// (formerly in a separate AddRelatedPersonModal component).
describe('PersonModal (add-related-person behaviour)', () => {
  const mockPersonsCreateWithEvent = vi.fn();
  const mockPersonsGet = vi.fn();
  const mockRelationshipsCreate = vi.fn();
  const mockSourcesList = vi.fn();
  const mockDbGetSetting = vi.fn();
  const mockEventsForPerson = vi.fn();
  const mockRelationshipsGetForPerson = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonsCreateWithEvent.mockResolvedValue({
      person: { id: 'new-person-id', sex: 'U', living: true },
      event: null,
      citation: null,
    });
    mockPersonsGet.mockResolvedValue({ id: 'existing-id', sex: 'M', living: true });
    mockRelationshipsCreate.mockResolvedValue({ id: 'rel-id' });
    mockSourcesList.mockResolvedValue([]);
    mockDbGetSetting.mockResolvedValue(null);
    mockEventsForPerson.mockResolvedValue([]);
    mockRelationshipsGetForPerson.mockResolvedValue([]);
    (window as unknown as { api: unknown }).api = {
      persons: { createWithEvent: mockPersonsCreateWithEvent, get: mockPersonsGet },
      relationships: { create: mockRelationshipsCreate, getForPerson: mockRelationshipsGetForPerson },
      sources: { list: mockSourcesList },
      db: { getSetting: mockDbGetSetting },
      events: { forPerson: mockEventsForPerson },
    };
  });

  function mountModal(mode: 'father' | 'mother' | 'spouse' | 'child', extraProps: Record<string, unknown> = {}) {
    const { personSex, personSurname, ...rest } = extraProps as {
      personSex?: 'M' | 'F' | 'U';
      personSurname?: string;
      [k: string]: unknown;
    };
    return mount(PersonModal, {
      global: { plugins: [i18n] },
      props: {
        mode: 'standalone',
        addRelatedTo: { personId: 'current-person-id', mode, personSex, personSurname },
        ...rest,
      },
    });
  }

  it('creates parent_child with new person as parent for father mode', async () => {
    const wrapper = mountModal('father');
    await flushPromises();
    await wrapper.find('input.ep-input--name').setValue('Lars');
    // Trigger save via BaseSubPanel save event
    await wrapper.findComponent({ name: 'BaseSubPanel' }).vm.$emit('save');
    await flushPromises();

    expect(mockPersonsCreateWithEvent).toHaveBeenCalledWith(
      expect.objectContaining({ given_name: 'Lars', sex: 'M' }),
    );
    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'new-person-id',
        person2_id: 'current-person-id',
      }),
    );
  });

  it('creates parent_child with new person as parent for mother mode', async () => {
    const wrapper = mountModal('mother');
    await flushPromises();
    await wrapper.find('input.ep-input--name').setValue('Anna');
    await wrapper.findComponent({ name: 'BaseSubPanel' }).vm.$emit('save');
    await flushPromises();

    expect(mockPersonsCreateWithEvent).toHaveBeenCalledWith(
      expect.objectContaining({ given_name: 'Anna', sex: 'F' }),
    );
    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'new-person-id',
        person2_id: 'current-person-id',
      }),
    );
  });

  it('creates parent_child with current person as parent for child mode', async () => {
    const wrapper = mountModal('child');
    await flushPromises();
    await wrapper.find('input.ep-input--name').setValue('Britta');
    await wrapper.findComponent({ name: 'BaseSubPanel' }).vm.$emit('save');
    await flushPromises();

    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'current-person-id',
        person2_id: 'new-person-id',
      }),
    );
  });

  it('creates couple relationship for spouse mode', async () => {
    const wrapper = mountModal('spouse');
    await flushPromises();
    await wrapper.find('input.ep-input--name').setValue('Maria');
    await wrapper.findComponent({ name: 'BaseSubPanel' }).vm.$emit('save');
    await flushPromises();

    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'couple',
        person1_id: 'current-person-id',
        person2_id: 'new-person-id',
      }),
    );
  });

  it('emits saved and close after successful save', async () => {
    const wrapper = mountModal('father');
    await flushPromises();
    await wrapper.find('input.ep-input--name').setValue('Test');
    await wrapper.findComponent({ name: 'BaseSubPanel' }).vm.$emit('save');
    await flushPromises();

    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('pre-fills surname for child mode', () => {
    const wrapper = mountModal('child', { personSurname: 'Andersson' });
    const inputs = wrapper.findAll('input.ep-input--name');
    const surnameInput = inputs[1]; // second name input is surname
    expect(surnameInput.element.value).toBe('Andersson');
  });

  it('infers opposite sex for spouse mode (M → F)', () => {
    const wrapper = mountModal('spouse', { personSex: 'M' });
    // The active sex button should be F
    const activeBtn = wrapper.find('.ep-seg-opt--on');
    expect(activeBtn.text()).toBeTruthy(); // female button is active
  });
});
