import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GrampsImportSection from '../../src/renderer/components/import/GrampsImportSection.vue';
import { i18n } from './setup';

/**
 * The Gramps section reuses the same queue as the GEDCOM one: pick many,
 * import in one action, see one report.
 */
describe('GrampsImportSection — many files, one action', () => {
  const summary = (n: number) => ({
    persons: n, coupleRelationships: 0, parentChildRelationships: 0,
    events: 0, places: 0, sources: n * 2, citations: 0, media: 0,
    warnings: [] as string[], skipped: [] as string[],
  });

  let selectFiles: ReturnType<typeof vi.fn>;
  let runSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectFiles = vi.fn().mockResolvedValue(['/tmp/a.gramps', '/tmp/b.gramps']);
    runSpy = vi.fn(async ({ sourcePath }: { sourcePath: string }) => ({
      imported: true, summary: summary(sourcePath.includes('/a.') ? 100 : 23),
    }));
    (window as unknown as { api: unknown }).api = {
      import: {
        grampsSelectFile: vi.fn(),
        grampsSelectFiles: selectFiles,
        grampsRun: runSpy,
        onGrampsProgress: vi.fn(),
      },
    };
  });

  function mountSection() {
    return mount(GrampsImportSection, {
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

  async function pickThenImport() {
    const wrapper = mountSection();
    const buttons = wrapper.findAll('button');
    await buttons[0].trigger('click');
    await flushPromises();
    await wrapper.findAll('button')[1].trigger('click');
    await flushPromises();
    return wrapper;
  }

  it('imports every picked file from one click', async () => {
    await pickThenImport();
    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(runSpy).toHaveBeenNthCalledWith(1, { sourcePath: '/tmp/a.gramps' });
    expect(runSpy).toHaveBeenNthCalledWith(2, { sourcePath: '/tmp/b.gramps' });
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
      if (sourcePath.includes('/a.')) throw new Error('locked database');
      return { imported: true, summary: summary(23) };
    });
    const wrapper = await pickThenImport();
    expect(runSpy).toHaveBeenCalledTimes(2);
    const text = wrapper.find('.sub-panel').text();
    expect(text).toContain('locked database');
    expect(text).toContain('23 persons');
  });

  it('picking nothing leaves the import button disabled', async () => {
    selectFiles.mockResolvedValue([]);
    const wrapper = mountSection();
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();
    expect(wrapper.findAll('button')[1].attributes('disabled')).toBeDefined();
  });
});
