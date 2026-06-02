/**
 * MediaView — `link-changed` patches the gallery in place (no full re-query).
 *
 * User goal: tagging a face whose person isn't already linked to the media must
 * NOT feel slower than tagging an already-linked person. The face-tag list and
 * the gallery's "N linked entities" badge update promptly.
 *
 * The regression this guards: the old wiring was `@link-changed="reload"`, which
 * fired a full `media.listPage()` re-query (link/face COUNT joins) on the single
 * SQLite connection the panel's own reload needs — so the new tag visibly waited
 * behind the gallery requery. The fix patches just the affected row's linkCount
 * from a signed delta carried on the event; the listPage call count must not grow.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from './setup';
import MediaView from '../../src/renderer/views/MediaView.vue';

interface MockApi {
  media: Record<string, ReturnType<typeof vi.fn>>;
  mediaRegions: Record<string, ReturnType<typeof vi.fn>>;
  persons: Record<string, ReturnType<typeof vi.fn>>;
  db: Record<string, ReturnType<typeof vi.fn>>;
  onDataChanged?: (cb: () => void) => void;
  offDataChanged?: (cb: () => void) => void;
}

function buildApi(): MockApi {
  const oneImageRow = {
    id: 'media-1',
    title: 'Portrait',
    file_ref: 'fam-media/portrait.jpg',
    format: 'jpg',
    notes: '',
    is_printable: false,
    is_missing: 0,
    created_at: '2026-01-01',
    link_count: 1,
    face_tag_count: 1,
  };
  return {
    media: {
      listPage: vi.fn().mockResolvedValue({ items: [oneImageRow], total: 1, total_missing: 0 }),
      // Skip thumbnail decode (null → marked failed, no spinner) and auto-select probes.
      thumbnailDataUrl: vi.fn().mockResolvedValue(null),
      forEntity: vi.fn().mockResolvedValue([]),
    },
    mediaRegions: {},
    persons: { getNames: vi.fn().mockResolvedValue([]) },
    db: { getSetting: vi.fn().mockResolvedValue(null) },
    onDataChanged: () => {},
    offDataChanged: () => {},
  };
}

function mountView(api: MockApi) {
  // @ts-expect-error — partial window for jsdom.
  globalThis.window.api = api;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/media', component: MediaView },
      { path: '/persons/:id', component: { template: '<div />' } },
    ],
  });
  return router.push('/media').then(() => router.isReady()).then(() =>
    mount(MediaView, {
      global: {
        plugins: [i18n, router],
        stubs: {
          MediaPanel: { name: 'MediaPanel', template: '<div class="media-panel-stub" />' },
          MediaViewer: { name: 'MediaViewer', template: '<div class="media-viewer-stub" />' },
          FilterChips: true,
          Coachmark: true,
          ConfirmModal: true,
          AppButton: { template: '<button><slot /></button>' },
        },
      },
    }),
  );
}

describe('MediaView link-changed (in-place gallery patch)', () => {
  it('patches linkCount in place and does NOT re-query listPage when a link is added', async () => {
    const api = buildApi();
    const wrapper = await mountView(api);
    await flushPromises();

    // Gallery loaded one row whose badge reflects the initial link_count of 1.
    expect(api.media.listPage).toHaveBeenCalledTimes(1);
    const badge = () => wrapper.find('.card-badge');
    expect(badge().exists()).toBe(true);
    expect(badge().text()).toContain('1');

    // The open panel emits link-changed (+1) when an unlinked person is tagged.
    const panel = wrapper.findComponent({ name: 'MediaPanel' });
    expect(panel.exists()).toBe(true);
    panel.vm.$emit('link-changed', { mediaId: 'media-1', linkDelta: 1 });
    await flushPromises();

    // Badge bumped to 2 in place; NO second full gallery re-query was triggered.
    expect(badge().text()).toContain('2');
    expect(api.media.listPage).toHaveBeenCalledTimes(1);
  });

  it('decrements linkCount in place when a link is removed', async () => {
    const api = buildApi();
    const wrapper = await mountView(api);
    await flushPromises();

    const panel = wrapper.findComponent({ name: 'MediaPanel' });
    panel.vm.$emit('link-changed', { mediaId: 'media-1', linkDelta: -1 });
    await flushPromises();

    // link_count 1 → 0: badge has `v-if="linkCount > 0"`, so it disappears.
    expect(wrapper.find('.card-badge').exists()).toBe(false);
    expect(api.media.listPage).toHaveBeenCalledTimes(1);
  });

  it('ignores a zero-delta link-changed (e.g. setting a profile picture)', async () => {
    const api = buildApi();
    const wrapper = await mountView(api);
    await flushPromises();

    const panel = wrapper.findComponent({ name: 'MediaPanel' });
    panel.vm.$emit('link-changed', { mediaId: 'media-1', linkDelta: 0 });
    await flushPromises();

    expect(wrapper.find('.card-badge').text()).toContain('1');
    expect(api.media.listPage).toHaveBeenCalledTimes(1);
  });
});
