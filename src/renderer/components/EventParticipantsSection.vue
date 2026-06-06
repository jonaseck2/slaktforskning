<template>
  <!-- Plan: 2026-05-04-event-participants-and-marriage-flow Part A.2.
       User goal: same affordance regardless of event type — every event
       (baptism, funeral, wedding, …) gets the same Deltagare section so
       godparents / mourners / witnesses can be recorded uniformly. -->
  <div class="ep-sec-header" data-entity="person">
    <div class="ep-sec-left">
      <span class="ep-sec-title">👥 {{ label ?? $t('events.participants') }}</span>
      <span class="ep-sec-count">{{ extraParticipants.length }}</span>
    </div>
  </div>
  <div class="ep-sec-content">
    <p v-if="!eventId" class="ep-participants-hint">
      {{ $t('events.participantsSaveFirstHint') }}
    </p>
    <template v-else>
      <SectionEmpty
        v-if="extraParticipants.length === 0"
        purpose-key="onboarding.empty.eventParticipants.purpose"
        secondary-hint-key="onboarding.empty.eventParticipants.hint"
      />
      <div
        v-for="row in extraParticipants"
        :key="row.id"
        class="ep-entity-row"
      >
        <div class="ep-entity-main">
          <div class="ep-entity-name">
            <PersonName
              :given-name="row.given_name"
              :surname="row.surname"
              :preferred-name="row.preferred_name"
              :nickname="row.nickname"
              :birth-surname="row.birth_surname"
              :show-birth-name-parenthetical="personNameOptions.showBirthNameParenthetical"
            />
          </div>
        </div>
        <select
          class="ep-participant-role"
          :value="row.role"
          :aria-label="$t('events.participantRoleLabel')"
          @change="onRoleChange(row.id, ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="r in EVENT_PARTICIPANT_ROLE_VALUES"
            :key="r"
            :value="r"
          >{{ $t('eventParticipantRoles.' + r) }}</option>
        </select>
        <button
          type="button"
          class="btn-sm btn-delete"
          style="flex-shrink:0"
          :aria-label="$t('events.participantsRemove')"
          :title="$t('events.participantsRemove')"
          @click="onRemove(row.id)"
        ><IconTrash :size="14" /></button>
      </div>
      <div class="ep-participants-add">
        <PersonPicker
          v-model="pickedId"
          :placeholder="$t('events.participantsAddPlaceholder')"
          @update:modelValue="onPicked"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonName from './PersonName.vue';
import PersonPicker from './PersonPicker.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import IconTrash from './ui/IconTrash.vue';
import { useEntityData } from '../composables/useEntityData';
import { useToast } from '../composables/useToast';
import { usePersonNameOptions } from '../stores/personNameOptions';
import { pickDisplayedName, pickBirthSurnameForDisplay } from '../utils/nameUtils';
import { EVENT_PARTICIPANT_ROLE_VALUES } from '../constants/eventTypes';

interface EventParticipantRow {
  id: string;
  event_id: string;
  person_id: string;
  role: string;
}

interface ParticipantWithName {
  id: string;
  person_id: string;
  role: string;
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  birth_surname: string | null;
}

declare const window: Window & {
  api?: {
    eventParticipants?: {
      getForEvent: (eventId: string) => Promise<EventParticipantRow[]>;
      add: (input: { event_id: string; person_id: string; role: string }) => Promise<{ id: string } | null>;
      update: (id: string, data: { role: string }) => Promise<EventParticipantRow | null>;
      remove: (id: string) => Promise<boolean>;
    };
    persons?: {
      getNames: (id: string) => Promise<Array<{
        id: string;
        given_name: string | null;
        surname: string | null;
        preferred_name: string | null;
        nickname: string | null;
        sort_order: number;
        name_type: string;
        date_from?: string | null;
      }>>;
    };
    events?: {
      forPerson: (id: string) => Promise<Array<{ event_type: string; date_value: string | null }>>;
    };
  };
};

const props = defineProps<{
  eventId: string | null;
  excludePersonIds: string[];
  label?: string;
}>();

const { t } = useI18n();
const toast = useToast();
const personNameOptions = usePersonNameOptions();

const pickedId = ref<string | null>(null);

// Self-loading via useEntityData — auto-subscribes to onDataChanged so the
// list refreshes after eventParticipants:add / remove (both flagged
// mutating: true in the IPC channel registry).
const { data: rawParticipants } = useEntityData<EventParticipantRow[]>(
  toRef(props, 'eventId'),
  async (eventId) => {
    if (!eventId || !window.api?.eventParticipants) return [];
    return await window.api.eventParticipants.getForEvent(eventId);
  },
);

