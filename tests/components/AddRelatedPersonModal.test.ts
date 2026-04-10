import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AddRelatedPersonModal from '../../src/renderer/components/AddRelatedPersonModal.vue';
import { i18n } from './setup';

describe('AddRelatedPersonModal', () => {
  const mockPersonsCreate = vi.fn();
  const mockRelationshipsCreate = vi.fn();
  const mockSourcesList = vi.fn();
  const mockEventsCreate = vi.fn();
  const mockEventParticipantsAdd = vi.fn();
  const mockCitationsCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonsCreate.mockResolvedValue({ id: 'new-person-id' });
    mockRelationshipsCreate.mockResolvedValue({ id: 'rel-id' });
    mockSourcesList.mockResolvedValue([]);
    mockEventsCreate.mockResolvedValue({ id: 'new-event-id' });
    mockEventParticipantsAdd.mockResolvedValue({ id: 'ep-id' });
    mockCitationsCreate.mockResolvedValue({ id: 'cit-id' });
    (window as unknown as { api: unknown }).api = {
      persons: { create: mockPersonsCreate },
      relationships: { create: mockRelationshipsCreate },
      sources: { list: mockSourcesList },
      events: { create: mockEventsCreate },
      eventParticipants: { add: mockEventParticipantsAdd },
      citations: { create: mockCitationsCreate },
    };
  });

  function mountModal(mode: 'father' | 'mother' | 'spouse' | 'child', extraProps: Record<string, unknown> = {}) {
    return mount(AddRelatedPersonModal, {
      global: { plugins: [i18n] },
      props: { personId: 'current-person-id', mode, ...extraProps },
    });
  }

  it('shows "Add Father" title for father mode', () => {
    const wrapper = mountModal('father');
    expect(wrapper.find('h3').text()).toBe('Add Father');
  });

  it('shows "Add Mother" title for mother mode', () => {
    const wrapper = mountModal('mother');
    expect(wrapper.find('h3').text()).toBe('Add Mother');
  });

  it('shows "Add Spouse/Partner" title for spouse mode', () => {
    const wrapper = mountModal('spouse');
    expect(wrapper.find('h3').text()).toBe('Add Spouse/Partner');
  });

  it('shows "Add Child" title for child mode', () => {
    const wrapper = mountModal('child');
    expect(wrapper.find('h3').text()).toBe('Add Child');
  });

  it('shows subtype select only in spouse mode', () => {
    const fatherWrapper = mountModal('father');
    expect(fatherWrapper.findAll('select')).toHaveLength(1); // sex only

    const spouseWrapper = mountModal('spouse');
    expect(spouseWrapper.findAll('select')).toHaveLength(2); // sex + subtype
  });

  it('creates parent_child with new person as parent for father mode', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Lars');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockPersonsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ given_name: 'Lars', sex: 'M' }),
    );
    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'new-person-id',     // new person IS the parent
        person2_id: 'current-person-id', // current person IS the child
      }),
    );
  });

  it('creates parent_child with new person as parent for mother mode', async () => {
    const wrapper = mountModal('mother');
    await wrapper.find('input[type="text"]').setValue('Anna');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockPersonsCreate).toHaveBeenCalledWith(
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
    await wrapper.find('input[type="text"]').setValue('Britta');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'current-person-id', // current person IS the parent
        person2_id: 'new-person-id',     // new person IS the child
      }),
    );
  });

  it('creates couple relationship for spouse mode', async () => {
    const wrapper = mountModal('spouse');
    await wrapper.find('input[type="text"]').setValue('Maria');
    await wrapper.find('form').trigger('submit');
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
    await wrapper.find('input[type="text"]').setValue('Test');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('auto-sets sex to M for father mode', () => {
    const wrapper = mountModal('father');
    const sexSelect = wrapper.find('select');
    expect(sexSelect.element.value).toBe('M');
  });

  it('auto-sets sex to F for mother mode', () => {
    const wrapper = mountModal('mother');
    const sexSelect = wrapper.find('select');
    expect(sexSelect.element.value).toBe('F');
  });

  it('infers opposite sex for spouse mode', () => {
    const wrapper = mountModal('spouse', { personSex: 'M' });
    const sexSelect = wrapper.find('select');
    expect(sexSelect.element.value).toBe('F');
  });

  it('pre-fills surname for child mode', () => {
    const wrapper = mountModal('child', { personSurname: 'Andersson' });
    const surnameInput = wrapper.findAll('input[type="text"]')[1]; // second text input is surname
    expect(surnameInput.element.value).toBe('Andersson');
  });

  it('creates birth event when birth date is provided', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Gustaf');
    // Find birth date input inside details
    const dateInput = wrapper.find('input[type="date"]');
    await dateInput.setValue('1912-02-24');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockEventsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'birth',
        date_value: '1912-02-24',
      }),
    );
    expect(mockEventParticipantsAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: 'new-event-id',
        person_id: 'new-person-id',
        role: 'primary',
      }),
    );
  });

  it('skips birth event when no birth fields filled', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Gustaf');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockEventsCreate).not.toHaveBeenCalled();
    expect(mockEventParticipantsAdd).not.toHaveBeenCalled();
  });

  it('does not create citation when source checkbox is unchecked', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Gustaf');
    const dateInput = wrapper.find('input[type="date"]');
    await dateInput.setValue('1912-02-24');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Birth event created but no citation
    expect(mockEventsCreate).toHaveBeenCalled();
    expect(mockCitationsCreate).not.toHaveBeenCalled();
  });
});
