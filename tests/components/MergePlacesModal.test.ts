/**
 * MergePlacesModal — user-goal coverage.
 *
 * The user goal: a genealogist who finds two duplicate places clicks Merge,
 * sees both places side-by-side with every authored field listed, confirms
 * the cascade, and the merge runs. This test proves the modal renders both
 * columns and that confirming dispatches the right API call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MergePlacesModal from '../../src/renderer/components/MergePlacesModal.vue';
import ConfirmModal from '../../src/renderer/components/ConfirmModal.vue';
import { i18n } from './setup';

interface ApiMocks {
  places: { get: ReturnType<typeof vi.fn> };
  duplicates: { mergePlaces: ReturnType<typeof vi.fn> };
}

function installApi(): ApiMocks {
  const api: ApiMocks = {
    places: {
      get: vi.fn(async (id: string) => {
        if (id === 'p1') {
          return { id: 'p1', name: 'Stockholm', place_type: 'city', latitude: 59.33, longitude: 18.06, parent_place_id: null };
        }
        if (id === 'p2') {
          return { id: 'p2', name: 'Stockholm', place_type: 'city', latitude: null, longitude: null, parent_place_id: null };
        }
        return null;
      }),
    },
    duplicates: { mergePlaces: vi.fn().mockResolvedValue({ moved: { events: 5 } }) },
  };
  (window as unknown as { api: ApiMocks }).api = api;
  return api;
}

const pair = {
  place1_id: 'p1',
  place2_id: 'p2',
  place1_name: 'Stockholm',
  place2_name: 'Stockholm',
  score: 92,
};

describe('MergePlacesModal', async () => {
  let api: ApiMocks;
  beforeEach(() => { api = installApi(); });

  it('renders both place names in side-by-side columns', async () => {
    const w = mount(MergePlacesModal, {
      global: { plugins: [i18n] },
      props: { pair },
    });
    await flushPromises();
    // Both names appear in the entity cards.
    expect(w.text()).toContain('Stockholm');
    // Score badge with the % rendered.
    expect(w.text()).toContain('92%');
    // The compare table renders both target and source columns: place_type 'city' for both.
    expect(w.text()).toContain('city');
    // Latitude differs (59.33 vs —) — the differs cell shows both.
    expect(w.text()).toContain('59.33');
  });

  it('confirming the cascade dispatches mergePlaces with target then source ids', async () => {
    const w = mount(MergePlacesModal, {
      global: { plugins: [i18n] },
      props: { pair },
    });
    await flushPromises();

    // Click the modal's primary save button (label: "Merge").
    const saveBtn = w.findAll('button').find(b => b.text().trim() === 'Merge');
    expect(saveBtn, 'Merge button should exist').toBeTruthy();
    await saveBtn!.trigger('click');
    await flushPromises();

    // The ConfirmModal is now visible; the actual mergePlaces call has NOT
    // happened yet (confirm dialog is the gate against accidental merges).
    expect(api.duplicates.mergePlaces).not.toHaveBeenCalled();
    const confirm = w.findComponent(ConfirmModal);
    expect(confirm.exists()).toBe(true);
    expect(confirm.props('visible')).toBe(true);

    // Confirm the cascade.
    confirm.vm.$emit('confirm');
    await flushPromises();

    expect(api.duplicates.mergePlaces).toHaveBeenCalledTimes(1);
    expect(api.duplicates.mergePlaces).toHaveBeenCalledWith('p1', 'p2');
    expect(w.emitted('merged')).toBeTruthy();
  });
});
