import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SourceCoverageSection from '../../src/renderer/components/SourceCoverageSection.vue';
import { i18n } from './setup';

const fixture = [
  {
    id: 'c-1',
    source_id: 's-1',
    event_type: 'birth',
    date_value_from: '1850',
    date_value_to: '1920',
    place_id: 'pl-1',
    notes: '',
    created_at: '2026-01-01',
  },
  {
    id: 'c-2',
    source_id: 's-1',
    event_type: 'marriage',
    date_value_from: '1860',
    date_value_to: '1900',
    place_id: null,
    notes: 'civil',
    created_at: '2026-01-02',
  },
];

function installMockApi(forSource: ReturnType<typeof vi.fn>) {
  (window as unknown as { api: unknown }).api = {
    sourceCoverage: {
      forSource,
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
    },
    places: {
      get: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'pl-1') return { name: 'Östergötland' };
        return null;
      }),
    },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
  };
}

describe('SourceCoverageSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads + renders coverage rows with event type / date range / place', async () => {
    const forSource = vi.fn().mockResolvedValue(fixture);
    installMockApi(forSource);

    const wrapper = mount(SourceCoverageSection, {
      global: { plugins: [i18n] },
      props: { sourceId: 's-1' },
    });
    await flushPromises();

    expect(forSource).toHaveBeenCalledWith('s-1');
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    // event_type badge translated via eventTypes.<type>
    expect(wrapper.text()).toContain('Birth');
    expect(wrapper.text()).toContain('Marriage');
    // Date range rendered
    expect(wrapper.text()).toContain('1850');
    expect(wrapper.text()).toContain('1920');
    // Hydrated place name
    expect(wrapper.text()).toContain('Östergötland');
  });

  it('shows empty state when no coverage rows exist', async () => {
    installMockApi(vi.fn().mockResolvedValue([]));

    const wrapper = mount(SourceCoverageSection, {
      global: { plugins: [i18n] },
      props: { sourceId: 's-1' },
    });
    await flushPromises();

    expect(wrapper.find('tbody tr').exists()).toBe(false);
    expect(wrapper.find('.section-empty').exists()).toBe(true);
  });

  it('reloads when sourceId changes (host flows in)', async () => {
    const forSource = vi.fn().mockResolvedValue([]);
    installMockApi(forSource);

    const wrapper = mount(SourceCoverageSection, {
      global: { plugins: [i18n] },
      props: { sourceId: 's-1' },
    });
    await flushPromises();
    expect(forSource).toHaveBeenCalledWith('s-1');

    await wrapper.setProps({ sourceId: 's-99' });
    await flushPromises();
    expect(forSource).toHaveBeenCalledWith('s-99');
  });

  it('exposes count + openAddForm for the parent panel', async () => {
    installMockApi(vi.fn().mockResolvedValue(fixture));

    const wrapper = mount(SourceCoverageSection, {
      global: { plugins: [i18n] },
      props: { sourceId: 's-1' },
    });
    await flushPromises();
    const exposed = wrapper.vm as unknown as { count: number; openAddForm: () => void };
    expect(exposed.count).toBe(2);
    expect(typeof exposed.openAddForm).toBe('function');
  });
});
