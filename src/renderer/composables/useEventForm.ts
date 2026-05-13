/**
 * useEventForm — form ref + dirty tracking + hydration for EventModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 2) so that
 * EventModal.vue can shrink to a thin orchestrator. The composable owns three
 * concerns: the reactive form shape, the dirty-vs-original snapshot, and the
 * hydration path for edit mode.
 *
 * Field shape mirrors `EventData` in EventModal.vue — same fields the modal's
 * v-models bind to and the same fields persisted by `events.create / update`.
 * Hidden conditional fields (cause, value, date_value_end) stay in the form
 * across event_type toggles per the Prime Directive on Data Fidelity — never
 * silently null an authored value because the UI hid the field.
 */
import { reactive, ref, watch } from 'vue';

export type EventFormMode = 'create' | 'edit' | 'copy';

export interface EventForm {
  id?: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  cause: string | null;
  value: string | null;
  notes: string;
}

export interface UseEventFormOptions {
  eventId: string | null;
  mode: EventFormMode;
  defaults?: Partial<EventForm>;
}

const EMPTY_FORM: EventForm = {
  event_type: '',
  date_type: 'exact',
  date_value: null,
  date_value_end: null,
  date_original: '',
  place_id: null,
  cause: null,
  value: null,
  notes: '',
};

// Window typing — composable is loaded by both the renderer (where window.api
// is real) and unit tests (where it's injected via a stub). Same shape used by
// the rest of the renderer codebase.
declare const window: Window & {
  api?: { events?: { get?: (id: string) => Promise<EventForm | null> } };
};

export function useEventForm(options: UseEventFormOptions) {
  const form = reactive<EventForm>({ ...EMPTY_FORM, ...options.defaults });
  const loading = ref(false);
  const isDirty = ref(false);
  // Snapshot taken either after defaults+overrides land (create/copy) or after
  // the existing event hydrates (edit). Dirty-tracking is suppressed until the
  // snapshot exists so hydration doesn't itself flag the form as dirty.
  const originalSnapshot = ref<string | null>(null);

  watch(
    form,
    () => {
      if (originalSnapshot.value === null) return;
      isDirty.value = JSON.stringify(form) !== originalSnapshot.value;
    },
    { deep: true },
  );

  if (options.mode === 'edit' && options.eventId) {
    loading.value = true;
    const fetcher = window.api?.events?.get;
    if (fetcher) {
      void Promise.resolve(fetcher(options.eventId))
        .then((existing) => {
          if (existing) Object.assign(form, existing);
          originalSnapshot.value = JSON.stringify(form);
        })
        .catch(() => {
          // Surface the snapshot anyway so dirty-tracking still works; the
          // calling modal is responsible for toast-on-load-failure.
          originalSnapshot.value = JSON.stringify(form);
        })
        .finally(() => {
          loading.value = false;
        });
    } else {
      originalSnapshot.value = JSON.stringify(form);
      loading.value = false;
    }
  } else {
    originalSnapshot.value = JSON.stringify(form);
  }

  return { form, loading, isDirty };
}
