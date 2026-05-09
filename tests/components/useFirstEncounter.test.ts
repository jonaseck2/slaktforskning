import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useFirstEncounter, __resetForTests } from '../../src/renderer/composables/useFirstEncounter';

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
  __resetForTests();
  for (const k of Object.keys(seenStore)) delete seenStore[k];
  apiMock.onboarding.getSeen.mockClear();
  apiMock.onboarding.markSeen.mockClear();
  (window as unknown as { api: typeof apiMock }).api = apiMock;
});

const Probe = defineComponent({
  props: ['k'],
  setup(props) {
    const enc = useFirstEncounter(props.k as string);
    return () => h('div', {}, [
      h('span', { 'data-test': 'seen' }, String(enc.seen.value)),
      h('button', { 'data-test': 'mark', onClick: enc.markSeen }, 'mark'),
    ]);
  },
});

describe('useFirstEncounter', () => {
  it('starts unseen, transitions to seen after markSeen()', async () => {
    const w = mount(Probe, { props: { k: 'coach.test.alpha' } });
    await flushPromises();
    expect(w.get('[data-test="seen"]').text()).toBe('false');
    await w.get('[data-test="mark"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-test="seen"]').text()).toBe('true');
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('coach.test.alpha');
  });

  it('reflects already-seen state from settings', async () => {
    seenStore['coach.test.beta'] = true;
    const w = mount(Probe, { props: { k: 'coach.test.beta' } });
    await flushPromises();
    expect(w.get('[data-test="seen"]').text()).toBe('true');
  });

  it('two instances of the same key share state', async () => {
    const w1 = mount(Probe, { props: { k: 'coach.test.gamma' } });
    const w2 = mount(Probe, { props: { k: 'coach.test.gamma' } });
    await flushPromises();
    await w1.get('[data-test="mark"]').trigger('click');
    await flushPromises();
    expect(w2.get('[data-test="seen"]').text()).toBe('true');
  });
});
