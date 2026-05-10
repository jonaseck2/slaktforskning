/**
 * MergeSourcesModal — user-goal coverage.
 *
 * The user goal: a genealogist who finds two duplicate sources clicks Merge,
 * sees both sources side-by-side with every authored field listed, confirms
 * the cascade, and the merge runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MergeSourcesModal from '../../src/renderer/components/MergeSourcesModal.vue';
import ConfirmModal from '../../src/renderer/components/ConfirmModal.vue';
import { i18n } from './setup';

interface ApiMocks {
  sources: { get: ReturnType<typeof vi.fn> };
  duplicates: { mergeSources: ReturnType<typeof vi.fn> };
}

function installApi(): ApiMocks {
  const api: ApiMocks = {
    sources: {
      get: vi.fn(async (id: string) => {
        if (id === 's1') {
          return { id: 's1', title: 'Folkräkning 1900', author: 'SCB', source_type: 'census' };
        }
        if (id === 's2') {
          return { id: 's2', title: 'Folkräkning 1900', author: '', source_type: 'census' };
        }
        return null;
      }),
    },
    duplicates: { mergeSources: vi.fn().mockResolvedValue({ moved: { citations: 3 } }) },
  };
  (window as unknown as { api: ApiMocks }).api = api;
  return api;
}

const pair = {
  source1_id: 's1',
  source2_id: 's2',
  source1_title: 'Folkräkning 1900',
  source2_title: 'Folkräkning 1900',
  source1_author: 'SCB',
  source2_author: '',
  score: 88,
};

describe('MergeSourcesModal', () => {
  let api: ApiMocks;
  beforeEach(() => { api = installApi(); });

  it('renders both source titles in side-by-side columns', async () => {
    const w = mount(MergeSourcesModal, {
      global: { plugins: [i18n] },
      props: { pair },
    });
    await flushPromises();
    expect(w.text()).toContain('Folkräkning 1900');
    expect(w.text()).toContain('88%');
    expect(w.text()).toContain('SCB');
    expect(w.text()).toContain('census');
  });

  it('confirming the cascade dispatches mergeSources with target then source ids', async () => {
    const w = mount(MergeSourcesModal, {
      global: { plugins: [i18n] },
      props: { pair },
    });
    await flushPromises();

    const saveBtn = w.findAll('button').find(b => b.text().trim() === 'Merge');
    expect(saveBtn, 'Merge button should exist').toBeTruthy();
    await saveBtn!.trigger('click');
    await flushPromises();

    expect(api.duplicates.mergeSources).not.toHaveBeenCalled();
    const confirm = w.findComponent(ConfirmModal);
    expect(confirm.exists()).toBe(true);
    expect(confirm.props('visible')).toBe(true);

    confirm.vm.$emit('confirm');
    await flushPromises();

    expect(api.duplicates.mergeSources).toHaveBeenCalledTimes(1);
    expect(api.duplicates.mergeSources).toHaveBeenCalledWith('s1', 's2');
    expect(w.emitted('merged')).toBeTruthy();
  });
});
