// src/renderer/composables/useToast.ts
import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info' | 'warning';
}

/**
 * A sticky, updateable toast with an optional progress bar. Keyed by a
 * caller-supplied stable `id` (e.g. `'import-holger'`) so successive calls
 * during one operation update the same toast in-place rather than stacking.
 * Use for long-running operations (imports, exports, big computations)
 * where the user needs to see "is anything happening?".
 *
 * Set `current` + `total` to render a determinate progress bar; omit them
 * for an indeterminate animated bar that just signals activity.
 */
export interface ProgressToast {
  id: string;
  message: string;
  current?: number;
  total?: number;
}

let nextId = 1;
const toasts = reactive<Toast[]>([]);
const progressToasts = reactive<ProgressToast[]>([]);

export function useToast() {
  function show(message: string, type: Toast['type'] = 'info', durationMs = 4000) {
    const id = nextId++;
    toasts.push({ id, message, type });
    setTimeout(() => dismiss(id), durationMs);
  }

  function dismiss(id: number) {
    const i = toasts.findIndex((t) => t.id === id);
    if (i !== -1) toasts.splice(i, 1);
  }

  function progress(id: string, message: string, current?: number, total?: number) {
    const existing = progressToasts.find((p) => p.id === id);
    if (existing) {
      existing.message = message;
      existing.current = current;
      existing.total = total;
    } else {
      progressToasts.push({ id, message, current, total });
    }
  }

  function dismissProgress(id: string) {
    const i = progressToasts.findIndex((p) => p.id === id);
    if (i !== -1) progressToasts.splice(i, 1);
  }

  return {
    toasts,
    progressToasts,
    error: (message: string) => show(message, 'error', 5000),
    success: (message: string) => show(message, 'success', 3000),
    info: (message: string) => show(message, 'info', 4000),
    warning: (message: string) => show(message, 'warning', 5000),
    dismiss,
    progress,
    dismissProgress,
  };
}
