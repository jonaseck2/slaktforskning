import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AddRelatedPersonModal from '../../src/renderer/components/AddRelatedPersonModal.vue';
import { i18n } from './setup';

describe('AddRelatedPersonModal', () => {
  const mockPersonsCreateWithEvent = vi.fn();
  const mockRelationshipsCreate = vi.fn();
  const mockSourcesList = vi.fn();
  const mockDbGetSetting = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonsCreateWithEvent.mockResolvedValue({
      person: { id: 'new-person-id', sex: 'U', living: true },
      event: null,
      citation: null,
    });
    mockRelationshipsCreate.mockResolvedValue({ id: 'rel-id' });
    mockSourcesList.mockResolvedValue([]);
    mockDbGetSetting.mockResolvedValue(null);
    (window as unknown as { api: unknown }).api = {
      persons: { createWithEvent: mockPersonsCreateWithEvent },
      relationships: { create: mockRelationshipsCreate },
      sources: { list: mockSourcesList },
      db: { getSetting: mockDbGetSetting },
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

  it('shows subtype select in all modes', () => {
    const fatherWrapper = mountModal('father');
    // sex + parent_child subtype are always present (EventFormBody adds more but those
    // are for the event section, not the relationship subtype)
    expect(fatherWrapper.findAll('select').length).toBeGreaterThanOrEqual(2);

    const spouseWrapper = mountModal('spouse');
    expect(spouseWrapper.findAll('select').length).toBeGreaterThanOrEqual(2);
  });

  it('creates parent_child with new person as parent for father mode', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Lars');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockPersonsCreateWithEvent).toHaveBeenCalledWith(
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

  it('submits event payload when event section is open', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Gustaf');

    // Open the event details section
    const details = wrapper.find('details.event-section');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await flushPromises();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockPersonsCreateWithEvent).toHaveBeenCalledTimes(1);
    const payload = mockPersonsCreateWithEvent.mock.calls[0][0];
    expect(payload.given_name).toBe('Gustaf');
    expect(payload.event).toBeDefined();
    expect(payload.event.event_type).toBe('birth');
  });

  it('omits event payload when event section is closed', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Gustaf');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockPersonsCreateWithEvent).toHaveBeenCalledTimes(1);
    const payload = mockPersonsCreateWithEvent.mock.calls[0][0];
    expect(payload.event).toBeUndefined();
    expect(payload.citation).toBeUndefined();
  });

  it('omits citation when no source is selected', async () => {
    const wrapper = mountModal('father');
    await wrapper.find('input[type="text"]').setValue('Gustaf');

    // Open the event details section (no source selected)
    const details = wrapper.find('details.event-section');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await flushPromises();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const payload = mockPersonsCreateWithEvent.mock.calls[0][0];
    expect(payload.event).toBeDefined();
    expect(payload.citation).toBeUndefined();
  });
});
