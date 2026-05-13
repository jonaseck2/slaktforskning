/**
 * useEventParticipants — participant list + role helpers for EventModal.
 *
 * Extracted in plan 2026-05-14-modal-composable-extraction (Task 5) so that
 * EventModal.vue can shrink to a thin orchestrator. The composable owns:
 *   - the persisted participant rows for the event (loaded from
 *     window.api.eventParticipants.getForEvent),
 *   - the primary-participant invariant on a new event — when the modal is
 *     hosted on a person panel and the event isn't saved yet, the panel-owner
 *     is auto-included so the UI consistently shows "who this event is about"
 *     before save,
 *   - `addParticipant`, `removeParticipant`, `setRole` helpers that mutate the
 *     persisted-OR-pending list and (where the event row exists) round-trip
 *     through the eventParticipants.* api so the DB stays in sync.
 *
 * Mirrors EventModal.vue lines 408-437 + the save-time participant logic at
 * lines 795-852. The pre-save primary row is rendered with a synthetic id
 * starting with `pending:`; useEventSave will replace it with the real row id
 * after eventParticipants.add returns post-event-create.
 *
 * PRIME DIRECTIVE: the panel-owning person flows in as the primary by default
 * and never disappears between states (Surface contract rule #4 — no silent
 * degradation across state). If the caller passes a null primaryPersonId, no
 * primary is seeded — the event is hosted on a relationship, not a person.
 */
import { ref, watch, type Ref } from 'vue';

export interface ParticipantRow {
  id: string;
  event_id: string | null;
  person_id: string;
  role: string;
}

export interface UseEventParticipantsReturn {
  participants: Ref<ParticipantRow[]>;
  primaryPersonId: Ref<string | null>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
  addParticipant: (person_id: string, role: string) => Promise<void>;
  removeParticipant: (id: string) => Promise<void>;
  setRole: (id: string, role: string) => void;
}

declare const window: Window & {
  api?: {
    eventParticipants?: {
      getForEvent?: (
        eventId: string,
      ) => Promise<Array<{ id: string; event_id: string; person_id: string; role: string }>>;
      add?: (input: {
        event_id: string;
        person_id: string;
        role: string;
      }) => Promise<{ id: string } | null>;
      remove?: (id: string) => Promise<unknown>;
    };
  };
};

function pendingId(seed: string): string {
  return (
    'pending:' + seed + ':' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  );
}

export function useEventParticipants(
  eventId: Ref<string | null> | string | null,
  primaryPerson: string | null,
): UseEventParticipantsReturn {
  const participants = ref<ParticipantRow[]>([]);
  const primaryPersonId = ref<string | null>(primaryPerson);
  const loading = ref(false);

  function currentId(): string | null {
    if (eventId === null) return null;
    if (typeof eventId === 'string') return eventId;
    return eventId.value;
  }

  function seedPrimary(): void {
    if (!primaryPersonId.value) return;
    const hasPrimary = participants.value.some(
      (p) => p.role === 'primary' && p.person_id === primaryPersonId.value,
    );
    if (hasPrimary) return;
    participants.value.push({
      id: pendingId('primary'),
      event_id: null,
      person_id: primaryPersonId.value,
      role: 'primary',
    });
  }

  async function reload(): Promise<void> {
    const id = currentId();
    if (!id) {
      // No saved event yet — show only the auto-seeded primary (if any).
      participants.value = [];
      seedPrimary();
      return;
    }
    const fetcher = window.api?.eventParticipants?.getForEvent;
    if (!fetcher) {
      participants.value = [];
      seedPrimary();
      return;
    }
    loading.value = true;
    try {
      const rows = await fetcher(id);
      participants.value = rows.map((r) => ({
        id: r.id,
        event_id: r.event_id,
        person_id: r.person_id,
        role: r.role,
      }));
      // Existing events: the persisted rows ARE the truth. Don't auto-seed —
      // the primary is whatever the DB says it is (which may have been
      // edited from another surface).
    } catch {
      // Keep the existing list untouched on transient failures.
    } finally {
      loading.value = false;
    }
  }

  // Wire up reactive reload when eventId is a ref.
  if (typeof eventId === 'object' && eventId !== null) {
    watch(eventId, () => {
      void reload();
    });
  }
  // Kick off initial load.
  void reload();

  async function addParticipant(person_id: string, role: string): Promise<void> {
    const id = currentId();
    if (id) {
      const adder = window.api?.eventParticipants?.add;
      if (!adder) return;
      const added = await adder({ event_id: id, person_id, role });
      if (added?.id) {
        participants.value.push({
          id: added.id,
          event_id: id,
          person_id,
          role,
        });
      }
    } else {
      // Buffer for the post-save flush in useEventSave.
      participants.value.push({
        id: pendingId(role),
        event_id: null,
        person_id,
        role,
      });
    }
  }

  async function removeParticipant(id: string): Promise<void> {
    const idx = participants.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    if (!id.startsWith('pending:')) {
      const remover = window.api?.eventParticipants?.remove;
      if (remover) {
        try {
          await remover(id);
        } catch {
          return;
        }
      }
    }
    participants.value.splice(idx, 1);
  }

  function setRole(id: string, role: string): void {
    const row = participants.value.find((p) => p.id === id);
    if (row) row.role = role;
  }

  return {
    participants,
    primaryPersonId,
    loading,
    reload,
    addParticipant,
    removeParticipant,
    setRole,
  };
}
