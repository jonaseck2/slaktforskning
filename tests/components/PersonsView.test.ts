import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PersonsView from '../../src/renderer/views/PersonsView.vue';
import { i18n } from './setup';

// Mutable route params so individual tests can vary personId
const { routeParams, mockReplace } = vi.hoisted(() => ({
  routeParams: { personId: 'test-id' as string | undefined },
  mockReplace: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routeParams, path: '/persons' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: mockReplace }),
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

describe('PersonsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    routeParams.personId = 'test-id';
    (window as unknown as { api: unknown }).api = {
      persons: {
        get: vi.fn().mockResolvedValue({ id: 'test-id', sex: 'M', living: true }),
        getNames: vi.fn().mockResolvedValue([{ given_name: 'Magnus', surname: 'Eriksson', preferred_name: null, nickname: null, sort_order: 0 }]),
        list: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
        listPage: vi.fn().mockResolvedValue({ persons: [{ id: 'test-id' }], total: 1 }),
      },
      db: {
        getSetting: vi.fn().mockResolvedValue(null),
      },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  it('renders the hourglass chart tab by default', async () => {
    const wrapper = mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    expect(wrapper.find('.stub-hourglass').exists()).toBe(true);
  });

  it('switches to hourglass tab when clicked', async () => {
    const wrapper = mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    const chip = findChip(wrapper, 'Hourglass');
    expect(chip).toBeDefined();
    await chip!.trigger('click');
    expect(wrapper.find('.stub-hourglass').exists()).toBe(true);
  });

  it('switches to timeline tab when clicked', async () => {
    const wrapper = mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    const chip = findChip(wrapper, 'Timeline');
    expect(chip).toBeDefined();
    await chip!.trigger('click');
    expect(wrapper.find('.stub-timeline').exists()).toBe(true);
  });

  // ── Tab chip accessibility ──────────────────────────────────────────────────

  it('renders 5 tab chips in the chart FilterChips bar', async () => {
    const wrapper = mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    // Scope to the chart's own tab bar — the embedded PersonsListTab has its
    // own FilterChips for the persons list filter that would otherwise be
    // counted here.
    const chartTabs = wrapper.find('.viz-tabs').findAll('.chip-btn');
    expect(chartTabs).toHaveLength(5);
  });

  it('active tab chip has the active class, others do not', async () => {
    localStorage.clear(); // default tab is hourglass
    const wrapper = mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();

    const hourglass = findChip(wrapper, 'Hourglass');
    const pedigree = findChip(wrapper, 'Pedigree');
    expect(hourglass?.classes()).toContain('chip-btn--active');
    expect(pedigree?.classes()).not.toContain('chip-btn--active');
  });

  it('active class updates when tab changes', async () => {
    localStorage.clear();
    const wrapper = mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();

    const pedigree = findChip(wrapper, 'Pedigree');
    await pedigree!.trigger('click');
    expect(findChip(wrapper, 'Pedigree')?.classes()).toContain('chip-btn--active');
    expect(findChip(wrapper, 'Hourglass')?.classes()).not.toContain('chip-btn--active');
  });

  // ── Tree subject fallback (load()) ─────────────────────────────────────────

  describe('load() tree subject fallback', () => {
    it('redirects to default_person_id when no route personId', async () => {
      routeParams.personId = undefined;
      (window as any).api.db.getSetting.mockResolvedValue('default-id');

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      expect(mockReplace).toHaveBeenCalledWith('/persons/default-id');
    });

    it('redirects to first person when no route personId, no default_person_id, and persons exist', async () => {
      routeParams.personId = undefined;
      // db.getSetting returns null (default mock); listPage returns 1 person.

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      // Per the empty-tree-on-fresh-DB fix (709c4840): when persons exist
      // but no tree subject is set, route-replace to the first person so
      // the chart never opens to a blank screen.
      expect((window as any).api.persons.listPage).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/persons/test-id');
    });

    it('redirects to default_person_id when route person is not found in current db', async () => {
      (window as any).api.persons.get.mockResolvedValue(null);
      (window as any).api.db.getSetting.mockResolvedValue('default-id');

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      expect(mockReplace).toHaveBeenCalledWith('/persons/default-id');
    });

    it('redirects to first person when route person not found, no default_person_id, and a different person exists', async () => {
      routeParams.personId = 'missing-id';
      (window as any).api.persons.get.mockResolvedValue(null);
      // db.getSetting returns null (default mock); listPage returns id 'test-id'
      // (different from the missing route id, so the loop guard does NOT apply).

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      // Same fallback as above — when the route id is invalid, redirect to
      // the first existing person rather than rendering a blank chart.
      expect((window as any).api.persons.listPage).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/persons/test-id');
    });

    it('does not redirect when route person is found', async () => {
      // persons.get returns a person (default mock)
      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not redirect when route person not found and default_person_id is same id', async () => {
      (window as any).api.persons.get.mockResolvedValue(null);
      (window as any).api.db.getSetting.mockResolvedValue('test-id'); // same as routeParams.personId

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      // Guard against infinite redirect loop: skip if defaultId === id
      expect(mockReplace).not.toHaveBeenCalled();
      // Per renderer rules: never use un-paged list() for existence/probe.
      // PersonsView falls back to listPage(1, 0, …) instead.
      expect((window as any).api.persons.listPage).toHaveBeenCalled();
    });
  });
});