// Cache of resolved name rows keyed by participant.id. Recomputed whenever
// the participants list changes.
const participantsWithNames = ref<ParticipantWithName[]>([]);

async function resolveNames(rows: EventParticipantRow[]): Promise<ParticipantWithName[]> {
  if (!window.api?.persons || !window.api?.events) return [];
  const out: ParticipantWithName[] = [];
  for (const r of rows) {
    try {
      const [names, events] = await Promise.all([
        window.api.persons.getNames(r.person_id),
        window.api.events.forPerson(r.person_id),
      ]);
      const picked = pickDisplayedName(names, events) ?? {
        id: null, given_name: null, surname: null, preferred_name: null, nickname: null,
      };
      const birthSurname = pickBirthSurnameForDisplay(
        picked as { id?: string | null; surname?: string | null },
        names as Parameters<typeof pickBirthSurnameForDisplay>[1],
      );
      out.push({
        id: r.id,
        person_id: r.person_id,
        role: r.role,
        given_name: picked.given_name,
        surname: picked.surname,
        preferred_name: picked.preferred_name,
        nickname: picked.nickname,
        birth_surname: birthSurname,
      });
    } catch {
      out.push({
        id: r.id, person_id: r.person_id, role: r.role,
        given_name: null, surname: null, preferred_name: null, nickname: null, birth_surname: null,
      });
    }
  }
  return out;
}

// Watch the loaded participant rows (filtered to exclude primary/spouse) and
// resolve display names. The async resolution lives in a watcher rather than
// a computed so the template stays synchronous.
//
// Local generation guard: useEntityData race-guards the rawParticipants fetch,
// but this watcher runs its own async (resolveNames) on top. Quick add/remove
// or excludePersonIds churn could otherwise let an earlier resolution land
// after a later one, briefly resurrecting a removed row or hiding a fresh
// add. Mirror useEntityData's gen-counter pattern: capture gen before the
// await, drop the result if a newer invocation has already started.
let nameResolveGen = 0;
watch(
  () => ({ rows: rawParticipants.value, excludes: props.excludePersonIds }),
  async ({ rows, excludes }) => {
    const gen = ++nameResolveGen;
    if (!rows) {
      if (gen !== nameResolveGen) return;
      participantsWithNames.value = [];
      return;
    }
    const filtered = rows.filter((r) => !excludes.includes(r.person_id));
    const resolved = await resolveNames(filtered);
    if (gen !== nameResolveGen) return;
    participantsWithNames.value = resolved;
  },
  { immediate: true, deep: true },
);

const extraParticipants = computed(() => participantsWithNames.value);

// Person IDs already represented (primary, spouse, additional participants)
// so the picker doesn't suggest someone who is already on this event.
const pickerExcludeIds = computed(() => {
  const ids = new Set<string>(props.excludePersonIds);
  for (const p of extraParticipants.value) ids.add(p.person_id);
  return ids;
});

async function onPicked(id: string | null) {
  if (!id) return;
  // Reset the picker immediately — UX expectation is "pick → added, picker
  // clears so I can pick the next one".
  pickedId.value = null;
  if (!props.eventId || !window.api?.eventParticipants) return;
  // Defensive: don't double-add if the picked person is already on this
  // event (or is the primary/spouse). Surface contract Check #4: filtering
  // the picker should already prevent this, but the picker doesn't take an
  // exclude prop, so we re-check at the add boundary.
  if (pickerExcludeIds.value.has(id)) {
    toast.info(t('events.participantsAlreadyAdded'));
    return;
  }
  try {
    await window.api.eventParticipants.add({
      event_id: props.eventId,
      person_id: id,
      role: 'other',
    });
    // List refresh is automatic via useEntityData → onDataChanged.
  } catch (err) {
    console.error('[EventParticipantsSection] add failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function onRoleChange(participantId: string, newRole: string) {
  if (!window.api?.eventParticipants) return;
  try {
    await window.api.eventParticipants.update(participantId, { role: newRole });
    // List refresh is automatic via useEntityData → onDataChanged.
  } catch (err) {
    console.error('[EventParticipantsSection] role update failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function onRemove(participantId: string) {
  if (!window.api?.eventParticipants) return;
  try {
    await window.api.eventParticipants.remove(participantId);
    // List refresh is automatic via useEntityData → onDataChanged.
  } catch (err) {
    console.error('[EventParticipantsSection] remove failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}
</script>

<style scoped>
.ep-participants-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin: 0 0 var(--space-xs) 0;
  line-height: 1.4;
  font-style: italic;
}
.ep-participants-add {
  margin-top: var(--space-xs);
}
.ep-participant-role {
  flex-shrink: 0;
  font-size: var(--font-xs);
  padding: 2px 4px;
  margin-right: var(--space-xs);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
}
</style>
