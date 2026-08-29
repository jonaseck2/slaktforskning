import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import HolgerImportSection from '../../src/renderer/components/import/HolgerImportSection.vue';
import { i18n } from './setup';

/**
 * The Holger section reuses the same queue as the GEDCOM one: pick many,
 * import in one action, see one report.
 */
describe('HolgerImportSection — many files, one action', () => {
  const report = (n: number) => ({
    version: '5.5.1', persons: n, families: 0, events: {},
    sources: n * 2, places: 0, citations: 0, skipped: [] as string[], warnings: [] as string[],
  });

  let selectFiles: ReturnType<typeof vi.fn>;
  let runSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectFiles = vi.fn().mockResolvedValue(['/tmp/a.ged', '/tmp/b.ged']);
    runSpy = vi.fn(async ({ sourcePath }: { sourcePath: string }) => ({
      success: true, report: report(sourcePath.includes('/a.') ? 100 : 23),
    }));
    (window as unknown as { api: unknown }).api = {
      import: {
        holgerSelectFile: vi.fn(),
        holgerSelectFiles: selectFiles,
        holgerSelectMedia: vi.fn().mockResolvedValue({ canceled: true }),
        holgerRun: runSpy,
        onHolgerProgress: vi.fn(),
      },
      db: { getSetting: vi.fn().mockResolvedValue(null), setSetting: vi.fn() },
      persons: { getNames: vi.fn().mockResolvedValue([]) },
    };
  });

  function mountSection() {
    return mount(HolgerImportSection, {
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

  async function pickThenImport() {
    const wrapper = mountSection();
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();
    await wrapper.findAll('button')[2].trigger('click');
    await flushPromises();
    return wrapper;
  }

  it('imports every picked file from one click', async () => {
    await pickThenImport();
    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(runSpy.mock.calls[0][0].sourcePath).toBe('/tmp/a.ged');
    expect(runSpy.mock.calls[1][0].sourcePath).toBe('/tmp/b.ged');
  });

  it('shows one report with the summed counts', async () => {
    const wrapper = await pickThenImport();
    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'report modal did not open').toBe(true);
    expect(panel.text()).toContain('123 persons');
    expect(panel.text()).toContain('246 sources');
  });

  it('a failure on the first file still imports the second and names the failure', async () => {
    runSpy.mockImplementation(async ({ sourcePath }: { sourcePath: string }) => {
      if (sourcePath.includes('/a.')) throw new Error('bad export');
      return { success: true, report: report(23) };
    });
    const wrapper = await pickThenImport();
    expect(runSpy).toHaveBeenCalledTimes(2);
    const text = wrapper.find('.sub-panel').text();
    expect(text).toContain('bad export');
    expect(text).toContain('23 persons');
  });

  it('picking nothing leaves the import button disabled', async () => {
    selectFiles.mockResolvedValue([]);
    const wrapper = mountSection();
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();
    expect(wrapper.findAll('button')[2].attributes('disabled')).toBeDefined();
  });
});
