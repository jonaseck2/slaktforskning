import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AddRelatedPersonModal from '../../src/renderer/components/AddRelatedPersonModal.vue';
import { i18n } from './setup';

describe('AddRelatedPersonModal', () => {
  const mockPersonsCreate = vi.fn();
  const mockRelationshipsCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonsCreate.mockResolvedValue({ id: 'new-person-id' });
    mockRelationshipsCreate.mockResolvedValue({ id: 'rel-id' });
    (window as unknown as { api: unknown }).api = {
      persons: { create: mockPersonsCreate },
      relationships: { create: mockRelationshipsCreate },
    };
  });

  function mountModal(mode: 'parent' | 'spouse' | 'child') {
    return mount(AddRelatedPersonModal, {
      global: { plugins: [i18n] },
      props: { personId: 'current-person-id', mode },
    });
  }

  it('shows "Add Parent" title for parent mode', () => {
    const wrapper = mountModal('parent');
    expect(wrapper.find('h3').text()).toBe('Add Parent');
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
    const parentWrapper = mountModal('parent');
    expect(parentWrapper.findAll('select')).toHaveLength(1); // sex only

    const spouseWrapper = mountModal('spouse');
    expect(spouseWrapper.findAll('select')).toHaveLength(2); // sex + subtype
  });

  it('creates parent_child with new person as parent for parent mode', async () => {
    const wrapper = mountModal('parent');
    await wrapper.find('input[type="text"]').setValue('Lars');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockPersonsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ given_name: 'Lars' }),
    );
    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'new-person-id',     // new person IS the parent
        person2_id: 'current-person-id', // current person IS the child
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
    const wrapper = mountModal('parent');
    await wrapper.find('input[type="text"]').setValue('Test');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
