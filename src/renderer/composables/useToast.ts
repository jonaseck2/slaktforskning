// src/renderer/composables/useToast.ts
import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info' | 'warning';
}

let nextId = 1;
const toasts = reactive<Toast[]>([]);

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

  return {
    toasts,
    error: (message: string) => show(message, 'error', 5000),
    success: (message: string) => show(message, 'success', 3000),
    info: (message: string) => show(message, 'info', 4000),
    warning: (message: string) => show(message, 'warning', 5000),
    dismiss,
  };
}
