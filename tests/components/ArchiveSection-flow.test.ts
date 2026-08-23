import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ArchiveSection from '../../src/renderer/components/import/ArchiveSection.vue';
import { i18n } from './setup';

/**
 * The user-observable archive (.zip) flows. The mocked `window.api.archive.*`
 * return exactly what the Tauri bindings in `src/renderer/tauri-window-api.ts`
 * return — flat `{ imported | exported, filePath, report }` on success and
 * `{ canceled: false, error }` on failure.
 *
 * The import handler read a nested `{ success, report: { imported, report } }`
 * envelope instead, so on success `inner.imported` was undefined and the whole
 * block — report modal, status line, and the `data-imported` event the rest of
 * the UI refreshes on — never ran. The export handler had no else branch, so
 * export failures produced nothing at all.
 */
describe('ArchiveSection — import and export flows', () => {
  const ARCHIVE_REPORT = {
    gedcomReport: {
      persons: 12,
      families: 4,
      events: { birth: 10, death: 6 },
      sources: 3,
      places: 7,
      citations: 9,
      warnings: [],
    },
    mediaImported: 5,
    mediaSkipped: ['missing.jpg'],
  };
  const EXPORT_REPORT = {
    mediaCount: 5,
    missingMedia: [],
    gedcomReport: { persons: 12, families: 4, events: 16, sources: 3, excluded: [] },
  };

  let importFn: ReturnType<typeof vi.fn>;
  let exportFn: ReturnType<typeof vi.fn>;
  let dataImported: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    importFn = vi.fn().mockResolvedValue({
      imported: true,
      filePath: '/tmp/tree.zip',
      report: ARCHIVE_REPORT,
    });
    exportFn = vi.fn().mockResolvedValue({
      exported: true,
      filePath: '/tmp/tree.zip',
      report: EXPORT_REPORT,
    });
    (window as unknown as { api: unknown }).api = {
      archive: { import: importFn, export: exportFn },
      export: { onProgress: vi.fn() },
      db: { getSetting: vi.fn().mockResolvedValue(null), setSetting: vi.fn() },
      persons: { getNames: vi.fn().mockResolvedValue([]) },
    };
    dataImported = vi.fn();
    window.addEventListener('data-imported', dataImported);
  });

  function mountSection() {
    return mount(ArchiveSection, {
      global: {
        plugins: [i18n],
        stubs: {
          PersonPicker: true,
          BaseSubPanel: {
            props: ['title'],
            emits: ['cancel', 'close'],
            template: '<div class="sub-panel"><h4>{{ title }}</h4><slot /></div>',
          },
        },
      },
    });
  }

  const exportBtn = (w: ReturnType<typeof mountSection>) => w.findAll('button')[0];
  const importBtn = (w: ReturnType<typeof mountSection>) => w.findAll('button')[1];

  it('shows the import report and fires data-imported on a successful import', async () => {
    const wrapper = mountSection();
    await importBtn(wrapper).trigger('click');
    await flushPromises();

    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'import report modal did not open').toBe(true);
    expect(panel.text()).toContain('12');
    expect(panel.text()).toContain('5 media files imported');
    expect(dataImported, 'data-imported never fired, so no view refreshes').toHaveBeenCalled();
    expect(wrapper.find('.status.error').exists()).toBe(false);
  });

  it('surfaces an error when the import fails', async () => {
    importFn.mockResolvedValue({ canceled: false, error: 'no DB open' });
    const wrapper = mountSection();
    await importBtn(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.find('.sub-panel').exists()).toBe(false);
    expect(wrapper.find('.status.error').exists(), 'import failure was silent').toBe(true);
  });

  it('stays quiet when the user cancels the import', async () => {
    importFn.mockResolvedValue({ canceled: true });
    const wrapper = mountSection();
    await importBtn(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.find('.sub-panel').exists()).toBe(false);
    expect(wrapper.find('.status').exists(), 'a cancel is not an error').toBe(false);
  });

  it('surfaces an error when the export fails', async () => {
    exportFn.mockResolvedValue({ canceled: false, error: 'disk full' });
    const wrapper = mountSection();
    await exportBtn(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.find('.status.error').exists(), 'export failure was silent').toBe(true);
  });

  it('stays quiet when the user cancels the export', async () => {
    exportFn.mockResolvedValue({ canceled: true });
    const wrapper = mountSection();
    await exportBtn(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.find('.status.error').exists(), 'a cancel is not an error').toBe(false);
  });
});
