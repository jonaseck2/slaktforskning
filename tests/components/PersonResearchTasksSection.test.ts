import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonResearchTasksSection from '../../src/renderer/components/PersonResearchTasksSection.vue';
import { i18n } from './setup';

const tasks = [
  {
    id: 't-1',
    task: 'Hitta dopnotis',
    notes: '',
    result: '',
    status: 'open' as const,
    priority: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 't-2',
    task: 'Bekrafta foraldrar',
    notes: '',
    result: '',
    status: 'in_progress' as const,
    priority: 1,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

describe('PersonResearchTasksSection', () => {
  const mockForPerson = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      researchTasks: {
        forPerson: mockForPerson,
        update: vi.fn(),
        delete: vi.fn(),
      },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  it('renders all linked tasks', async () => {
    mockForPerson.mockResolvedValue(tasks);

    const wrapper = mount(PersonResearchTasksSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(mockForPerson).toHaveBeenCalledWith('person-1');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(wrapper.text()).toContain('Hitta dopnotis');
    expect(wrapper.text()).toContain('Bekrafta foraldrar');
  });

  it('shows empty state when there are no linked tasks', async () => {
    mockForPerson.mockResolvedValue([]);

    const wrapper = mount(PersonResearchTasksSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('table').exists()).toBe(false);
    // SectionEmpty renders the i18n message — ensure something is displayed.
    expect(wrapper.find('.empty, .section-empty').exists() || wrapper.text().length > 0).toBe(true);
  });

  it('emits select with the full task object when a row is clicked', async () => {
    mockForPerson.mockResolvedValue(tasks);

    const wrapper = mount(PersonResearchTasksSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    await wrapper.findAll('tbody tr')[0].trigger('click');

    const emitted = wrapper.emitted('select');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ id: 't-1', task: 'Hitta dopnotis' });
  });

  it('exposes a count for the parent panel header', async () => {
    mockForPerson.mockResolvedValue(tasks);

    const wrapper = mount(PersonResearchTasksSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    const exposed = wrapper.vm as unknown as { count: number };
    expect(exposed.count).toBe(2);
  });

  it('reloads when personId changes', async () => {
    mockForPerson.mockResolvedValue([]);

    const wrapper = mount(PersonResearchTasksSection, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(mockForPerson).toHaveBeenCalledWith('person-1');

    await wrapper.setProps({ personId: 'person-2' });
    await flushPromises();

    expect(mockForPerson).toHaveBeenCalledWith('person-2');
  });
});
