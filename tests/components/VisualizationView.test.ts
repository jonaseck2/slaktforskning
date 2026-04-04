import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import VisualizationView from '../../src/renderer/views/VisualizationView.vue';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { personId: 'test-id' } }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
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

describe('VisualizationView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (window as unknown as { api: unknown }).api = {
      persons: {
        get: vi.fn().mockResolvedValue({ id: 'test-id', sex: 'M', living: true }),
        getNames: vi.fn().mockResolvedValue([{ given_name: 'Magnus', surname: 'Eriksson', sort_order: 0 }]),
        list: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
      },
    };
  });

  it('displays the focal person name after loading', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Magnus Eriksson');
  });

  it('renders the hourglass chart tab by default', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.find('.stub-hourglass').exists()).toBe(true);
  });

  it('switches to hourglass tab when clicked', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
    await flushPromises();
    const tabs = wrapper.findAll('.tab');
    const hourglassTab = tabs.find(t => t.attributes('data-testid') === 'tab-hourglass');
    expect(hourglassTab).toBeDefined();
    await hourglassTab!.trigger('click');
    expect(wrapper.find('.stub-hourglass').exists()).toBe(true);
  });

  it('switches to timeline tab when clicked', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
    await flushPromises();
    const timelineTab = wrapper.find('[data-testid="tab-timeline"]');
    await timelineTab.trigger('click');
    expect(wrapper.find('.stub-timeline').exists()).toBe(true);
  });

  it('focal person name has data-testid attribute', async () => {
    const wrapper = mount(VisualizationView, { global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.find('[data-testid="visualization-focal-name"]').exists()).toBe(true);
  });
});
