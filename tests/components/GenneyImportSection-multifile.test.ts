import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GenneyImportSection from '../../src/renderer/components/import/GenneyImportSection.vue';
import { i18n } from './setup';

/**
 * The Genney section has three flows (.backup, .gcc, .ged) and all three
 * reuse the same queue: pick many, import in one action, see one report.
 */
describe('GenneyImportSection — many files, one action', () => {
  const summary = (n: number) => ({
    persons: n, coupleRelationships: 0, parentChildRelationships: 0,
    events: 0, places: 0, sources: n * 2, citations: 0,
    groups: 0, repositories: 0, researchTasks: 0, media: 0,
    warnings: [] as string[], skipped: [] as string[],
  });

  let selectArchives: ReturnType<typeof vi.fn>;
  let selectGedFiles: ReturnType<typeof vi.fn>;
  let genneyRun: ReturnType<typeof vi.fn>;
  let gedcomImport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectArchives = vi.fn().mockResolvedValue(['/tmp/a.gcc', '/tmp/b.gcc']);
    selectGedFiles = vi.fn().mockResolvedValue(['/tmp/a.ged', '/tmp/b.ged']);
    genneyRun = vi.fn(async ({ sourcePath }: { sourcePath: string }) => ({
      success: true,
      report: { imported: true, summary: summary(sourcePath.includes('/a.') ? 100 : 23) },
    }));
    gedcomImport = vi.fn().mockResolvedValue({ success: true });
    (window as unknown as { api: unknown }).api = {
      import: {
        genneySelectArchive: vi.fn(),
        genneySelectArchives: selectArchives,
        genneySelectMedia: vi.fn().mockResolvedValue({ canceled: true }),
        genneyRun,
        onProgress: vi.fn(),
      },
      gedcom: { selectFile: vi.fn(), selectFiles: selectGedFiles, import: gedcomImport },
    };
  });

  function mountSection() {
    return mount(GenneyImportSection, {
      global: {
        plugins: [i18n],
        stubs: {
          BaseSubPanel: {
            props: ['title'],
            template: '<div class="sub-panel"><h4>{{ title }}</h4><slot /></div>',
          },
        },
      },
    });
  }

  // Box 1 button is index 0; box 2 (.gcc) buttons are 1..3; box 3 (.ged) are 4..6.
  const BACKUP_PICK = 0, GCC_PICK = 1, GCC_IMPORT = 3, GED_PICK = 4, GED_IMPORT = 6;

  async function click(wrapper: ReturnType<typeof mountSection>, i: number) {
    await wrapper.findAll('button')[i].trigger('click');
    await flushPromises();
  }

  it('the .backup flow imports every picked archive', async () => {
    const wrapper = mountSection();
    await click(wrapper, BACKUP_PICK);
    expect(genneyRun).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.sub-panel').text()).toContain('123');
  });

  it('the .gcc flow imports every picked archive from one click', async () => {
    const wrapper = mountSection();
    await click(wrapper, GCC_PICK);
    await click(wrapper, GCC_IMPORT);
    expect(genneyRun).toHaveBeenCalledTimes(2);
    expect(genneyRun.mock.calls[0][0].sourcePath).toBe('/tmp/a.gcc');
    expect(genneyRun.mock.calls[1][0].sourcePath).toBe('/tmp/b.gcc');
    expect(wrapper.find('.sub-panel').text()).toContain('123');
  });

  it('the .ged flow imports every picked file from one click', async () => {
    const wrapper = mountSection();
    await click(wrapper, GED_PICK);
    await click(wrapper, GED_IMPORT);
    expect(gedcomImport).toHaveBeenCalledTimes(2);
    expect(gedcomImport.mock.calls[0][0].filePath).toBe('/tmp/a.ged');
    expect(gedcomImport.mock.calls[1][0].filePath).toBe('/tmp/b.ged');
  });

  it('a failure on the first archive still imports the second', async () => {
    genneyRun.mockImplementation(async ({ sourcePath }: { sourcePath: string }) => {
      if (sourcePath.includes('/a.')) throw new Error('encrypted archive');
      return { success: true, report: { imported: true, summary: summary(23) } };
    });
    const wrapper = mountSection();
    await click(wrapper, GCC_PICK);
    await click(wrapper, GCC_IMPORT);
    expect(genneyRun).toHaveBeenCalledTimes(2);
    const text = wrapper.find('.sub-panel').text();
    expect(text).toContain('encrypted archive');
    expect(text).toContain('23');
  });

  it('picking nothing leaves the .gcc import button disabled', async () => {
    selectArchives.mockResolvedValue([]);
    const wrapper = mountSection();
    await click(wrapper, GCC_PICK);
    expect(wrapper.findAll('button')[GCC_IMPORT].attributes('disabled')).toBeDefined();
  });
});
