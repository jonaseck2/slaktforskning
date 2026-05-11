import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, ref, computed, h } from 'vue';
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
    sv: {
      onboarding: {
        coach: {
          faceTagging: {
            tip: 'Klicka och dra på bilden för att markera ett ansikte. Knyt sedan markeringen till en person.',
            dismiss: 'Förstått',
          },
        },
      },
    },
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
  document.body.querySelectorAll('.coachmark').forEach((n) => n.remove());
});

// A minimal host that mimics the MediaView wiring: drawMode flag,
// canvas-like anchor element, and a reactive regions array.
const FaceTagHost = defineComponent({
  components: { Coachmark },
  setup() {
    const canvasEl = ref<HTMLElement | null>(null);
    const drawMode = ref(true);
    const regions = ref<Array<{ id: string }>>([]);
    const regionsLength = computed(() => regions.value.length);
    return { canvasEl, drawMode, regions, regionsLength };
  },
  render() {
    return h('div', [
      h('div', {
        ref: 'canvasEl',
        'data-test': 'canvas',
        style: 'position: absolute; top: 100px; left: 100px; width: 400px; height: 300px;',
      }),
      this.drawMode
        ? h(Coachmark, {
            seenKey: 'coach.media.faceTagging',
            anchorEl: this.canvasEl,
            tipKey: 'onboarding.coach.faceTagging.tip',
            dismissKey: 'onboarding.coach.faceTagging.dismiss',
            placement: 'below',
            autoDismissOn: () => this.regionsLength > 0,
          })
        : null,
    ]);
  },
});

async function nextRaf() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe('Coachmark — face tagging', async () => {
  it('renders when face-tag mode is active and there are no regions yet', async () => {
    wrapper = mount(FaceTagHost, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    const el = document.body.querySelector('.coachmark');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Klicka och dra på bilden');
    expect(el?.textContent).toContain('Förstått');
  });

  it('auto-dismisses when a region is added and marks seen', async () => {
    wrapper = mount(FaceTagHost, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    expect(document.body.querySelector('.coachmark')).not.toBeNull();

    // Simulate the user drawing their first face region.
    (wrapper.vm as unknown as { regions: Array<{ id: string }> }).regions.push({ id: 'r1' });
    await flushPromises();

    // Coachmark's RAF tick reads autoDismissOn() and calls dismiss().
    await nextRaf();
    await flushPromises();
    await nextRaf();
    await flushPromises();

    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('coach.media.faceTagging');
    expect(document.body.querySelector('.coachmark')).toBeNull();
  });

  it('stays hidden if seen-key already in onboarding.seen', async () => {
    seenStore['coach.media.faceTagging'] = true;
    wrapper = mount(FaceTagHost, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    expect(document.body.querySelector('.coachmark')).toBeNull();
  });
});
