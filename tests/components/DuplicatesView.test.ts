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
        // Avatar loads its own profile-pic store; stub for shell test.
        AppAvatar: { template: '<div class="app-avatar-stub" />' },
      },
    },
  });
  await flushPromises();
  return { wrapper: w, router };
}

describe('DuplicatesView (tab shell)', () => {
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
});
