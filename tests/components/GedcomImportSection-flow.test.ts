import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GedcomImportSection from '../../src/renderer/components/import/GedcomImportSection.vue';
import { i18n } from './setup';

/**
 * The user-observable GEDCOM import flow: click Import, pick a file, see the
 * preview counts, click Import again, see the report.
 *
 * The mocked `window.api.gedcom.preview` / `.import` return the exact
 * envelopes the Tauri bindings in `src/renderer/tauri-window-api.ts` return.
 * Both sides drifted during the Tauri port — preview returned a bare
 * `ImportPreview` and import returned a bare report, so the component's
 * `if (result.preview)` / `if (result.success)` guards never fired and the
 * click produced no modal, no status line, and no console error. These tests
 * pin the flow the user walks, not the shape either side happens to use.
 */
describe('GedcomImportSection — pick → preview → import', () => {
  const PREVIEW = {
    personCount: 206,
    relationshipCount: 314,
    eventCount: 1313,
    sourceCount: 793,
    placeCount: 431,
    repositoryCount: 0,
    warnings: ['Unknown top-level tag: SUBN (1 occurrences)'],
    estimatedSize: 'large' as const,
  };
  const REPORT = {
    version: '5.5.1',
    persons: 206,
    families: 108,
    events: { birth: 190, death: 120 },
    sources: 793,
    places: 431,
    citations: 900,
    repositories: 0,
    groups: 0,
    researchTasks: 0,
    skipped: [],
    warnings: [],
  };

  let importSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    importSpy = vi.fn().mockResolvedValue({ success: true, report: REPORT });
    (window as unknown as { api: unknown }).api = {
      gedcom: {
        selectFile: vi.fn().mockResolvedValue({ canceled: false, path: '/tmp/tree.ged' }),
        preview: vi.fn().mockResolvedValue({
          canceled: false,
          filePath: '/tmp/tree.ged',
          preview: PREVIEW,
        }),
        import: importSpy,
      },
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
          // Passthrough so the modal body is assertable; keeps the save
          // button reachable as a plain click target.
          BaseSubPanel: {
            props: ['title', 'saveLabel'],
            emits: ['save', 'cancel', 'close'],
            template: '<div class="sub-panel"><h4>{{ title }}</h4><slot /><button class="sp-save" @click="$emit(\'save\')">{{ saveLabel }}</button></div>',
          },
        },
      },
    });
  }

  it('shows the preview counts after the file is picked', async () => {
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'preview modal did not open').toBe(true);
    expect(panel.text()).toContain('206 persons');
    expect(panel.text()).toContain('431 places');
  });

  it('shows the import report after proceeding', async () => {
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    await wrapper.find('.sp-save').trigger('click');
    await flushPromises();

    expect(importSpy).toHaveBeenCalledWith({ filePath: '/tmp/tree.ged' });
    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'import report modal did not open').toBe(true);
    expect(panel.text()).toContain('206');
    expect(wrapper.find('.status.error').exists(), 'reported an error on a successful import').toBe(false);
  });

  it('surfaces an error instead of failing silently when preview returns no preview', async () => {
    (window as unknown as { api: { gedcom: { preview: unknown } } }).api.gedcom.preview =
      vi.fn().mockResolvedValue({ success: false, error: 'boom' });
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('.sub-panel').exists()).toBe(false);
    expect(wrapper.find('.status.error').exists(), 'silent no-op: no modal and no error shown').toBe(true);
  });
});
