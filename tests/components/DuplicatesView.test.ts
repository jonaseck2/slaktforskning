/**
 * DuplicatesView — tab shell coverage.
 *
 * User goal (Task 6 of the duplicates-panel plan): the genealogist landing
 * on `/duplicates` sees four tabs (Persons, Places, Sources, Media).
 * Switching tabs lazy-loads the right entity type via the right
 * `window.api.duplicates.*` call. The URL query param round-trips so a
 * deep link like `?tab=places` lands on the Places tab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from './setup';
import DuplicatesView from '../../src/renderer/views/DuplicatesView.vue';

interface MockApi {
  duplicates: {
    findPage: ReturnType<typeof vi.fn>;
    findPlaces: ReturnType<typeof vi.fn>;
    countPlaces: ReturnType<typeof vi.fn>;
    findSources: ReturnType<typeof vi.fn>;
    countSources: ReturnType<typeof vi.fn>;
    findMedia: ReturnType<typeof vi.fn>;
    countMedia: ReturnType<typeof vi.fn>;
    ignore: ReturnType<typeof vi.fn>;
    ignorePlace: ReturnType<typeof vi.fn>;
    ignoreSource: ReturnType<typeof vi.fn>;
    ignoreMedia: ReturnType<typeof vi.fn>;
  };
  onDataChanged?: (cb: () => void) => void;
  offDataChanged?: (cb: () => void) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var window: { api?: MockApi } & typeof globalThis;
}

function buildApi(): MockApi {
  return {
    duplicates: {
      findPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findPlaces: vi.fn().mockResolvedValue([]),
      countPlaces: vi.fn().mockResolvedValue(0),
      findSources: vi.fn().mockResolvedValue([]),
      countSources: vi.fn().mockResolvedValue(0),
      findMedia: vi.fn().mockResolvedValue([]),
      countMedia: vi.fn().mockResolvedValue(0),
      ignore: vi.fn().mockResolvedValue(undefined),
      ignorePlace: vi.fn().mockResolvedValue(undefined),
      ignoreSource: vi.fn().mockResolvedValue(undefined),
      ignoreMedia: vi.fn().mockResolvedValue(undefined),
    },
    // No-op onDataChanged so usePagedList's auto-subscribe doesn't crash.
    onDataChanged: () => {},
    offDataChanged: () => {},
  };
}

function makeRouter(initial = '/duplicates') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/duplicates', component: DuplicatesView },
      { path: '/persons/:id', component: { template: '<div />' } },
      { path: '/places/:id', component: { template: '<div />' } },
      { path: '/sources/:id', component: { template: '<div />' } },
    ],
    // Memory history starts at `/`; we navigate before mount.
    ...{ initial },
  });
}

async function mountView(initialPath = '/duplicates') {
  const router = makeRouter();
  await router.push(initialPath);
  await router.isReady();
  const w = mount(DuplicatesView, {
    global: {
      plugins: [i18n, router],
      stubs: {
        // The persons tab loads MergePersonsModal under v-if; stub to avoid
        // pulling in BaseSubPanel + Teleport plumbing in this shell test.
        MergePersonsModal: { template: '<div class="merge-persons-modal-stub" />' },
        MergePlacesModal: { template: '<div class="merge-places-modal-stub" />' },
        MergeSourcesModal: { template: '<div class="merge-sources-modal-stub" />' },
        MergeMediaModal: { template: '<div class="merge-media-modal-stub" />' },
        // Avatar loads its own profile-pic store; stub for shell test.
        AppAvatar: { template: '<div class="app-avatar-stub" />' },
      },
    },
  });
  await flushPromises();
  return { wrapper: w, router };
}

describe('DuplicatesView (tab shell)', async () => {
  let api: MockApi;

  beforeEach(() => {
    api = buildApi();
    // @ts-expect-error — assigning a partial window for jsdom.
    globalThis.window.api = api;
  });

  it('renders four tabs (persons, places, sources, media)', async () => {
    const { wrapper } = await mountView('/duplicates');
    const text = wrapper.text();
    expect(text).toContain('Persons');
    expect(text).toContain('Places');
    expect(text).toContain('Sources');
    expect(text).toContain('Media');
  });

  it('defaults to the persons tab and only calls findPage on initial load', async () => {
    await mountView('/duplicates');
    expect(api.duplicates.findPage).toHaveBeenCalledTimes(1);
    expect(api.duplicates.findPlaces).not.toHaveBeenCalled();
    expect(api.duplicates.findSources).not.toHaveBeenCalled();
    expect(api.duplicates.findMedia).not.toHaveBeenCalled();
  });

  it('respects ?tab=places deep link and calls findPlaces (not findPage) on mount', async () => {
    await mountView('/duplicates?tab=places');
    expect(api.duplicates.findPlaces).toHaveBeenCalledTimes(1);
    expect(api.duplicates.countPlaces).toHaveBeenCalledTimes(1);
    expect(api.duplicates.findPage).not.toHaveBeenCalled();
  });

  it('respects ?tab=sources deep link', async () => {
    await mountView('/duplicates?tab=sources');
    expect(api.duplicates.findSources).toHaveBeenCalledTimes(1);
    expect(api.duplicates.countSources).toHaveBeenCalledTimes(1);
  });

  it('respects ?tab=media deep link', async () => {
    await mountView('/duplicates?tab=media');
    expect(api.duplicates.findMedia).toHaveBeenCalledTimes(1);
    expect(api.duplicates.countMedia).toHaveBeenCalledTimes(1);
  });

  it('clicking a tab updates the URL query and lazy-loads its API', async () => {
    const { wrapper, router } = await mountView('/duplicates');
    expect(api.duplicates.findPlaces).not.toHaveBeenCalled();

    // FilterChips renders one button per option; click the Places one.
    const placesButton = wrapper.findAll('button').find(b => b.text().trim() === 'Places');
    expect(placesButton, 'Places tab button should exist').toBeTruthy();
    await placesButton!.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.tab).toBe('places');
    expect(api.duplicates.findPlaces).toHaveBeenCalledTimes(1);
  });

  it('switching back to a previously-loaded tab does not refetch (cached via v-show)', async () => {
    const { wrapper } = await mountView('/duplicates');
    expect(api.duplicates.findPage).toHaveBeenCalledTimes(1);

    const placesButton = wrapper.findAll('button').find(b => b.text().trim() === 'Places');
    await placesButton!.trigger('click');
    await flushPromises();

    const personsButton = wrapper.findAll('button').find(b => b.text().trim() === 'Persons');
    await personsButton!.trigger('click');
    await flushPromises();

    // Still one call — v-show keeps the persons tab alive across switches.
    expect(api.duplicates.findPage).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state for the active tab when no duplicates exist', async () => {
    const { wrapper } = await mountView('/duplicates?tab=places');
    expect(wrapper.text()).toContain('No duplicate places found.');
  });

  // Task 8: quality-check landing. The genealogist clicks a "Duplicate place
  // candidates" finding in QualityView; QualityView routes to
  // `/duplicates?tab=places&pair=ID1:ID2`; the duplicates view must switch to
  // the Places tab AND pre-open the merge modal for that exact pair.
  describe('quality-check deep link (?pair=)', async () => {
    it('pre-opens the merge modal for the named place pair on mount', async () => {
      const pair = {
        place1_id: 'PLACE-A',
        place2_id: 'PLACE-B',
        place1_name: 'Stockholm',
        place2_name: 'Stockholm',
        place1_parent_id: null,
        place2_parent_id: null,
        score: 100,
        reasons: ['identical-name-same-parent'],
      };
      api.duplicates.findPlaces.mockResolvedValueOnce([pair]);
      api.duplicates.countPlaces.mockResolvedValueOnce(1);
      const { wrapper } = await mountView('/duplicates?tab=places&pair=PLACE-A:PLACE-B');
      // The merge modal stub renders only when the tab's mergeCandidate ref is set.
      expect(wrapper.find('.merge-places-modal-stub').exists()).toBe(true);
    });

    it('matches the pair regardless of id order (id2:id1 also opens the modal)', async () => {
      const pair = {
        place1_id: 'PLACE-A',
        place2_id: 'PLACE-B',
        place1_name: 'Stockholm',
        place2_name: 'Stockholm',
        place1_parent_id: null,
        place2_parent_id: null,
        score: 100,
        reasons: [],
      };
      api.duplicates.findPlaces.mockResolvedValueOnce([pair]);
      api.duplicates.countPlaces.mockResolvedValueOnce(1);
      const { wrapper } = await mountView('/duplicates?tab=places&pair=PLACE-B:PLACE-A');
      expect(wrapper.find('.merge-places-modal-stub').exists()).toBe(true);
    });

    it('does not open the modal when the pair is not in the loaded list', async () => {
      api.duplicates.findPlaces.mockResolvedValueOnce([]);
      api.duplicates.countPlaces.mockResolvedValueOnce(0);
      const { wrapper } = await mountView('/duplicates?tab=places&pair=GHOST-1:GHOST-2');
      expect(wrapper.find('.merge-places-modal-stub').exists()).toBe(false);
    });

    it('strips the pair param from the URL after consumption', async () => {
      const pair = {
        place1_id: 'PLACE-A',
        place2_id: 'PLACE-B',
        place1_name: 'X',
        place2_name: 'X',
        place1_parent_id: null,
        place2_parent_id: null,
        score: 100,
        reasons: [],
      };
      api.duplicates.findPlaces.mockResolvedValueOnce([pair]);
      api.duplicates.countPlaces.mockResolvedValueOnce(1);
      const { router } = await mountView('/duplicates?tab=places&pair=PLACE-A:PLACE-B');
      await flushPromises();
      // The pair has been consumed; the URL should no longer carry it (so a
      // back/forward round-trip doesn't re-open the modal).
      expect(router.currentRoute.value.query.pair).toBeUndefined();
      expect(router.currentRoute.value.query.tab).toBe('places');
    });

    it('lands on persons tab + opens the merge modal for ?tab=persons&pair=', async () => {
      const personPair = {
        person1_id: 'P-1',
        person2_id: 'P-2',
        person1_name: 'Anna',
        person2_name: 'Anna',
        person1_birth: null,
        person2_birth: null,
        score: 90,
        reasons: [],
      };
      api.duplicates.findPage.mockResolvedValueOnce({ items: [personPair], total: 1 });
      const { wrapper } = await mountView('/duplicates?tab=persons&pair=P-1:P-2');
      expect(wrapper.find('.merge-persons-modal-stub').exists()).toBe(true);
    });
  });
});
