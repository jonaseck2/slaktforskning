import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, ref } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import Coachmark from '../../src/renderer/components/ui/Coachmark.vue';
import { __resetForTests } from '../../src/renderer/composables/useFirstEncounter';

const seenStore: Record<string, true> = {};
const apiMock = {
  onboarding: {
    getSeen: vi.fn(async () => ({ ...seenStore })),
    markSeen: vi.fn(async (key: string) => { seenStore[key] = true; }),
    reset: vi.fn(),
  },
};

const i18n = createI18n({
  legacy: false,
  locale: 'sv',
  messages: {
    sv: { onboarding: { coach: { test: { tip: 'Klicka för att titta. Dubbelklicka för att flytta fokus.', dismiss: 'Förstått' } } } },
  },
});

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  for (const k of Object.keys(seenStore)) delete seenStore[k];
  __resetForTests();
  apiMock.onboarding.getSeen.mockClear();
  apiMock.onboarding.markSeen.mockClear();
  (window as unknown as { api: typeof apiMock }).api = apiMock;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  // Remove any teleported coachmark nodes that survive unmount
  document.body.querySelectorAll('.coachmark').forEach((n) => n.remove());
});

const Host = defineComponent({
  components: { Coachmark },
  setup() {
    const anchor = ref<HTMLElement | null>(null);
    return { anchor };
  },
  template: `
    <div>
      <div ref="anchor" data-test="anchor" style="position: absolute; top: 100px; left: 100px; width: 50px; height: 50px;"></div>
      <Coachmark seen-key="coach.test.alpha" :anchor-el="anchor" tip-key="onboarding.coach.test.tip" dismiss-key="onboarding.coach.test.dismiss" />
    </div>
  `,
});

describe('Coachmark', () => {
  it('renders when unseen, hides when seen', async () => {
    wrapper = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    const el = document.body.querySelector('.coachmark');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Klicka för att titta');
  });

  it('hides if seen-key already in onboarding.seen', async () => {
    seenStore['coach.test.alpha'] = true;
    wrapper = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    expect(document.body.querySelector('.coachmark')).toBeNull();
  });

  it('clicking the dismiss button marks seen and hides', async () => {
    wrapper = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    const btn = document.body.querySelector('button.coachmark__dismiss') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    btn!.click();
    await flushPromises();
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('coach.test.alpha');
    expect(document.body.querySelector('.coachmark')).toBeNull();
  });

  it('has role=status and aria-live=polite', async () => {
    wrapper = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    const el = document.body.querySelector('.coachmark');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('status');
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });
});
