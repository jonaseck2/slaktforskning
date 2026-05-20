import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import NoteModal from '../../src/renderer/components/modals/NoteModal.vue';
import { i18n } from './setup';

const note = {
  id: 'n-1',
  text: 'Original text',
  language: 'sv',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

function installApi(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const create = overrides.create ?? vi.fn().mockResolvedValue({ ...note, id: 'n-new' });
  const update = overrides.update ?? vi.fn().mockResolvedValue(note);
  const del = overrides.delete ?? vi.fn().mockResolvedValue(true);
  (window as unknown as { api: unknown }).api = {
    notes: { create, update, delete: del, list: vi.fn(), get: vi.fn(), forEntity: vi.fn() },
    noteLinks: { link: vi.fn(), unlink: vi.fn(), forNote: vi.fn() },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
  };
  return { create, update, delete: del };
}

describe('NoteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds text and language fields and creates a new note on save', async () => {
    const { create } = installApi();

    const wrapper = mount(NoteModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    const textarea = wrapper.find('#note-field-text');
    const langInput = wrapper.find('#note-field-lang');
    expect(textarea.exists()).toBe(true);
    expect(langInput.exists()).toBe(true);

    await textarea.setValue('Brand new note');
    await langInput.setValue('en');

    // Trigger save by clicking the primary action button. BaseSubPanel
    // renders the save button with class .ep-save-btn.
    const saveBtn = wrapper.find('.ep-save-btn');
    expect(saveBtn.exists()).toBe(true);
    await saveBtn.trigger('click');
    await flushPromises();

    expect(create).toHaveBeenCalledWith({ text: 'Brand new note', language: 'en' });
    const savedEmits = wrapper.emitted('saved');
    expect(savedEmits).toBeTruthy();
    // Second arg is wasCreate
    expect(savedEmits![0][1]).toBe(true);
  });

  it('hydrates from editingNote and updates on save', async () => {
    const { update, create } = installApi();

    const wrapper = mount(NoteModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone', editingNote: note },
    });
    await flushPromises();

    const textarea = wrapper.find('#note-field-text');
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Original text');

    await textarea.setValue('Edited text');
    await wrapper.find('.ep-save-btn').trigger('click');
    await flushPromises();

    expect(update).toHaveBeenCalledWith('n-1', { text: 'Edited text', language: 'sv' });
    expect(create).not.toHaveBeenCalled();
    const savedEmits = wrapper.emitted('saved');
    expect(savedEmits![0][1]).toBe(false);
  });

  it('deletes the note via confirm modal and emits deleted', async () => {
    const { delete: del } = installApi();

    const wrapper = mount(NoteModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone', editingNote: note },
    });
    await flushPromises();

    // Click delete button
    const deleteBtn = wrapper.find('.btn-delete-note');
    expect(deleteBtn.exists()).toBe(true);
    await deleteBtn.trigger('click');
    await flushPromises();

    // ConfirmModal becomes visible — its confirm button has text matching common.delete.
    // We simulate confirm by directly invoking handleDelete via the emitted event flow
    // (the modal's @confirm callback). The simplest assertion: find the confirm button
    // inside the visible ConfirmModal and click it.
    const confirmBtn = wrapper.findAll('button').find(b => b.text() === 'Delete');
    expect(confirmBtn).toBeTruthy();
    await confirmBtn!.trigger('click');
    await flushPromises();

    expect(del).toHaveBeenCalledWith('n-1');
    expect(wrapper.emitted('deleted')).toBeTruthy();
  });
});
