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
  useRoute: () => ({ params: routeParams }),
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
      },
      db: {
        getSetting: vi.fn().mockResolvedValue(null),
      },
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

  it('renders 5 tab chips in the FilterChips bar', async () => {
    const wrapper = mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
    await flushPromises();
    const chips = wrapper.findAll('.chip-btn');
    expect(chips).toHaveLength(5);
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

    it('falls back to persons.list when no route personId and no default_person_id', async () => {
      routeParams.personId = undefined;
      // db.getSetting returns null (default mock)

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      expect(mockReplace).not.toHaveBeenCalled();
      expect((window as any).api.persons.list).toHaveBeenCalled();
    });

    it('redirects to default_person_id when route person is not found in current db', async () => {
      (window as any).api.persons.get.mockResolvedValue(null);
      (window as any).api.db.getSetting.mockResolvedValue('default-id');

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      expect(mockReplace).toHaveBeenCalledWith('/persons/default-id');
    });

    it('falls back to persons.list when route person not found and no default_person_id', async () => {
      (window as any).api.persons.get.mockResolvedValue(null);
      // db.getSetting returns null (default mock)

      mount(PersonsView, { global: { plugins: [i18n, createPinia()] } });
      await flushPromises();

      expect(mockReplace).not.toHaveBeenCalled();
      expect((window as any).api.persons.list).toHaveBeenCalled();
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
      expect((window as any).api.persons.list).toHaveBeenCalled();
    });
  });
});
