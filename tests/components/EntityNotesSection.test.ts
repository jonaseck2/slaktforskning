import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EntityNotesSection from '../../src/renderer/components/EntityNotesSection.vue';
import { i18n } from './setup';
import type { NoteEntityType } from '../../src/api/types';

const ENTITY_TYPES: NoteEntityType[] = [
  'person',
  'event',
  'relationship',
  'place',
  'source',
  'repository',
  'media',
  'family',
];

const notesFixture = [
  { id: 'n-1', text: 'Short note', language: '', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'n-2', text: 'A much longer note with extra context to verify preview truncation behaviour across the row.', language: 'sv', created_at: '2026-01-02', updated_at: '2026-01-02' },
];

function installMockApi(forEntity: ReturnType<typeof vi.fn>) {
  (window as unknown as { api: unknown }).api = {
    notes: {
      forEntity,
      list: vi.fn().mockResolvedValue(notesFixture),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    noteLinks: {
      link: vi.fn().mockResolvedValue({ id: 'nl-1' }),
      unlink: vi.fn().mockResolvedValue(true),
      forNote: vi.fn(),
    },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
  };
}

describe('EntityNotesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(ENTITY_TYPES)('mounts and loads notes for entity-type %s', async (entityType) => {
    const forEntity = vi.fn().mockResolvedValue(notesFixture);
    installMockApi(forEntity);

    const wrapper = mount(EntityNotesSection, {
      global: { plugins: [i18n] },
      props: { entityType, entityId: 'e-1' },
    });
    await flushPromises();

    expect(forEntity).toHaveBeenCalledWith(entityType, 'e-1');
    const rows = wrapper.findAll('.note-row');
    expect(rows).toHaveLength(2);
    expect(wrapper.text()).toContain('Short note');
    // Language badge present on the second note
    expect(wrapper.text()).toContain('[sv]');
  });

  it('shows empty state when no notes are linked', async () => {
    const forEntity = vi.fn().mockResolvedValue([]);
    installMockApi(forEntity);

    const wrapper = mount(EntityNotesSection, {
      global: { plugins: [i18n] },
      props: { entityType: 'person', entityId: 'p-1' },
    });
    await flushPromises();

    expect(wrapper.find('.note-row').exists()).toBe(false);
    expect(wrapper.find('.section-empty').exists()).toBe(true);
  });

  it('openAddChoice() exposes a Create / Link choice strip', async () => {
    const forEntity = vi.fn().mockResolvedValue(notesFixture);
    installMockApi(forEntity);

    const wrapper = mount(EntityNotesSection, {
      global: { plugins: [i18n] },
      props: { entityType: 'person', entityId: 'p-1' },
    });
    await flushPromises();

    // Initially the choice strip is hidden
    expect(wrapper.find('.note-add-choice').exists()).toBe(false);

    // Parent calls openAddChoice() through defineExpose
    (wrapper.vm as unknown as { openAddChoice: () => void }).openAddChoice();
    await flushPromises();
    expect(wrapper.find('.note-add-choice').exists()).toBe(true);
    expect(wrapper.text()).toContain('Create new');
    expect(wrapper.text()).toContain('Link existing');
  });

  it('exposes count for the parent panel header', async () => {
    installMockApi(vi.fn().mockResolvedValue(notesFixture));

    const wrapper = mount(EntityNotesSection, {
      global: { plugins: [i18n] },
      props: { entityType: 'place', entityId: 'pl-1' },
    });
    await flushPromises();

    const exposed = wrapper.vm as unknown as { count: number };
    expect(exposed.count).toBe(2);
  });

  it('reloads when entityId changes', async () => {
    const forEntity = vi.fn().mockResolvedValue([]);
    installMockApi(forEntity);

    const wrapper = mount(EntityNotesSection, {
      global: { plugins: [i18n] },
      props: { entityType: 'person', entityId: 'p-1' },
    });
    await flushPromises();
    expect(forEntity).toHaveBeenCalledWith('person', 'p-1');

    await wrapper.setProps({ entityId: 'p-2' });
    await flushPromises();
    expect(forEntity).toHaveBeenCalledWith('person', 'p-2');
  });
});
