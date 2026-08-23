import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GedcomExportSection from '../../src/renderer/components/import/GedcomExportSection.vue';
import DatabaseView from '../../src/renderer/views/DatabaseView.vue';
import { i18n } from './setup';

/**
 * Bindings in `src/renderer/tauri-window-api.ts` signal failure with a return
 * value, not a rejection: `{ canceled: false, error }` or
 * `{ success: false, error }`. A consumer that guards only the success field
 * and omits the else branch therefore swallows every failure — no status line,
 * no console entry, no toast. The user sees a button that did nothing.
 *
 * A user-cancel must stay quiet; only a real failure speaks. These tests pin
 * both halves.
 */
describe('GedcomExportSection — failure is visible, cancel is quiet', () => {
  let exportFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    exportFn = vi.fn();
    (window as unknown as { api: unknown }).api = {
      gedcom: { export: exportFn },
      export: { onProgress: vi.fn() },
    };
  });

  function mountSection() {
    return mount(GedcomExportSection, {
      global: {
        plugins: [i18n],
        stubs: { ExportOptionsPanel: true, BaseSubPanel: true },
      },
    });
  }

  it('shows an error when the export fails', async () => {
    exportFn.mockResolvedValue({ canceled: false, error: 'disk full' });
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('.status.error').exists(), 'export failure was silent').toBe(true);
  });

  it('stays quiet when the user cancels', async () => {
    exportFn.mockResolvedValue({ canceled: true });
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('.status.error').exists(), 'a cancel is not an error').toBe(false);
  });

  it('reports success without an error line', async () => {
    exportFn.mockResolvedValue({
      exported: true,
      filePath: '/tmp/tree.ged',
      report: { persons: 3, families: 1, events: 4, sources: 0, excluded: [] },
    });
    const wrapper = mountSection();
    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('.status.error').exists()).toBe(false);
    expect(wrapper.find('.status').exists()).toBe(true);
  });
});

describe('DatabaseView — backup and restore failures are visible', () => {
  let backupFn: ReturnType<typeof vi.fn>;
  let restoreFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    backupFn = vi.fn();
    restoreFn = vi.fn();
    (window as unknown as { api: unknown }).api = {
      backup: { backup: backupFn, restore: restoreFn },
      db: {
        getRecent: vi.fn().mockResolvedValue([]),
        getCurrent: vi.fn().mockResolvedValue(null),
        getSetting: vi.fn().mockResolvedValue(null),
        setSetting: vi.fn(),
      },
      persons: { getNames: vi.fn().mockResolvedValue([]) },
    };
    // restore() is behind a native confirm().
    vi.stubGlobal('confirm', () => true);
  });

  function mountView() {
    return mount(DatabaseView, {
      global: { plugins: [i18n], stubs: { PersonPicker: true } },
    });
  }

  const btn = (w: ReturnType<typeof mountView>, label: string) =>
    w.findAll('button').find(b => b.text().includes(label))!;

  it('shows an error when the backup fails', async () => {
    backupFn.mockResolvedValue({ success: false, error: 'disk full' });
    const wrapper = mountView();
    await flushPromises();
    await btn(wrapper, 'Backup').trigger('click');
    await flushPromises();

    expect(wrapper.find('.db-status.is-error').exists(), 'backup failure was silent').toBe(true);
  });

  it('stays quiet when the user cancels the backup dialog', async () => {
    backupFn.mockResolvedValue({ canceled: true, success: false, error: 'Cancelled' });
    const wrapper = mountView();
    await flushPromises();
    await btn(wrapper, 'Backup').trigger('click');
    await flushPromises();

    expect(wrapper.find('.db-status').exists(), 'a cancel is not an error').toBe(false);
  });

  it('shows an error when the restore fails', async () => {
    restoreFn.mockResolvedValue({ success: false, error: 'not a database file' });
    const wrapper = mountView();
    await flushPromises();
    await btn(wrapper, 'Restore').trigger('click');
    await flushPromises();

    expect(wrapper.find('.db-status.is-error').exists(), 'restore failure was silent').toBe(true);
  });

  it('stays quiet when the user cancels the restore dialog', async () => {
    restoreFn.mockResolvedValue({ canceled: true, success: false, error: 'Cancelled' });
    const wrapper = mountView();
    await flushPromises();
    await btn(wrapper, 'Restore').trigger('click');
    await flushPromises();

    expect(wrapper.find('.db-status').exists(), 'a cancel is not an error').toBe(false);
  });
});
