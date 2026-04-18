import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import VisualizationView from '../../src/renderer/views/VisualizationView.vue';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { personId: 'test-id' } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock('../../src/renderer/components/charts/FanChart.vue', () => ({
  default: { template: '<div class="stub-fan" />', props: ['personId'], emits: ['navigate'] },
}));
vi.mock('../../src/renderer/components/charts/PedigreeChart.vue', () => ({
  default: { template: '<div class="stub-pedigree" />', props: ['personId'], emits: ['navigate'] },
}));
vi.mock('../../src/renderer/components/charts/HourglassChart.vue', () => ({
  default: { template: '<div class="stub-hourglass" />', props: ['personId'], emits: ['navigate'] },
}));
vi.mock('../../src/renderer/components/charts/TimelineChart.vue', () => ({
  default: { template: '<div class="stub-timeline" />', props: ['personId'], emits: ['navigate'] },
}));
vi.mock('../../src/renderer/components/PersonPicker.vue', () => ({
  default: { template: '<div class="stub-picker" />', props: ['modelValue', 'placeholder'], emits: ['select', 'update:modelValue'] },
}));
vi.mock('../../src/renderer/components/PersonPanel.vue', () => ({
  default: { template: '<div class="stub-person-panel" />', props: ['personId'], emits: ['focus', 'select'] },
}));

/** Find a FilterChips chip button by its text label */
function findChip(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('.chip-btn').find(b => b.text().trim() === label);
}

describe('VisualizationView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (window as unknown as { api: unknown }).api = {
      persons: {
        get: vi.fn().mockResolvedValue({ id: 'test-id', sex: 'M', living: true }),
        getNames: vi.fn().mockResolvedValue([{ given_name: 'Magnus', surname: 'Eriksson', preferred_name: null, nickname: null, sort_order: 0 }]),
        list: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
      },
    };
  });

  it('renders the hourglass chart tab by default', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    expect(wrapper.find('.stub-hourglass').exists()).toBe(true);
  });

  it('switches to hourglass tab when clicked', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    const chip = findChip(wrapper, 'Hourglass');
    expect(chip).toBeDefined();
    await chip!.trigger('click');
    expect(wrapper.find('.stub-hourglass').exists()).toBe(true);
  });

  it('switches to timeline tab when clicked', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    const chip = findChip(wrapper, 'Timeline');
    expect(chip).toBeDefined();
    await chip!.trigger('click');
    expect(wrapper.find('.stub-timeline').exists()).toBe(true);
  });

  // ── Tab chip accessibility ──────────────────────────────────────────────────

  it('renders 5 tab chips in the FilterChips bar', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    const chips = wrapper.findAll('.chip-btn');
    expect(chips).toHaveLength(5);
  });

  it('active tab chip has the active class, others do not', async () => {
    localStorage.clear(); // default tab is hourglass
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();

    const hourglass = findChip(wrapper, 'Hourglass');
    const pedigree = findChip(wrapper, 'Pedigree');
    expect(hourglass?.classes()).toContain('chip-btn--active');
    expect(pedigree?.classes()).not.toContain('chip-btn--active');
  });

  it('active class updates when tab changes', async () => {
    localStorage.clear();
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();

    const pedigree = findChip(wrapper, 'Pedigree');
    await pedigree!.trigger('click');
    expect(findChip(wrapper, 'Pedigree')?.classes()).toContain('chip-btn--active');
    expect(findChip(wrapper, 'Hourglass')?.classes()).not.toContain('chip-btn--active');
  });
});
