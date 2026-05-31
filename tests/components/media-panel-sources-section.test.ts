import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import sv from '../../src/renderer/i18n/sv';
// Importing setup registers the global RouterLink/Teleport stubs and Pinia
// that MediaPanel needs (useProfilePicStore is called at setup time, and the
// template renders <router-link> for source rows).
import './setup';
import MediaPanel from '../../src/renderer/components/MediaPanel.vue';
import SourcePicker from '../../src/renderer/components/SourcePicker.vue';

// Local sv instance so the section title assertion matches the plan's
// user-observable copy ("Källor"). The shared setup i18n is English-only.
const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });

function stubApi(overrides: Record<string, unknown> = {}) {
  const base: any = {
    media: {
      get: vi.fn(async () => ({ id: 'm1', title: 'Skanning', file_ref: null, format: null, notes: '' })),
      readAsDataUrl: vi.fn(async () => null),
      linksForMedia: vi.fn(async () => [{ id: 'lnk1', entity_type: 'source', entity_id: 's1' }]),
      addLink: vi.fn(async () => ({ id: 'lnk2' })),
      removeLink: vi.fn(async () => true),
    },
    sources: {
      get: vi.fn(async () => ({ id: 's1', title: 'Husförhörslängd Ödeshög' })),
      create: vi.fn(async () => ({ id: 's2' })),
    },
    persons: { get: vi.fn(async () => null), getNames: vi.fn(async () => []) },
    places: { get: vi.fn(async () => null) },
    events: { get: vi.fn(async () => null) },
    mediaRegions: { getForMedia: vi.fn(async () => []) },
  };
  return Object.assign(base, overrides);
}

describe('MediaPanel Källor section', () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window || {};
    (window as any).api = stubApi();
  });

  it('renders the linked source title', async () => {
    const wrapper = mount(MediaPanel, {
      props: { mediaId: 'm1' },
      global: { plugins: [i18n] },
    });
    // useEntityData loads asynchronously; flush microtasks.
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Källor');
    expect(wrapper.text()).toContain('Husförhörslängd Ödeshög');
  });
});
