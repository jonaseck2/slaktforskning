/**
 * Per-table resizable columns with localStorage persistence.
 *
 * The HTML data tables across the renderer (QualityView, Person/Place/Source
 * lists, search results, etc.) have historically used a flexible layout
 * where the browser distributes width by content. That works for short-cell
 * tables but produces sparse layouts on tables like Quality where one
 * column holds a small badge and another holds free-form messages — the
 * badge's column hogs space the message column needs, and long messages
 * truncate while there's whitespace right next to them.
 *
 * Surfaced 2026-05-09: "The quality table, it's very sparse and contains
 * a lot of unused space — can we allow changing the column width in tables
 * in general?" → yes, persisted per-table in localStorage.
 *
 * Usage in a Vue component:
 *
 *   const { widths, startResize } = useResizableColumns({
 *     tableId: 'quality-issues',  // unique per table — used as the storage key
 *     columns: [
 *       { key: 'severity', defaultWidth: 100, minWidth: 60 },
 *       { key: 'entity',   defaultWidth: 280, minWidth: 100 },
 *       { key: 'issue',    defaultWidth: 480, minWidth: 100 },
 *       { key: 'actions',  defaultWidth: 80,  minWidth: 50 },
 *     ],
 *   });
 *
 * Then in the template:
 *
 *   <table class="data-table table-resizable">
 *     <thead>
 *       <tr>
 *         <th :style="{ width: widths.severity + 'px' }">
 *           Severity
 *           <span class="col-resize-handle" @mousedown.prevent="startResize($event, 'severity')" />
 *         </th>
 *         <th :style="{ width: widths.entity + 'px' }">…</th>
 *         …
 *       </tr>
 *     </thead>
 *     …
 *   </table>
 *
 * The `.table-resizable` class on the parent table sets `table-layout: fixed`
 * so the inline widths are honored exactly. `.col-resize-handle` is the small
 * grab area on the right edge of each `<th>`.
 */
import { ref, onScopeDispose, type Ref } from 'vue';

const STORAGE_KEY_PREFIX = 'slaktforskning-table-cols-';

export interface ResizableColumn {
  /** Column identifier — used as the localStorage key for the column's width. */
  key: string;
  /** Width in pixels when no saved value is found. */
  defaultWidth: number;
  /** Optional lower bound. Defaults to 40 (~3 chars + handle). */
  minWidth?: number;
  /** Optional upper bound. Defaults to 1200 (~half a 4K screen). */
  maxWidth?: number;
}

export interface UseResizableColumnsOptions {
  /** Unique identifier — used as the localStorage key for this table. */
  tableId: string;
  /** Column definitions. Order doesn't matter; lookup is by key. */
  columns: readonly ResizableColumn[];
}

export interface UseResizableColumnsReturn {
  /** Reactive map of `{ columnKey → currentWidth }`. Bind via `:style`. */
  widths: Ref<Record<string, number>>;
  /** Mousedown handler for a `<span class="col-resize-handle">`. */
  startResize: (event: MouseEvent, columnKey: string) => void;
  /** Reset all columns to their default widths. */
  resetWidths: () => void;
}

export function useResizableColumns(opts: UseResizableColumnsOptions): UseResizableColumnsReturn {
  const storageKey = STORAGE_KEY_PREFIX + opts.tableId;
  const columnMap: Record<string, ResizableColumn> = {};
  for (const c of opts.columns) columnMap[c.key] = c;

  const initialWidths = (): Record<string, number> => {
    let saved: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw) as Record<string, number>;
    } catch { /* corrupt storage → fall back to defaults */ }
    const out: Record<string, number> = {};
    for (const c of opts.columns) {
      out[c.key] = saved[c.key] ?? c.defaultWidth;
    }
    return out;
  };

  const widths = ref<Record<string, number>>(initialWidths());

  function persist(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths.value));
    } catch { /* localStorage full → silently skip; the user will lose this preference but the table still works */ }
  }

  // Drag state. Window-scoped listeners (see .claude/rules/renderer.md
  // "Drag/mouse interactions") so the drag continues outside the original
  // element's bounding box. Body class disables pointer-events on the
  // table's other content so spurious hover/click events don't fire while
  // the user is mid-drag.
  let activeKey: string | null = null;
  let startX = 0;
  let startWidth = 0;

  function startResize(event: MouseEvent, columnKey: string): void {
    if (!columnMap[columnKey]) return;
    activeKey = columnKey;
    startX = event.clientX;
    startWidth = widths.value[columnKey] ?? columnMap[columnKey].defaultWidth;
    document.body.classList.add('col-resize-active');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onMove(event: MouseEvent): void {
    if (activeKey === null) return;
    const col = columnMap[activeKey];
    const delta = event.clientX - startX;
    const min = col.minWidth ?? 40;
    const max = col.maxWidth ?? 1200;
    const next = Math.max(min, Math.min(max, startWidth + delta));
    widths.value = { ...widths.value, [activeKey]: next };
  }

  function onUp(): void {
    if (activeKey === null) return;
    activeKey = null;
    document.body.classList.remove('col-resize-active');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    persist();
  }

  function resetWidths(): void {
    const out: Record<string, number> = {};
    for (const c of opts.columns) out[c.key] = c.defaultWidth;
    widths.value = out;
    persist();
  }

  // Cleanup on unmount: remove window listeners + body class if a drag was
  // mid-flight when the component went away. Keeps clearWindowListeners
  // pure (only removes listeners, doesn't touch reactive state) per the
  // renderer rule.
  onScopeDispose(() => {
    if (activeKey !== null) {
      document.body.classList.remove('col-resize-active');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      activeKey = null;
    }
  });

  return { widths, startResize, resetWidths };
}
