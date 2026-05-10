/**
 * MergeMediaModal — user-goal coverage.
 *
 * The user goal: a genealogist who finds two duplicate media rows clicks
 * Merge, sees both rows side-by-side, and — critically — when the two rows
 * point at *different* files on disk, must explicitly choose which file to
 * keep before the merge runs. Silently deleting either file is a Prime
 * Directive violation, so the radio buttons are non-optional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MergeMediaModal from '../../src/renderer/components/MergeMediaModal.vue';
import ConfirmModal from '../../src/renderer/components/ConfirmModal.vue';
import { i18n } from './setup';

interface ApiMocks {
  media: { get: ReturnType<typeof vi.fn> };
  duplicates: { mergeMedia: ReturnType<typeof vi.fn> };
}

function installApi(): ApiMocks {
  const api: ApiMocks = {
    media: {
      get: vi.fn(async (id: string) => {
        if (id === 'm1') {
          return { id: 'm1', title: 'Familjebild', file_ref: 'family-media/foo.jpg', format: 'image/jpeg' };
        }
        if (id === 'm2') {
          return { id: 'm2', title: 'Familjebild', file_ref: 'family-media/bar.jpg', format: 'image/jpeg' };
        }
        return null;
      }),
    },
    duplicates: { mergeMedia: vi.fn().mockResolvedValue({ moved: { media_links: 2 } }) },
  };
  (window as unknown as { api: ApiMocks }).api = api;
  return api;
}

const pair = {
  media1_id: 'm1',
  media2_id: 'm2',
  media1_title: 'Familjebild',
  media2_title: 'Familjebild',
  media1_file_ref: 'family-media/foo.jpg',
  media2_file_ref: 'family-media/bar.jpg',
  score: 85,
};

async function clickToMergeAfterConfirm(w: ReturnType<typeof mount>) {
  const saveBtn = w.findAll('button').find(b => b.text().trim() === 'Merge');
  expect(saveBtn, 'Merge button should exist').toBeTruthy();
  await saveBtn!.trigger('click');
  await flushPromises();
  // The confirm modal is now visible — confirm the cascade.
  const confirm = w.findComponent(ConfirmModal);
  expect(confirm.exists()).toBe(true);
  expect(confirm.props('visible')).toBe(true);
  confirm.vm.$emit('confirm');
  await flushPromises();
}

describe('MergeMediaModal', async () => {
  let api: ApiMocks;
  beforeEach(() => { api = installApi(); });

  it('renders both media titles and both file refs in side-by-side columns', async () => {
    const w = mount(MergeMediaModal, {
      global: { plugins: [i18n] },
      props: { pair },
    });
    await flushPromises();
    expect(w.text()).toContain('Familjebild');
    expect(w.text()).toContain('foo.jpg');
    expect(w.text()).toContain('bar.jpg');
    expect(w.text()).toContain('85%');
  });

  it('default keep-file is target → mergeMedia called with keepFile="target"', async () => {
    const w = mount(MergeMediaModal, {
      global: { plugins: [i18n] },
      props: { pair },
    });
    await flushPromises();

    await clickToMergeAfterConfirm(w);

    expect(api.duplicates.mergeMedia).toHaveBeenCalledTimes(1);
    expect(api.duplicates.mergeMedia).toHaveBeenCalledWith('m1', 'm2', 'target');
    expect(w.emitted('merged')).toBeTruthy();
  });

  it('flipping the radio to "source" dispatches mergeMedia with keepFile="source"', async () => {
    const w = mount(MergeMediaModal, {
      global: { plugins: [i18n] },
      props: { pair },
    });
    await flushPromises();

    // Find both radios and select the source one.
    const sourceRadio = w.find<HTMLInputElement>('input[type="radio"][value="source"]');
    expect(sourceRadio.exists(), 'source radio should exist').toBe(true);
    await sourceRadio.setValue();
    await flushPromises();

    await clickToMergeAfterConfirm(w);

    expect(api.duplicates.mergeMedia).toHaveBeenCalledTimes(1);
    expect(api.duplicates.mergeMedia).toHaveBeenCalledWith('m1', 'm2', 'source');
  });

  it('when target has no file, default selection switches to source and target radio is disabled', async () => {
    const w = mount(MergeMediaModal, {
      global: { plugins: [i18n] },
      props: {
        pair: {
          ...pair,
          media1_file_ref: null,
        },
      },
    });
    await flushPromises();

    const targetRadio = w.find<HTMLInputElement>('input[type="radio"][value="target"]');
    const sourceRadio = w.find<HTMLInputElement>('input[type="radio"][value="source"]');
    expect(targetRadio.element.disabled).toBe(true);
    expect(sourceRadio.element.disabled).toBe(false);
    expect(sourceRadio.element.checked).toBe(true);
  });
});
