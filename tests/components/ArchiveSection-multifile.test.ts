import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ArchiveSection from '../../src/renderer/components/import/ArchiveSection.vue';
import { i18n } from './setup';

/**
 * The archive (.zip) section reuses the same queue: pick many, import in one
 * action, see one report.
 */
describe('ArchiveSection — many archives, one action', () => {
  const report = (n: number) => ({
    gedcomReport: {
      persons: n, families: 0, events: {}, sources: n * 2,
      places: 0, citations: 0, warnings: [],
    },
    mediaImported: n, mediaSkipped: [],
  });

  let selectFiles: ReturnType<typeof vi.fn>;
  let importFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectFiles = vi.fn().mockResolvedValue(['/tmp/a.zip', '/tmp/b.zip']);
    importFn = vi.fn(async (filePath: string) => ({
      imported: true, filePath, report: report(filePath.includes('/a.') ? 100 : 23),
    }));
    (window as unknown as { api: unknown }).api = {
      archive: { import: importFn, export: vi.fn(), selectFiles },
      db: { getSetting: vi.fn().mockResolvedValue(null), setSetting: vi.fn() },
      persons: { getNames: vi.fn().mockResolvedValue([]) },
    };
  });

  function mountSection() {
    return mount(ArchiveSection, {
      global: {
        plugins: [i18n],
        stubs: {
          PersonPicker: true,
          BaseSubPanel: {
            props: ['title'],
            template: '<div class="sub-panel"><h4>{{ title }}</h4><slot /></div>',
          },
        },
      },
    });
  }

  async function clickImport() {
    const wrapper = mountSection();
    const btn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('import'));
    await btn!.trigger('click');
    await flushPromises();
    return wrapper;
  }

  it('imports every picked archive from one click', async () => {
    await clickImport();
    expect(importFn).toHaveBeenCalledTimes(2);
    expect(importFn).toHaveBeenNthCalledWith(1, '/tmp/a.zip');
    expect(importFn).toHaveBeenNthCalledWith(2, '/tmp/b.zip');
  });

  it('shows one report with the summed counts', async () => {
    const wrapper = await clickImport();
    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'report modal did not open').toBe(true);
    expect(panel.text()).toContain('123 persons');
    expect(panel.text()).toContain('246 sources');
  });

  it('a failure on the first archive still imports the second and names it', async () => {
    importFn.mockImplementation(async (filePath: string) => {
      if (filePath.includes('/a.')) return { canceled: false, error: 'corrupt zip' };
      return { imported: true, filePath, report: report(23) };
    });
    const wrapper = await clickImport();
    expect(importFn).toHaveBeenCalledTimes(2);
    const text = wrapper.find('.sub-panel').text();
    expect(text).toContain('corrupt zip');
    expect(text).toContain('23 persons');
  });

  it('picking nothing does nothing', async () => {
    selectFiles.mockResolvedValue([]);
    const wrapper = await clickImport();
    expect(importFn).not.toHaveBeenCalled();
    expect(wrapper.find('.sub-panel').exists()).toBe(false);
  });
});
