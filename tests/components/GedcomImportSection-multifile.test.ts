import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GedcomImportSection from '../../src/renderer/components/import/GedcomImportSection.vue';
import { i18n } from './setup';

/**
 * A researcher with four exports from the same service imports them in ONE
 * action and sees ONE report. See
 * docs/plans/2026-08-23-multi-file-import-consolidation.md.
 *
 * The single-file path is asserted unchanged by
 * GedcomImportSection-flow.test.ts; this file covers what multi-select adds.
 */
describe('GedcomImportSection — many files, one action', () => {
  const preview = (n: number) => ({
    personCount: n, relationshipCount: 0, eventCount: 0,
    sourceCount: n * 2, placeCount: 0, repositoryCount: 0,
    warnings: [], estimatedSize: 'small' as const,
  });
  const report = (n: number) => ({
    version: '5.5.1', persons: n, families: 0, events: {},
    sources: n * 2, places: 0, citations: 0,
    repositories: 0, groups: 0, researchTasks: 0,
    skipped: [], warnings: [],
  });

  let selectFiles: ReturnType<typeof vi.fn>;
  let previewSpy: ReturnType<typeof vi.fn>;
  let importSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    selectFiles = vi.fn().mockResolvedValue(['/tmp/a.ged', '/tmp/b.ged']);
    previewSpy = vi.fn(async ({ filePath }: { filePath: string }) => ({
      canceled: false, filePath, preview: preview(filePath.includes('a') ? 100 : 23),
    }));
    importSpy = vi.fn(async ({ filePath }: { filePath: string }) => ({
      success: true, report: report(filePath.includes('a') ? 100 : 23),
    }));
    (window as unknown as { api: unknown }).api = {
      gedcom: { selectFile: vi.fn(), selectFiles, preview: previewSpy, import: importSpy },
      db: { getSetting: vi.fn().mockResolvedValue(null), setSetting: vi.fn() },
      persons: { getNames: vi.fn().mockResolvedValue([]) },
    };
  });

  function mountSection() {
    return mount(GedcomImportSection, {
      global: {
        plugins: [i18n],
        stubs: {
          PersonPicker: true,
          BaseSubPanel: {
            props: ['title', 'saveLabel'],
            emits: ['save', 'cancel', 'close'],
            template: '<div class="sub-panel"><h4>{{ title }}</h4><slot /><button class="sp-save" @click="$emit(\'save\')">{{ saveLabel }}</button></div>',
          },
        },
      },
    });
  }

  async function pickAndProceed() {
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    await wrapper.find('.sp-save').trigger('click');
    await flushPromises();
    return wrapper;
  }

  it('previews every picked file before asking the user to proceed', async () => {
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(previewSpy).toHaveBeenCalledTimes(2);
    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'preview modal did not open').toBe(true);
    // The totals across both files, so the researcher confirms once.
    expect(panel.text()).toContain('123 persons');
  });

  it('names each picked file in the preview so the user can see what they chose', async () => {
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    const text = wrapper.find('.sub-panel').text();
    expect(text).toContain('a.ged');
    expect(text).toContain('b.ged');
  });

  it('imports both files from one confirmation', async () => {
    await pickAndProceed();
    expect(importSpy).toHaveBeenCalledTimes(2);
    expect(importSpy).toHaveBeenNthCalledWith(1, { filePath: '/tmp/a.ged' });
    expect(importSpy).toHaveBeenNthCalledWith(2, { filePath: '/tmp/b.ged' });
  });

  it('renders one combined report with the summed counts', async () => {
    const wrapper = await pickAndProceed();
    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'import report modal did not open').toBe(true);
    expect(panel.text()).toContain('123 persons');
    expect(panel.text()).toContain('246 sources');
  });

  it('names both files in the combined report', async () => {
    const wrapper = await pickAndProceed();
    const text = wrapper.find('.sub-panel').text();
    expect(text).toContain('a.ged');
    expect(text).toContain('b.ged');
  });

  it('a failure on the first file still imports the second and shows the error', async () => {
    importSpy.mockImplementation(async ({ filePath }: { filePath: string }) => {
      if (filePath.includes('a')) throw new Error('bad header');
      return { success: true, report: report(23) };
    });
    const wrapper = await pickAndProceed();
    expect(importSpy).toHaveBeenCalledTimes(2);
    const text = wrapper.find('.sub-panel').text();
    expect(text).toContain('bad header');
    // The good file still landed.
    expect(text).toContain('23 persons');
  });

  it('a file the importer rejects without throwing is reported too', async () => {
    importSpy.mockImplementation(async ({ filePath }: { filePath: string }) => {
      if (filePath.includes('a')) return { success: false, error: 'unsupported dialect' };
      return { success: true, report: report(23) };
    });
    const wrapper = await pickAndProceed();
    expect(wrapper.find('.sub-panel').text()).toContain('unsupported dialect');
  });

  it('picking nothing does nothing', async () => {
    selectFiles.mockResolvedValue([]);
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(previewSpy).not.toHaveBeenCalled();
    expect(wrapper.find('.sub-panel').exists()).toBe(false);
  });
});
