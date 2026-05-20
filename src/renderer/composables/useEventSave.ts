/**
 * useEventSave — save orchestration for EventModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 6) so that
 * EventModal.vue can shrink to a thin orchestrator. The composable wraps the
 * three-step save sequence the modal currently inlines at lines 764-916:
 *   1. Insert (events.create) or update (events.update) the event row.
 *   2. On insert: flush buffered pending citations via citations.create with
 *      the new event_id, then flush buffered pending participants via
 *      eventParticipants.add.
 *   3. Emit `saved` so the modal can close + the host view can refresh.
 *
 * Validation is enforced through the `canSave` computed passed in by the
 * caller — if it is false, `save()` is a no-op and `lastError` stays null
 * (the modal renders inline errors itself; nothing to surface as a toast).
 *
 * PRIME DIRECTIVE: `events.update` writes every authored field unconditionally
 * (cause, value, date_value_end) regardless of whether the current
 * event_type hides them in the UI. Hiding a field is not consent to discard
 * its value — see CLAUDE.md Prime Directive on Data Fidelity.
 *
 * Out-of-scope for this composable (still owned by EventModal directly):
 *   - syncBaptismCompanion + the marriage-modal name-change companion. These
 *     are EventModal-specific surfaces with their own state (baptismDate /
 *     godparents / nameChangeForm). They run in EventModal.handleSave after
 *     save() completes via the `onSaved` callback hook.
 *   - The relationship_id forwarding (the modal owns props.relationshipId
 *     and pipes it into the create payload through `extraCreateFields`).
 */
import { ref, type Ref, type ComputedRef } from 'vue';
import type { EventForm } from './useEventForm';
import type { PendingCitationPayload } from './useEventCitations';
import type { ParticipantRow } from './useEventParticipants';

export interface EventSaveResult {
  id: string;
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

export interface UseEventSaveOptions {
  form: EventForm;
  pendingCitations: Ref<PendingCitationPayload[]>;
  participants: Ref<ParticipantRow[]>;
  eventIdRef: Ref<string | null>;
  mode: 'create' | 'edit' | 'copy';
  canSave: ComputedRef<boolean>;
  emit: (name: 'saved' | 'cancel' | 'close', payload?: unknown) => void;
  // Optional extras the modal wants merged into the create payload (e.g.
  // relationship_id when hosted on a relationship panel).
  extraCreateFields?: () => Record<string, unknown>;
  // Optional hook the modal calls after the core save sequence completes but
  // before `saved` is emitted. Lets EventModal run its baptism/name-change
  // companions without bloating this composable's shape.
  onSaved?: (ev: EventSaveResult) => Promise<void> | void;
}

export interface UseEventSaveReturn {
  save: () => Promise<void>;
  saving: Ref<boolean>;
  lastError: Ref<string | null>;
}

declare const window: Window & {
  api?: {
    events?: {
      create?: (input: Record<string, unknown>) => Promise<EventSaveResult>;
      update?: (id: string, input: Record<string, unknown>) => Promise<EventSaveResult>;
    };
    citations?: {
      create?: (input: Record<string, unknown>) => Promise<{ id: string } | null>;
    };
    eventParticipants?: {
      add?: (input: {
        event_id: string;
        person_id: string;
        role: string;
      }) => Promise<{ id: string } | null>;
    };
  };
};

export function useEventSave(options: UseEventSaveOptions): UseEventSaveReturn {
  const saving = ref(false);
  const lastError = ref<string | null>(null);

  function buildPayload(): Record<string, unknown> {
    return {
      event_type: options.form.event_type,
      date_type: options.form.date_type,
      date_value: options.form.date_value || null,
      date_value_end: options.form.date_value_end || null,
      date_original: options.form.date_original,
      place_id: options.form.place_id,
      place_address: options.form.place_address || null,
      cause: options.form.cause || null,
      value: options.form.value || null,
      notes: options.form.notes || '',
    };
  }

  async function save(): Promise<void> {
    if (!options.canSave.value) return;
    if (saving.value) return;
    saving.value = true;
    lastError.value = null;
    try {
      const create = window.api?.events?.create;
      const update = window.api?.events?.update;
      const citationCreate = window.api?.citations?.create;
      const participantAdd = window.api?.eventParticipants?.add;

      let ev: EventSaveResult;
      const existingId = options.eventIdRef.value;
      if (existingId) {
        if (!update) throw new Error('events.update unavailable');
        ev = await update(existingId, buildPayload());
      } else {
        if (!create) throw new Error('events.create unavailable');
        const payload = { ...buildPayload(), ...(options.extraCreateFields?.() ?? {}) };
        ev = await create(payload);
        options.eventIdRef.value = ev.id;

        // Flush pending citations buffered while the event row didn't exist.
        if (citationCreate) {
          for (const pc of options.pendingCitations.value) {
            await citationCreate({
              source_id: pc.source_id,
              page: pc.page,
              confidence: pc.confidence,
              transcription: pc.transcription,
              notes: pc.notes,
              date_accessed: pc.date_accessed,
              event_id: ev.id,
            });
          }
          options.pendingCitations.value = [];
        }

        // Flush pending participants — only the rows with pending: ids,
        // which were buffered through useEventParticipants.addParticipant
        // before the event existed.
        if (participantAdd) {
          const stillPending: ParticipantRow[] = [];
          for (const p of options.participants.value) {
            if (!p.id.startsWith('pending:')) {
              stillPending.push(p);
              continue;
            }
            const added = await participantAdd({
              event_id: ev.id,
              person_id: p.person_id,
              role: p.role,
            });
            if (added?.id) {
              stillPending.push({ id: added.id, event_id: ev.id, person_id: p.person_id, role: p.role });
            }
          }
          options.participants.value = stillPending;
        }
      }

      if (options.onSaved) {
        await options.onSaved(ev);
      }

      options.emit('saved', ev);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError.value = message;
      console.error('[useEventSave] save failed:', err);
    } finally {
      saving.value = false;
    }
  }

  return { save, saving, lastError };
}
