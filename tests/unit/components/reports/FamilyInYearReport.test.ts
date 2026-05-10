import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import FamilyInYearReport from '../../../../src/renderer/components/reports/FamilyInYearReport.vue';
import { i18n } from '../../../components/setup';

const mockApi = {
  reports: {
    aliveInYear: vi.fn(),
  },
  db: { getSetting: vi.fn() },
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockApi.db.getSetting.mockResolvedValue(null);
  (window as unknown as { api: unknown }).api = mockApi;
});

describe('FamilyInYearReport', async () => {
  it('renders cover with year title when data is loaded', async () => {
    mockApi.reports.aliveInYear.mockResolvedValue({
      year: 1850,
      persons: [],
      families: [],
      unattached: [
        {
          id: 'p1',
          given_name: 'Anna',
          surname: 'Andersson',
          sex: 'F',
          living: false,
          birthYear: 1820,
          deathYear: 1890,
          age: 30,
          placeName: 'Stockholm',
        },
      ],
    });

    const wrapper = mount(FamilyInYearReport, {
      props: { year: 1850 },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('1850');
  });

  it('hides families and individuals sections when data is empty', async () => {
    mockApi.reports.aliveInYear.mockResolvedValue({
      year: 1850,
      persons: [],
      families: [],
      unattached: [],
    });

    const wrapper = mount(FamilyInYearReport, {
      props: { year: 1850 },
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.find('.family-block').exists()).toBe(false);
    expect(wrapper.find('.individuals-grid').exists()).toBe(false);
    expect(wrapper.find('.members-grid').exists()).toBe(false);
  });
});
