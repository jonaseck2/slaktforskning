import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GedcomExportSection from '../../src/renderer/components/import/GedcomExportSection.vue';
import { i18n } from './setup';

// Verifies the user-observable half of the export-progress feature: when an
// export progress message arrives over the `window.api.export.onProgress`
// fan-out channel (mirroring the import-progress mechanism), the running
// status line renders in the export UI; when the export completes (empty
// string), the line clears.
describe('GedcomExportSection — export progress display', () => {
  let progressCallback: ((msg: string) => void) | null = null;

  beforeEach(() => {
    progressCallback = null;
    (window as unknown as { api: unknown }).api = {
      export: {
        // Capture the subscriber the component registers on mount so the test
        // can drive it the way the export bindings drive it at runtime.
        onProgress: (cb: (msg: string) => void) => { progressCallback = cb; },
      },
      gedcom: {
        export: vi.fn().mockResolvedValue({ exported: false, canceled: true }),
      },
    };
  });

  function mountSection() {
    return mount(GedcomExportSection, {
      global: {
        plugins: [i18n],
        // ExportOptionsPanel / BaseSubPanel pull in unrelated deps; stub them.
        stubs: { ExportOptionsPanel: true, BaseSubPanel: true },
      },
    });
  }

  it('subscribes to export progress on mount', () => {
    mountSection();
    expect(progressCallback).toBeTypeOf('function');
  });

  it('renders the progress line when a message arrives', async () => {
    const wrapper = mountSection();
    expect(wrapper.find('.section-progress').exists()).toBe(false);

    progressCallback!('Exported 500 / 22000 persons');
    await flushPromises();

    const line = wrapper.find('.section-progress');
    expect(line.exists()).toBe(true);
    expect(line.text()).toBe('Exported 500 / 22000 persons');
  });

  it('clears the progress line on the empty-string done signal', async () => {
    const wrapper = mountSection();

    progressCallback!('Exporting families…');
    await flushPromises();
    expect(wrapper.find('.section-progress').exists()).toBe(true);

    progressCallback!('');
    await flushPromises();
    expect(wrapper.find('.section-progress').exists()).toBe(false);
  });
});
