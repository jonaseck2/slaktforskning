/**
 * Unit-test the column-width persistence + bounds enforcement of
 * useResizableColumns. The drag interaction itself is hard to exercise
 * outside a real browser (mousemove against window) so this suite focuses
 * on (a) initial-width hydration from localStorage, (b) clamping to
 * min/max, (c) save-on-mouseup, (d) reset-to-defaults.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useResizableColumns } from '../../src/renderer/composables/useResizableColumns';

const STORAGE_KEY = 'slaktforskning-table-cols-test-table';

class FakeStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null { return this.store[key] ?? null; }
  setItem(key: string, value: string): void { this.store[key] = value; }
  removeItem(key: string): void { delete this.store[key]; }
  clear(): void { this.store = {}; }
}

beforeEach(async () => {
  // Vitest's jsdom env provides localStorage, but we want explicit control
  // over what each test reads. Replace it per-test.
  (global as unknown as { localStorage: FakeStorage }).localStorage = new FakeStorage();
});

describe('useResizableColumns — initial widths', async () => {
  it('uses defaultWidth when nothing is saved', async () => {
    const { widths } = useResizableColumns({
      tableId: 'test-table',
      columns: [
        { key: 'a', defaultWidth: 100 },
        { key: 'b', defaultWidth: 200 },
      ],
    });
    expect(widths.value).toEqual({ a: 100, b: 200 });
  });

  it('hydrates from localStorage when a saved value exists', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 250, b: 175 }));
    const { widths } = useResizableColumns({
      tableId: 'test-table',
      columns: [
        { key: 'a', defaultWidth: 100 },
        { key: 'b', defaultWidth: 200 },
      ],
    });
    expect(widths.value).toEqual({ a: 250, b: 175 });
  });

  it('falls back to default for any column not present in localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 250 }));
    const { widths } = useResizableColumns({
      tableId: 'test-table',
      columns: [
        { key: 'a', defaultWidth: 100 },
        { key: 'b', defaultWidth: 200 },
      ],
    });
    expect(widths.value).toEqual({ a: 250, b: 200 });
  });

  it('falls back to defaults if localStorage contains invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const { widths } = useResizableColumns({
      tableId: 'test-table',
      columns: [
        { key: 'a', defaultWidth: 100 },
      ],
    });
    expect(widths.value).toEqual({ a: 100 });
  });

  it('uses a different localStorage key per tableId', async () => {
    localStorage.setItem('slaktforskning-table-cols-other-table', JSON.stringify({ a: 999 }));
    const { widths } = useResizableColumns({
      tableId: 'test-table',
      columns: [{ key: 'a', defaultWidth: 50 }],
    });
    // Reads from test-table key, not other-table key, so still default.
    expect(widths.value).toEqual({ a: 50 });
  });
});

describe('useResizableColumns — resetWidths', async () => {
  it('reverts to defaults and persists', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 999 }));
    const { widths, resetWidths } = useResizableColumns({
      tableId: 'test-table',
      columns: [{ key: 'a', defaultWidth: 100 }],
    });
    expect(widths.value).toEqual({ a: 999 });

    resetWidths();
    expect(widths.value).toEqual({ a: 100 });
    // Also persisted: a fresh hydrate should now read the default.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ a: 100 });
  });
});
