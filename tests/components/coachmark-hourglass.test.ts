import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import HourglassChart from '../../src/renderer/components/charts/HourglassChart.vue';
import { __resetForTests } from '../../src/renderer/composables/useFirstEncounter';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Verifies the user-observable contract for the Hourglass focus-switch
// coachmark (Task 17 of the onboarding plan):
//   1. On a fresh DB (onboarding.seen empty), the coachmark is visible
//      anchored to the focus person box.
//   2. Double-clicking any person dismisses the coachmark and persists the
//      seen flag via window.api.onboarding.markSeen('coach.hourglass.focus').
//   3. If the seen flag is already set, the coachmark never appears.

const seenStore: Record<string, true> = {};
const onboardingApi = {
  getSeen: vi.fn(async () => ({ ...seenStore })),
  markSeen: vi.fn(async (key: string) => { seenStore[key] = true; }),
  reset: vi.fn(async () => { for (const k of Object.keys(seenStore)) delete seenStore[k]; }),
};

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(seenStore)) delete seenStore[k];
  __resetForTests();
  (window as unknown as { api: unknown }).api = {
    onboarding: onboardingApi,
    persons: {
      get: vi.fn().mockImplementation((id: unknown) =>
        Promise.resolve({ id, sex: 'M', living: true }),
      ),
      getNames: vi.fn().mockImplementation((id: unknown) =>
        Promise.resolve([{ given_name: String(id), surname: 'Test', sort_order: 0 }]),
      ),
    },
    events: { forPerson: vi.fn().mockResolvedValue([]) },
    relationships: {
      getForPerson: vi.fn().mockImplementation((id: unknown) => {
        if (id === 'focal') {
          return Promise.resolve([
            { type: 'parent_child', person1_id: 'parent1', person2_id: 'focal', subtype: 'biological' },
          ]);
        }
        return Promise.resolve([]);
      }),
    },
    media: { profilePicRef: vi.fn().mockResolvedValue(null) },
    onDataChanged: vi.fn(() => () => {}),
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  // Teleport is stubbed in setup.ts but defend against any straggler.
  document.body.querySelectorAll('.coachmark').forEach((n) => n.remove());
});

async function mountChart() {
  wrapper = mount(HourglassChart, {
    global: { plugins: [i18n] },
    props: { personId: 'focal', selectedPersonId: 'focal' },
    attachTo: document.body,
  });
  await flushPromises();
  // Coachmark mount is async — it awaits the getSeen IPC before deciding to
  // render. Flush a couple of ticks so the v-if resolves.
  await flushPromises();
  return wrapper;
}

function findCoachmark(): Element | null {
  // Teleport is stubbed to a passthrough in setup.ts, so the coachmark is
  // rendered inside the wrapper's DOM. Query the document either way to be
  // robust to either path.
  return document.body.querySelector('.coachmark');
}

describe('Hourglass focus-switch coachmark', () => {
  it('renders on first chart open when no seen flag is set', async () => {
    await mountChart();
    const el = findCoachmark();
    expect(el).not.toBeNull();
    // English locale ('en') from setup.ts
    expect(el?.textContent).toContain('Click any person');
  });

  it('does not render when seen flag is already set', async () => {
    seenStore['coach.hourglass.focus'] = true;
    await mountChart();
    expect(findCoachmark()).toBeNull();
  });

  it('dismisses on double-click of any person and persists seen flag', async () => {
    const w = await mountChart();
    expect(findCoachmark()).not.toBeNull();

    // Double-click the focal box. Coachmark watches focusChangedOnce via its
    // autoDismissOn callback (polled per RAF tick) and calls markSeen() →
    // unmounts.
    const focalBox = w.find('[data-testid="person-box-focal"]');
    expect(focalBox.exists()).toBe(true);
    await focalBox.trigger('dblclick');
    await flushPromises();
    // Give the rAF tick a couple of frames to fire — Coachmark polls
    // autoDismissOn() in its tick() loop.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    await flushPromises();

    expect(onboardingApi.markSeen).toHaveBeenCalledWith('coach.hourglass.focus');
    expect(findCoachmark()).toBeNull();
  });
});
