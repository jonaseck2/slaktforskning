import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GedcomImportSection from '../../src/renderer/components/import/GedcomImportSection.vue';
import { i18n } from './setup';

/**
 * The user-observable half of Prime Directive (cont.) clause 1: after an import,
 * the researcher can SEE which tags the app did not read.
 *
 * Before tag accounting, the report showed only `skipped` — unrecognised level-1
 * INDI/FAM tags. On the four ArkivDigital files that was 143 of 40000+ discarded
 * occurrences. A report the user cannot act on is the same as no report.
 */
describe('GedcomImportSection — unaccounted-for tags in the report', () => {
  const PREVIEW = {
    personCount: 1, relationshipCount: 0, eventCount: 1, sourceCount: 1,
    placeCount: 1, repositoryCount: 0, warnings: [], estimatedSize: 'small' as const,
  };
  const baseReport = {
    version: '5.5.1', persons: 1, families: 0, events: { birth: 1 },
    sources: 1, places: 1, citations: 1, repositories: 0, groups: 0,
    researchTasks: 0, skipped: [], warnings: [],
  };

  function setupApi(report: unknown): void {
    (window as unknown as { api: unknown }).api = {
      gedcom: {
        selectFile: vi.fn().mockResolvedValue({ canceled: false, path: '/tmp/ad.ged' }),
        preview: vi.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/ad.ged', preview: PREVIEW }),
        import: vi.fn().mockResolvedValue({ success: true, report }),
      },
      db: { getSetting: vi.fn().mockResolvedValue(null), setSetting: vi.fn() },
      persons: { getNames: vi.fn().mockResolvedValue([]) },
    };
  }

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

  async function importAndReadPanel(report: unknown): Promise<string> {
    setupApi(report);
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    await wrapper.find('.sp-save').trigger('click');
    await flushPromises();
    const panel = wrapper.find('.sub-panel');
    expect(panel.exists(), 'import report modal did not open').toBe(true);
    return panel.text();
  }

  beforeEach(() => { setupApi(baseReport); });

  it('lists each unaccounted-for tag path with its count', async () => {
    const text = await importAndReadPanel({
      ...baseReport,
      unaccountedFor: [
        { path: 'INDI.RESI.SOUR._AID', count: 4761 },
        { path: 'INDI.BIRT.PLAC._ADPL._PARISH', count: 589 },
        { path: 'INDI.BIRT._DESC', count: 25 },
      ],
    });
    expect(text).toContain('INDI.RESI.SOUR._AID: 4761');
    expect(text).toContain('INDI.BIRT.PLAC._ADPL._PARISH: 589');
    expect(text).toContain('INDI.BIRT._DESC: 25');
  });

  it('tells the user their file is unchanged, so the list does not read as damage', async () => {
    const text = await importAndReadPanel({
      ...baseReport,
      unaccountedFor: [{ path: 'SOUR._AID', count: 2722 }],
    });
    expect(text).toContain(i18n.global.t('importExport.importReportUnaccounted'));
    expect(text).toContain(i18n.global.t('importExport.importReportUnaccountedHint'));
  });

  it('shows no section when the importer read everything', async () => {
    const text = await importAndReadPanel({ ...baseReport, unaccountedFor: [] });
    expect(text).not.toContain(i18n.global.t('importExport.importReportUnaccounted'));
  });

  it('survives a report from an older build that has no unaccountedFor field', async () => {
    const text = await importAndReadPanel(baseReport);
    expect(text).not.toContain(i18n.global.t('importExport.importReportUnaccounted'));
  });
});
