import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import NotePicker from '../../src/renderer/components/modals/NotePicker.vue';
import { i18n } from './setup';

const allNotes = [
  { id: 'n-1', text: 'Birthday gathering at Lindgården', language: '', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'n-2', text: 'Letter from grandmother Astrid', language: 'sv', created_at: '2026-01-02', updated_at: '2026-01-02' },
  { id: 'n-3', text: 'Newspaper clipping about the wedding', language: 'en', created_at: '2026-01-03', updated_at: '2026-01-03' },
];

function installApi() {
  const list = vi.fn().mockResolvedValue(allNotes);
  (window as unknown as { api: unknown }).api = {
    notes: { list, create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn(), forEntity: vi.fn() },
    noteLinks: { link: vi.fn(), unlink: vi.fn(), forNote: vi.fn() },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
  };
  return { list };
}

describe('NotePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists all notes on mount', async () => {
    const { list } = installApi();

    const wrapper = mount(NotePicker, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    expect(list).toHaveBeenCalled();
    const rows = wrapper.findAll('.picker-row');
    expect(rows).toHaveLength(3);
    expect(wrapper.text()).toContain('Birthday gathering');
    expect(wrapper.text()).toContain('grandmother Astrid');
  });

  it('filters rows by search query', async () => {
    installApi();

    const wrapper = mount(NotePicker, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    const input = wrapper.find('input.list-filter-input');
    await input.setValue('wedding');
    await flushPromises();

    const rows = wrapper.findAll('.picker-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('wedding');
  });

  it('excludes notes already linked via excludeIds', async () => {
    installApi();

    const wrapper = mount(NotePicker, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone', excludeIds: ['n-1', 'n-2'] },
    });
    await flushPromises();

    const rows = wrapper.findAll('.picker-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('wedding');
  });

  it('emits picked with note id when a row is clicked', async () => {
    installApi();

    const wrapper = mount(NotePicker, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    await wrapper.findAll('.picker-row')[1].trigger('click');
    const emitted = wrapper.emitted('picked');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toBe('n-2');
  });

  it('shows empty state when no notes match', async () => {
    installApi();

    const wrapper = mount(NotePicker, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    await wrapper.find('input.list-filter-input').setValue('nothing matches this');
    await flushPromises();

    expect(wrapper.find('.picker-row').exists()).toBe(false);
    expect(wrapper.find('.section-empty').exists()).toBe(true);
  });
});
