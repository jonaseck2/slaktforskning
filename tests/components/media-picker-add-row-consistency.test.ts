import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { i18n } from './setup';
import PersonMediaSection from '../../src/renderer/components/PersonMediaSection.vue';
import EntityMediaSection from '../../src/renderer/components/EntityMediaSection.vue';
import LinkedMediaSection from '../../src/renderer/components/LinkedMediaSection.vue';
import MediaAddRow from '../../src/renderer/components/MediaAddRow.vue';
import MediaPicker from '../../src/renderer/components/MediaPicker.vue';

// User-goal lock: every right-side panel that has a media section exposes the
// same inline add-row shape — type letters to link an existing media item, or
// click 📎 to upload a new file. This test mounts each of the three section
// flavors (PersonMediaSection, EntityMediaSection, LinkedMediaSection),
// reveals the add-row, and asserts that BOTH MediaAddRow and its inner
// MediaPicker exist. If any flavor regresses to a different picker shape (a
// modal, a hidden file input, an old <select>), this test fails.

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function makeApi() {
  return {
    media: {
      forEntity: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      readAsDataUrl: vi.fn().mockResolvedValue(null),
      thumbnailDataUrl: vi.fn().mockResolvedValue(null),
      addLink: vi.fn().mockResolvedValue(undefined),
      removeLink: vi.fn().mockResolvedValue(undefined),
      reorder: vi.fn().mockResolvedValue(undefined),
      createFromFile: vi.fn().mockResolvedValue({ canceled: true }),
      openFile: vi.fn().mockResolvedValue(undefined),
    },
    onDataChanged: vi.fn().mockReturnValue(() => {}),
  };
}

beforeEach(() => {
  (window as unknown as { api: unknown }).api = makeApi();
});

describe('media-picker add-row consistency across 3 section flavors', () => {
  it('PersonMediaSection: attach() reveals MediaAddRow with MediaPicker inside', async () => {
    const wrapper = mount(PersonMediaSection, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    // No add-row before attach is invoked.
    expect(wrapper.findComponent(MediaAddRow).exists()).toBe(false);

    // Trigger the exposed attach() (what PersonPanel's "+ Add" header button calls).
    (wrapper.vm as unknown as { attach: () => Promise<void> }).attach();
    await flushPromises();

    const addRow = wrapper.findComponent(MediaAddRow);
    expect(addRow.exists()).toBe(true);
    expect(addRow.findComponent(MediaPicker).exists()).toBe(true);
  });

  it('EntityMediaSection: attach() reveals MediaAddRow with MediaPicker inside (entityType=place)', async () => {
    const wrapper = mount(EntityMediaSection, {
      global: { plugins: [i18n] },
      props: { entityType: 'place', entityId: 'pl1' },
    });
    await flushPromises();

    expect(wrapper.findComponent(MediaAddRow).exists()).toBe(false);

    (wrapper.vm as unknown as { attach: () => Promise<void> }).attach();
    await flushPromises();

    const addRow = wrapper.findComponent(MediaAddRow);
    expect(addRow.exists()).toBe(true);
    expect(addRow.findComponent(MediaPicker).exists()).toBe(true);
  });

  it('LinkedMediaSection: showPicker=true renders MediaAddRow with MediaPicker inside', async () => {
    const wrapper = mount(LinkedMediaSection, {
      global: { plugins: [i18n] },
      props: { links: [], showPicker: true },
    });
    await flushPromises();

    const addRow = wrapper.findComponent(MediaAddRow);
    expect(addRow.exists()).toBe(true);
    expect(addRow.findComponent(MediaPicker).exists()).toBe(true);
  });
});
