/**
 * useEventCitations — citation list + add/remove/edit for EventModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 4) so that
 * EventModal.vue can shrink to a thin orchestrator. The composable owns three
 * concerns: the persisted citation list (loaded from
 * window.api.citations.forEvent), the pending-citation buffer used while
 * creating a brand-new event (no event_id yet), and the merged rows the modal
 * renders.
 *
 * Mirrors EventModal.vue lines 645-727:
 *   - `citations` reactive list of saved CitationRow (id + sourceTitle + page +
 *     confidence) sourced from citations.forEvent + sources.get per row.
 *   - `pendingCitations` reactive list of DeferredCitationPayload buffered
 *     before the event row exists; the modal flushes them through
 *     citations.create after events.create returns.
 *   - `allCitationRows` computed merge surface used by the modal's v-for.
 *   - `reload()` re-queries citations.forEvent and refreshes `citations`. The
 *     modal calls this after the inner CitationModal saves an edit or add.
 *   - `addPending(payload)` buffers a new pending citation with a deterministic
 *     `tempId` so the row can be edited or removed before the event saves.
 *   - `updatePending(tempId, payload)` replaces an existing buffered row in
 *     place (matches EventModal's `onPendingCitationSaved` for the edit path).
 *   - `removePending(tempId)` drops a buffered row.
 *   - `removeSaved(id)` deletes a saved citation row via citations.delete and
 *     refreshes the list. The modal's ConfirmModal cascade still wraps the
 *     call site — this is the unwrapped network call.
 *
 * PRIME DIRECTIVE: this composable never silently drops a buffered citation
 * on event_id change. Pending rows belong to the in-flight authoring session
 * and are only cleared by an explicit caller action (a successful flush in
 * useEventSave, an explicit `removePending`, or the modal closing).
 */
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';

export interface CitationRow {
  id: string;
  sourceTitle: string;
  page: string | null;
  confidence: number | null;
}

// Mirrors DeferredCitationPayload exported by CitationModal.vue. Duplicated
// here so the composable doesn't pull a Vue SFC into the unit-test graph.
export interface PendingCitationPayload {
  tempId?: string;
  source_id: string;
  sourceTitle: string;
  page: string | null;
  confidence: number | null;
  transcription: string;
  notes: string;
  date_accessed: string;
}

export interface MergedCitationRow {
  key: string;
  id: string;
  isPending: boolean;
  sourceTitle: string;
  page: string | null;
  confidence: number | null;
}

export interface UseEventCitationsReturn {
  citations: Ref<CitationRow[]>;
  pendingCitations: Ref<PendingCitationPayload[]>;
  allCitationRows: ComputedRef<MergedCitationRow[]>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
  addPending: (payload: Omit<PendingCitationPayload, 'tempId'>) => void;
  updatePending: (tempId: string, payload: PendingCitationPayload) => void;
  removePending: (tempId: string) => void;
  removeSaved: (id: string) => Promise<void>;
}

declare const window: Window & {
  api?: {
    citations?: {
      forEvent?: (
        id: string,
      ) => Promise<
        Array<{ id: string; source_id: string; page: string | null; confidence: number | null }>
      >;
      delete?: (id: string) => Promise<unknown>;
    };
    sources?: {
      get?: (id: string) => Promise<{ title: string } | null>;
    };
  };
};

export function useEventCitations(
  eventId: Ref<string | null> | string | null,
): UseEventCitationsReturn {
  const citations = ref<CitationRow[]>([]);
  const pendingCitations = ref<PendingCitationPayload[]>([]);
  const loading = ref(false);

  // Accept either a Ref or a plain value. EventModal currently keeps
  // `savedEventId` as a local ref that flips from null → uuid after the first
  // save, so passing the ref through preserves reactivity. Tests pass a plain
  // string for simpler ergonomics.
  function currentId(): string | null {
    if (eventId === null) return null;
    if (typeof eventId === 'string') return eventId;
    return eventId.value;
  }

  async function reload(): Promise<void> {
    const id = currentId();
    if (!id) {
      citations.value = [];
      return;
    }
    const forEvent = window.api?.citations?.forEvent;
    const sourceGet = window.api?.sources?.get;
    if (!forEvent) return;
    loading.value = true;
    try {
      const raw = await forEvent(id);
      const rows: CitationRow[] = [];
      for (const c of raw) {
        let title = c.source_id;
        if (sourceGet) {
          try {
            const src = await sourceGet(c.source_id);
            if (src?.title) title = src.title;
          } catch {
            /* keep fallback */
          }
        }
        rows.push({
          id: c.id,
          sourceTitle: title,
          page: c.page,
          confidence: c.confidence,
        });
      }
      citations.value = rows;
    } catch {
      // Surface nothing — modal owns toast on user-facing errors. Keep the
      // existing list untouched so a transient blip doesn't blank the table.
    } finally {
      loading.value = false;
    }
  }

  // Kick off the initial load. If eventId is a ref, also re-fetch on change.
  if (typeof eventId === 'object' && eventId !== null) {
    watch(eventId, () => {
      void reload();
    });
  }
  // Fire the first load — non-awaiting so the composable returns synchronously.
  if (currentId()) {
    void reload();
  }

  const allCitationRows = computed<MergedCitationRow[]>(() => {
    const saved = citations.value.map((c): MergedCitationRow => ({
      key: 'saved:' + c.id,
      id: c.id,
      isPending: false,
      sourceTitle: c.sourceTitle,
      page: c.page,
      confidence: c.confidence,
    }));
    const pending = pendingCitations.value.map((c): MergedCitationRow => ({
      key: 'pending:' + (c.tempId ?? ''),
      id: c.tempId ?? '',
      isPending: true,
      sourceTitle: c.sourceTitle,
      page: c.page,
      confidence: c.confidence,
    }));
    return [...saved, ...pending];
  });

  function addPending(payload: Omit<PendingCitationPayload, 'tempId'>): void {
    pendingCitations.value.push({
      ...payload,
      tempId: 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    });
  }

  function updatePending(tempId: string, payload: PendingCitationPayload): void {
    const i = pendingCitations.value.findIndex((c) => c.tempId === tempId);
    if (i >= 0) {
      pendingCitations.value.splice(i, 1, { ...payload, tempId });
    }
  }

  function removePending(tempId: string): void {
    const i = pendingCitations.value.findIndex((c) => c.tempId === tempId);
    if (i >= 0) pendingCitations.value.splice(i, 1);
  }

  async function removeSaved(id: string): Promise<void> {
    const del = window.api?.citations?.delete;
    if (!del) return;
    await del(id);
    await reload();
  }

  return {
    citations,
    pendingCitations,
    allCitationRows,
    loading,
    reload,
    addPending,
    updatePending,
    removePending,
    removeSaved,
  };
}
