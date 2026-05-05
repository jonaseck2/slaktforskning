import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import HourglassChart from '../../src/renderer/components/charts/HourglassChart.vue';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// User goal: every control button in the bottom-right toolbar must have a
// non-empty `title` attribute (and matching aria-label) so hovering reveals
// what the button does. Locks the contract so future controls can't ship
// without one.
//
// The number-stepper between the +/− buttons is also covered: it's a `<span>`
// (not a button), but it carries `title` + `aria-label` so the user goal —
// "hover the number, learn what it does" — is preserved.
describe('HourglassChart — control tooltips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
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
        getForPerson: vi.fn().mockResolvedValue([]),
      },
      media: { profilePicRef: vi.fn().mockResolvedValue(null) },
    };
  });

  async function mountChart() {
    const wrapper = mount(HourglassChart, {
      global: { plugins: [i18n] },
      props: { personId: 'focal', selectedPersonId: null },
    });
    await flushPromises();
    return wrapper;
  }

  it('every control button in the chart toolbar has a non-empty title attribute', async () => {
    const wrapper = await mountChart();
    // Find the toolbar (ZoomControls renders .zoom-controls-bar).
    const toolbar = wrapper.find('.zoom-controls-bar');
    expect(toolbar.exists()).toBe(true);
    const buttons = toolbar.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      const title = btn.attributes('title');
      const aria = btn.attributes('aria-label');
      expect(title, `Button missing title: ${btn.html()}`).toBeTruthy();
      expect(title?.trim().length ?? 0).toBeGreaterThan(0);
      expect(aria, `Button missing aria-label: ${btn.html()}`).toBeTruthy();
      expect(aria?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('the generation-count number-stepper has a non-empty title', async () => {
    const wrapper = await mountChart();
    const valueEl = wrapper.find('.zoom-extra-value');
    expect(valueEl.exists()).toBe(true);
    const title = valueEl.attributes('title');
    expect(title).toBeTruthy();
    // The plan's most-important string: includes "ancestors and descendants"
    // (English) or "framåt och bakåt i tiden" (Swedish). Test runs under en.
    expect(title).toMatch(/ancestors and descendants/i);
  });
});
