import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useFirstMediaAttachToast } from '../../src/renderer/composables/useFirstMediaAttachToast';
import { useToast } from '../../src/renderer/composables/useToast';
import { __resetForTests as resetFirstEncounter } from '../../src/renderer/composables/useFirstEncounter';

// Minimal i18n shim — useFirstMediaAttachToast calls vue-i18n's t().
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const seenStore: Record<string, true> = {};
const apiMock = {
  onboarding: {
    getSeen: vi.fn(async () => ({ ...seenStore })),
    markSeen: vi.fn(async (key: string) => {
      seenStore[key] = true;
    }),
    reset: vi.fn(async () => {
      for (const k of Object.keys(seenStore)) delete seenStore[k];
    }),
  },
};

beforeEach(() => {
  resetFirstEncounter();
  for (const k of Object.keys(seenStore)) delete seenStore[k];
  apiMock.onboarding.getSeen.mockClear();
  apiMock.onboarding.markSeen.mockClear();
  // Drain any toasts that linger between tests (they auto-dismiss on a timer
  // but we want a clean slate for assertions).
  const toast = useToast();
  while (toast.toasts.length > 0) toast.dismiss(toast.toasts[0].id);
  (window as unknown as { api: typeof apiMock }).api = apiMock;
});

const Probe = defineComponent({
  setup() {
    const firstAttach = useFirstMediaAttachToast();
    return () => h('button', {
      'data-test': 'attach',
      onClick: firstAttach.notifyIfFirst,
    }, 'attach');
  },
});

describe('useFirstMediaAttachToast', async () => {
  it('shows toast and marks seen on first successful attach', async () => {
    const toast = useToast();
    const w = mount(Probe);
    await flushPromises(); // let useFirstEncounter's onMounted snapshot resolve
    expect(toast.toasts.length).toBe(0);

    (await w.get('[data-test="attach"]')).trigger('click');
    await flushPromises();

    expect(toast.toasts.length).toBe(1);
    expect(toast.toasts[0].type).toBe('info');
    expect(toast.toasts[0].message).toBe('onboarding.toast.mediaFirstAttach.body');
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('toast.media.firstAttach');
  });

  it('does NOT show the toast on the second attach (single-shot)', async () => {
    const toast = useToast();
    const w = mount(Probe);
    await flushPromises();

    // First attach — toast appears.
    (await w.get('[data-test="attach"]')).trigger('click');
    await flushPromises();
    expect(toast.toasts.length).toBe(1);

    // Dismiss the lingering toast so we can detect any new one cleanly.
    toast.dismiss(toast.toasts[0].id);
    expect(toast.toasts.length).toBe(0);

    // Second attach — no toast.
    (await w.get('[data-test="attach"]')).trigger('click');
    await flushPromises();
    expect(toast.toasts.length).toBe(0);

    // markSeen called only once (on the first attach).
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledTimes(1);
  });

  it('does NOT show the toast when state already records it as seen', async () => {
    seenStore['toast.media.firstAttach'] = true;
    const toast = useToast();
    const w = mount(Probe);
    await flushPromises();

    (await w.get('[data-test="attach"]')).trigger('click');
    await flushPromises();

    expect(toast.toasts.length).toBe(0);
    expect(apiMock.onboarding.markSeen).not.toHaveBeenCalled();
  });
});
