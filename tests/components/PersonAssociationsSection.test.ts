import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonAssociationsSection from '../../src/renderer/components/PersonAssociationsSection.vue';
import { i18n } from './setup';

const fixture = [
  {
    id: 'a-1',
    person_id: 'p-1',
    related_person_id: 'p-2',
    role: 'godparent' as const,
    notes: '',
    created_at: '2026-01-01',
  },
  {
    id: 'a-2',
    person_id: 'p-1',
    related_person_id: 'p-3',
    role: 'friend' as const,
    notes: 'best friend',
    created_at: '2026-01-02',
  },
];

function installMockApi(forPerson: ReturnType<typeof vi.fn>) {
  (window as unknown as { api: unknown }).api = {
    personAssociations: {
      forPerson,
      toPerson: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      get: vi.fn(),
    },
    persons: {
      // resolvePersonDisplayName falls back to getNames+events
      getNames: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'p-2') return [{ given_name: 'Anna', surname: 'Andersson', name_type: 'birth', sort_order: 0 }];
        if (id === 'p-3') return [{ given_name: 'Erik', surname: 'Eriksson', name_type: 'birth', sort_order: 0 }];
        return [];
      }),
    },
    events: {
      forPerson: vi.fn().mockResolvedValue([]),
    },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
  };
}

describe('PersonAssociationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders associations for the host person', async () => {
    const forPerson = vi.fn().mockResolvedValue(fixture);
    installMockApi(forPerson);

    const wrapper = mount(PersonAssociationsSection, {
      global: { plugins: [i18n] },
      props: { personId: 'p-1' },
    });
    await flushPromises();

    expect(forPerson).toHaveBeenCalledWith('p-1');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    // Role badges rendered through the i18n key
    expect(wrapper.text()).toContain('Godparent');
    expect(wrapper.text()).toContain('Friend');
  });

  it('shows empty state when no associations exist', async () => {
    installMockApi(vi.fn().mockResolvedValue([]));

    const wrapper = mount(PersonAssociationsSection, {
      global: { plugins: [i18n] },
      props: { personId: 'p-1' },
    });
    await flushPromises();

    expect(wrapper.find('tbody tr').exists()).toBe(false);
    expect(wrapper.find('.section-empty').exists()).toBe(true);
  });

  it('reloads when personId changes (host flows in)', async () => {
    const forPerson = vi.fn().mockResolvedValue([]);
    installMockApi(forPerson);

    const wrapper = mount(PersonAssociationsSection, {
      global: { plugins: [i18n] },
      props: { personId: 'p-1' },
    });
    await flushPromises();
    expect(forPerson).toHaveBeenCalledWith('p-1');

    await wrapper.setProps({ personId: 'p-99' });
    await flushPromises();
    expect(forPerson).toHaveBeenCalledWith('p-99');
  });

  it('exposes count + openAddForm for the parent panel', async () => {
    installMockApi(vi.fn().mockResolvedValue(fixture));

    const wrapper = mount(PersonAssociationsSection, {
      global: { plugins: [i18n] },
      props: { personId: 'p-1' },
    });
    await flushPromises();

    const exposed = wrapper.vm as unknown as { count: number; openAddForm: () => void };
    expect(exposed.count).toBe(2);
    expect(typeof exposed.openAddForm).toBe('function');
  });

  it('hides trash + add affordances in readonly mode (lifecycle parity disabled)', async () => {
    installMockApi(vi.fn().mockResolvedValue(fixture));

    const wrapper = mount(PersonAssociationsSection, {
      global: { plugins: [i18n] },
      props: { personId: 'p-1', readonly: true },
    });
    await flushPromises();

    // No action column header
    expect(wrapper.findAll('th')).toHaveLength(2);
    // No delete buttons in rows
    expect(wrapper.find('button[aria-label="Delete"]').exists()).toBe(false);
  });
});
