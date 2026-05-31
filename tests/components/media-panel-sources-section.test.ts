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
import SectionHeader from '../../src/renderer/components/ui/SectionHeader.vue';
import IconUnlink from '../../src/renderer/components/ui/IconUnlink.vue';
import ConfirmModal from '../../src/renderer/components/ConfirmModal.vue';

// The Källor SectionHeader is identified by its rendered title — the user-visible
// "Källor" string — not by an internal handle. Emitting its `action` event is the
// same path the user's click takes (SectionHeader's action AppButton emits `action`).
function openKallorPicker(wrapper: ReturnType<typeof mount>) {
  const headers = wrapper.findAllComponents(SectionHeader);
  const kallor = headers.find((h) => h.props('title') === 'Källor');
  if (!kallor) throw new Error('Källor SectionHeader not found');
  kallor.vm.$emit('action');
}

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

  it('links an existing source via the picker', async () => {
    (window as any).api = stubApi();
    const wrapper = mount(MediaPanel, { props: { mediaId: 'm1' }, global: { plugins: [i18n] } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    // Open the picker via the section's action (the user's click path).
    openKallorPicker(wrapper);
    await wrapper.vm.$nextTick();

    const picker = wrapper.findComponent(SourcePicker);
    expect(picker.exists()).toBe(true);
    picker.vm.$emit('select', { id: 's9' });
    await new Promise((r) => setTimeout(r, 0));

    expect((window as any).api.media.addLink).toHaveBeenCalledWith({
      media_id: 'm1', entity_type: 'source', entity_id: 's9',
    });
  });

  it('creates and links a new source from the picker', async () => {
    (window as any).api = stubApi();
    const wrapper = mount(MediaPanel, { props: { mediaId: 'm1' }, global: { plugins: [i18n] } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    openKallorPicker(wrapper);
    await wrapper.vm.$nextTick();

    const picker = wrapper.findComponent(SourcePicker);
    expect(picker.exists()).toBe(true);
    picker.vm.$emit('create-new', 'Ny kyrkbok');
    await new Promise((r) => setTimeout(r, 0));

    expect((window as any).api.sources.create).toHaveBeenCalledWith({ title: 'Ny kyrkbok' });
    expect((window as any).api.media.addLink).toHaveBeenCalledWith({
      media_id: 'm1', entity_type: 'source', entity_id: 's2',
    });
  });

  it('unlinks a source link after confirmation', async () => {
    (window as any).api = stubApi();
    const wrapper = mount(MediaPanel, { props: { mediaId: 'm1' }, global: { plugins: [i18n] } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    // The unlink control is an IconUnlink (severs link), never a raw ✕ — the
    // Källor row mirrors the Places/Events rows.
    expect(wrapper.findComponent(IconUnlink).exists()).toBe(true);

    // The stub returns one link (the source); it is the only .linked-row, and
    // it renders the linked source title. Scope to that row and click unlink.
    const sourceRow = wrapper
      .findAll('.linked-row')
      .find((row) => row.text().includes('Husförhörslängd Ödeshög'));
    expect(sourceRow).toBeTruthy();
    await sourceRow!.find('button.unlink-btn').trigger('click');
    await wrapper.vm.$nextTick();

    // Confirm via the unlink ConfirmModal (title = media.unlinkConfirmTitle).
    const modals = wrapper.findAllComponents(ConfirmModal);
    const unlinkModal = modals.find((m) => m.props('title') === sv.media.unlinkConfirmTitle);
    expect(unlinkModal).toBeTruthy();
    unlinkModal!.vm.$emit('confirm');
    await new Promise((r) => setTimeout(r, 0));

    expect((window as any).api.media.removeLink).toHaveBeenCalledWith('lnk1');
  });
});
