import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PedigreeChart from '../../src/renderer/components/charts/PedigreeChart.vue';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PedigreeChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      persons: {
        get: vi.fn().mockResolvedValue({ id: 'p1', sex: 'M', living: true }),
        getNames: vi.fn().mockResolvedValue([{ given_name: 'Magnus', surname: 'Eriksson', sort_order: 0 }]),
      },
      events: { forPerson: vi.fn().mockResolvedValue([]) },
      relationships: { getForPerson: vi.fn().mockResolvedValue([]) },
      media: { profilePicRef: vi.fn().mockResolvedValue(null) },
    };
  });

  it('renders an SVG after data loads', async () => {
    const wrapper = mount(PedigreeChart, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('renders at least one rect for the focal person box', async () => {
    const wrapper = mount(PedigreeChart, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();
    expect(wrapper.findAll('rect').length).toBeGreaterThan(0);
  });

  it('shows the focal person name', async () => {
    const wrapper = mount(PedigreeChart, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Magnus Eriksson');
  });

  it('renders data-testid on the person box', async () => {
    const wrapper = mount(PedigreeChart, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="person-box-p1"]').exists()).toBe(true);
  });

  it('emits navigate when a non-focal box is clicked', async () => {
    (window as unknown as { api: unknown }).api = {
      persons: {
        get: vi.fn().mockImplementation((id: unknown) =>
          Promise.resolve({ id, sex: 'M', living: true })
        ),
        getNames: vi.fn().mockResolvedValue([{ given_name: 'Test', surname: 'Name', sort_order: 0 }]),
      },
      events: { forPerson: vi.fn().mockResolvedValue([]) },
      relationships: {
        getForPerson: vi.fn().mockImplementation((id: unknown) => {
          if (id === 'p1') {
            return Promise.resolve([{ type: 'parent_child', person1_id: 'parent1', person2_id: 'p1' }]);
          }
          return Promise.resolve([]);
        }),
      },
      media: { profilePicRef: vi.fn().mockResolvedValue(null) },
    };

    const wrapper = mount(PedigreeChart, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    const parentBox = wrapper.find('[data-testid="person-box-parent1"]');
    expect(parentBox.exists()).toBe(true);
    await parentBox.trigger('click');
    expect(wrapper.emitted('navigate')).toBeTruthy();
    expect(wrapper.emitted('navigate')![0]).toEqual(['parent1']);
  });
});
