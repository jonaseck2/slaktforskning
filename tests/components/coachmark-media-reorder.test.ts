import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { config } from '@vue/test-utils';
import PersonMediaSection from '../../src/renderer/components/PersonMediaSection.vue';
import EntityMediaSection from '../../src/renderer/components/EntityMediaSection.vue';
import { __resetForTests } from '../../src/renderer/composables/useFirstEncounter';

// Restore real Teleport for these tests — we need to assert on document.body
// to find the coachmark, just like Coachmark.test.ts does.
const originalStubs = { ...(config.global.stubs as Record<string, unknown>) };

const seenStore: Record<string, true> = {};
const dataChangedListeners = new Set<() => void>();
const apiMock = {
  onboarding: {
    getSeen: vi.fn(async () => ({ ...seenStore })),
    markSeen: vi.fn(async (key: string) => { seenStore[key] = true; }),
    reset: vi.fn(),
  },
  onDataChanged: (cb: () => void) => { dataChangedListeners.add(cb); },
  offDataChanged: (cb: () => void) => { dataChangedListeners.delete(cb); },
  media: {
    forEntity: vi.fn(async () => [
      { id: 'm1', title: 'Photo A', file_ref: null, format: 'jpg', link_id: 'l1', link_type: null, sort_order: 0, notes: '' },
      { id: 'm2', title: 'Photo B', file_ref: null, format: 'jpg', link_id: 'l2', link_type: null, sort_order: 1, notes: '' },
    ]),
    readAsDataUrl: vi.fn(async () => null),
    thumbnailDataUrl: vi.fn(async () => null),
    reorder: vi.fn(async () => undefined),
    addLink: vi.fn(async () => undefined),
    removeLink: vi.fn(async () => undefined),
    openFile: vi.fn(async () => undefined),
  },
};

const i18n = createI18n({
  legacy: false,
  locale: 'sv',
  messages: {
    sv: {
      onboarding: {
        coach: {
          mediaReorder: {
            tip: 'Dra rader för att sortera om — t.ex. barnbilder först, äldre sist.',
            dismiss: 'Förstått',
          },
        },
      },
      common: { actions: 'Åtgärder', remove: 'Ta bort', unlinkTooltip: 'Ta bort koppling' },
      empty: { media: 'Inga bilder' },
      media: {
        title_label: 'Titel',
        format: 'Format',
        currentProfile: 'Profilbild',
        setAsProfile: 'Sätt som profilbild',
        moveUp: 'Flytta upp',
        moveDown: 'Flytta ner',
        unlinkConfirmTitle: 'Ta bort koppling',
        confirmUnlink: 'Vill du ta bort?',
        profile: 'Profil',
        open: 'Öppna',
      },
      a11y: { unlinkItem: 'Ta bort {item}' },
    },
  },
});

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  for (const k of Object.keys(seenStore)) delete seenStore[k];
  dataChangedListeners.clear();
  __resetForTests();
  apiMock.onboarding.getSeen.mockClear();
  apiMock.onboarding.markSeen.mockClear();
  apiMock.media.reorder.mockClear();
  setActivePinia(createPinia());
  // Restore real Teleport so the coachmark renders into document.body
  config.global.stubs = { ...originalStubs, Teleport: false };
  (window as unknown as { api: typeof apiMock }).api = apiMock;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.querySelectorAll('.coachmark').forEach((n) => n.remove());
  // Restore original stubs for other test files
  config.global.stubs = originalStubs;
});

describe('Coachmark — media reorder (PersonMediaSection)', () => {
  it('renders coachmark when media has 2+ items and seen-key not set', async () => {
    wrapper = mount(PersonMediaSection, {
      global: { plugins: [i18n], stubs: { RouterLink: true } },
      props: { personId: 'p1' },
      attachTo: document.body,
    });
    await flushPromises();
    // Wait for raf-driven reposition tick
    await new Promise((r) => requestAnimationFrame(r));

    const el = document.body.querySelector('.coachmark');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Dra rader');
  });

  it('hides coachmark and calls markSeen after a reorder', async () => {
    wrapper = mount(PersonMediaSection, {
      global: { plugins: [i18n], stubs: { RouterLink: true } },
      props: { personId: 'p1' },
      attachTo: document.body,
    });
    await flushPromises();
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.body.querySelector('.coachmark')).not.toBeNull();

    // Trigger the moveDown handler on the first row (idx 0). Use the second
    // .btn-order in the first row's order cell (the down arrow).
    const firstRow = wrapper.find('tbody tr');
    const orderButtons = firstRow.findAll('.btn-order');
    expect(orderButtons.length).toBe(2);
    await orderButtons[1].trigger('click');
    await flushPromises();
    // Allow the coachmark's raf tick to observe reorderedOnce and dismiss
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await flushPromises();

    expect(apiMock.media.reorder).toHaveBeenCalledTimes(1);
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('coach.media.reorder');
    expect(document.body.querySelector('.coachmark')).toBeNull();
  });

  it('does not render coachmark when media has fewer than 2 items', async () => {
    apiMock.media.forEntity.mockResolvedValueOnce([
      { id: 'm1', title: 'Only one', file_ref: null, format: 'jpg', link_id: 'l1', link_type: null, sort_order: 0, notes: '' },
    ]);
    wrapper = mount(PersonMediaSection, {
      global: { plugins: [i18n], stubs: { RouterLink: true } },
      props: { personId: 'pSingle' },
      attachTo: document.body,
    });
    await flushPromises();
    await new Promise((r) => requestAnimationFrame(r));

    expect(document.body.querySelector('.coachmark')).toBeNull();
  });
});

describe('Coachmark — media reorder (EntityMediaSection)', () => {
  it('renders coachmark when media has 2+ items', async () => {
    wrapper = mount(EntityMediaSection, {
      global: { plugins: [i18n], stubs: { RouterLink: true } },
      props: { entityType: 'place', entityId: 'pl1' },
      attachTo: document.body,
    });
    await flushPromises();
    await new Promise((r) => requestAnimationFrame(r));

    const el = document.body.querySelector('.coachmark');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Dra rader');
  });

  it('hides coachmark and calls markSeen after a reorder', async () => {
    wrapper = mount(EntityMediaSection, {
      global: { plugins: [i18n], stubs: { RouterLink: true } },
      props: { entityType: 'place', entityId: 'pl1' },
      attachTo: document.body,
    });
    await flushPromises();
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.body.querySelector('.coachmark')).not.toBeNull();

    const firstRow = wrapper.find('tbody tr');
    const orderButtons = firstRow.findAll('.btn-order');
    expect(orderButtons.length).toBe(2);
    await orderButtons[1].trigger('click');
    await flushPromises();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await flushPromises();

    expect(apiMock.media.reorder).toHaveBeenCalledTimes(1);
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('coach.media.reorder');
    expect(document.body.querySelector('.coachmark')).toBeNull();
  });
});
