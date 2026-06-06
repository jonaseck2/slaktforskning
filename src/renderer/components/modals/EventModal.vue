<template>
  <BaseSubPanel
    entity-type="event"
    :title="eventTitle"
    :mode="mode"
    :save-disabled="!canSave || saving"
    @cancel="handleCancel"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Fields -->
    <div class="ep-fields">
      <!-- T22 — Negative assertion toggle (GEDCOM 7.0 NO X). When ticked the
           row records the *absence* of the chosen event type within the
           given date range / place: "no marriage found in the parish
           register between 1850-1900". The event_type picker below still
           drives which event we are negating. -->
      <div class="ep-field ep-negation-toggle">
        <label class="ep-checkbox">
          <input type="checkbox" v-model="form.is_negation" />
          <span>{{ $t('events.isNegation') }}</span>
        </label>
        <span v-if="form.is_negation" class="ep-field-hint">{{ $t('events.negationHint') }}</span>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('common.type') }}</span>
        <div class="ep-seg">
          <button
            v-for="et in QUICK_EVENT_TYPES"
            :key="et"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.event_type === et }"
            @click="form.event_type = et"
          >{{ $t('eventTypes.' + et) }}</button>
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': !QUICK_EVENT_TYPES.includes(form.event_type as QuickType) && !!form.event_type }"
            @click="showTypeDropdown = !showTypeDropdown"
          >{{ $t('events.otherEvents') }}</button>
        </div>
        <select
          v-if="showTypeDropdown"
          class="ep-input"
          :style="{ marginTop: 'var(--space-xs)' }"
          v-model="form.event_type"
          @change="showTypeDropdown = false"
        >
          <option value="" disabled>{{ $t('events.selectType') }}</option>
          <option v-for="et in OTHER_EVENT_TYPES" :key="et" :value="et">
            {{ $t('eventTypes.' + et) }}
          </option>
        </select>
        <ul v-if="typeChangeWarnings.length" class="ep-type-warning">
          <li v-for="w in typeChangeWarnings" :key="w">{{ w }}</li>
        </ul>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('events.date') }}</span>
        <DateInput
          :date-type="form.date_type"
          :date-value="form.date_value ?? ''"
          :date-value-end="form.date_value_end ?? ''"
          :date-original="form.date_original"
          @update:date-type="form.date_type = $event"
          @update:date-value="form.date_value = $event"
          @update:date-value-end="form.date_value_end = $event"
          @update:date-original="form.date_original = $event"
        />
      </div>
      <div v-if="showSpanEndDate" class="ep-field">
        <span class="ep-field-label">{{ $t('events.endDateOptional') }}</span>
        <DateInput
          simple
          :date-type="endDateType"
          :date-value="form.date_value_end ?? ''"
          :date-value-end="''"
          :date-original="''"
          @update:date-type="onEndDateTypeChange"
          @update:date-value="form.date_value_end = $event || null"
          @update:date-value-end="() => {}"
          @update:date-original="() => {}"
        />
        <p class="ep-field-hint">{{ $t('events.endDateHint') }}</p>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('events.place') }}</span>
        <PlacePicker v-model="form.place_id" :placeholder="$t('events.placePlaceholder')" />
      </div>
      <div class="ep-field" data-testid="event-place-address-field">
        <label class="ep-field-label" for="event-field-place-address">{{ $t('events.placeAddress') }}</label>
        <textarea
          id="event-field-place-address"
          class="ep-input"
          v-model="form.place_address"
          rows="2"
          :placeholder="$t('events.placeAddressPlaceholder')"
        />
      </div>
      <div v-if="showFactValueField" class="ep-field" data-testid="event-value-field">
        <label class="ep-field-label" for="event-field-1">{{ $t(valueLabelKey) }}</label>
        <input id="event-field-1" class="ep-input" v-model="form.value" :placeholder="$t('events.valuePlaceholder')" />
      </div>
      <!-- T17: cause surfaced for ALL event types — GEDCOM CAUS applies to any event,
           not just death. The label stays "Cause" so it reads correctly outside the
           death-specific context. -->
      <div class="ep-field" data-testid="event-cause-field">
        <label class="ep-field-label" for="event-field-2">{{ $t('events.cause') }}</label>
        <input
          id="event-field-2"
          class="ep-input"
          v-model="form.cause"
          :placeholder="$t('events.causeOptionalPlaceholder')"
        />
      </div>

      <!-- Second person (only for couple events when called from a person panel) -->
      <template v-if="showSecondPersonField">
        <div class="ep-field">
          <label class="ep-field-label" for="event-field-3">{{ $t('events.spouse') }}</label>
          <select id="event-field-3"
            v-if="partnerOptions.length > 0 && secondPersonMode === 'select'"
            class="ep-input"
            :value="secondPersonId"
            @change="onSecondPersonSelectChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ $t('common.choose') }}</option>
            <option v-for="opt in partnerOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
            <option value="__pick">{{ $t('events.spouseOther') }}</option>
            <option value="__new">{{ $t('events.spouseNew') }}</option>
          </select>
          <template v-else>
            <PersonPicker v-model="secondPersonId" :placeholder="$t('relationships.searchPerson')" />
            <button type="button" class="ep-link-btn" @click="openAddSpouse">+ {{ $t('events.spouseNew') }}</button>
          </template>
        </div>
      </template>

      <!-- Opt-in: also record a name change for the panel-owning person.
           PRIME DIRECTIVE: a name row is only written if recordNameChange stays
           true at save AND at least one of given/surname has content. No
           cascade-link to the event after creation. -->
      <template v-if="showNameChangeCompanion">
        <div class="ep-field ep-namechange-toggle">
          <label class="ep-checkbox">
            <input type="checkbox" v-model="recordNameChange" />
            <span>{{ $t('events.alsoRecordNameChange', { name: contextName }) }}</span>
          </label>
          <span class="ep-field-hint">{{ $t('events.alsoRecordNameChangeHint') }}</span>
        </div>
        <template v-if="recordNameChange">
          <div class="ep-field">
            <label class="ep-field-label" for="event-field-4">{{ $t('persons.givenName') }}</label>
            <input id="event-field-4" class="ep-input" v-model="nameChangeForm.given_name" type="text" />
          </div>
          <div class="ep-field">
            <label class="ep-field-label" for="event-field-5">{{ $t('persons.surname') }}</label>
            <input id="event-field-5" class="ep-input" v-model="nameChangeForm.surname" type="text" />
          </div>
          <div class="ep-field">
            <span class="ep-field-label">{{ $t('names.nameType') }}</span>
            <div class="ep-seg">
              <button
                type="button"
                class="ep-seg-opt"
                :class="{ 'ep-seg-opt--on': nameChangeForm.name_type === 'married' }"
                @click="nameChangeForm.name_type = 'married'"
              >{{ $t('nameTypes.married') }}</button>
              <button
                type="button"
                class="ep-seg-opt"
                :class="{ 'ep-seg-opt--on': nameChangeForm.name_type === 'name_change' }"
                @click="nameChangeForm.name_type = 'name_change'"
              >{{ $t('nameTypes.name_change') }}</button>
            </div>
          </div>
        </template>
      </template>

      <!-- Birth-only: optional baptism details (saved as a linked baptism event) -->
      <template v-if="showBaptismFields">
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('events.baptismDate') }}</span>
          <SimpleDateInput v-model="baptismDate" />
        </div>
        <div class="ep-field">
          <label class="ep-field-label" for="event-field-6">{{ $t('events.godparents') }}</label>
          <input id="event-field-6" class="ep-input" v-model="godparents" :placeholder="$t('events.godparentsPlaceholder')" />
        </div>
        <div v-if="baptismDate || godparents" class="ep-field-hint">
          {{ $t('events.baptismHint') }}
        </div>
      </template>

      <div class="ep-field">
        <label class="ep-field-label" for="event-field-7">{{ $t('events.notes') }}</label>
        <textarea id="event-field-7" class="ep-input" v-model="form.notes" rows="3" :placeholder="$t('events.notesPlaceholder')" />
      </div>
    </div>

    <!-- Citations section. In add mode (no savedEventId yet) we buffer
         pending citations in component state and persist them after the
         event row is created. -->
    <div class="ep-sec-header" data-entity="citation">
      <div class="ep-sec-left">
        <span class="ep-sec-title">📖 {{ $t('citations.title') }}</span>
        <span class="ep-sec-count">({{ allCitationRows.length }})</span>
      </div>
      <button type="button" class="ep-sec-action" @click="openAddCitation">
        + {{ $t('sourceDetail.addCitation') }}
      </button>
    </div>
    <div class="ep-sec-content">
      <div v-if="allCitationRows.length === 0" class="ep-sec-empty">{{ $t('empty.citations') }}</div>
      <div
        v-for="cit in allCitationRows"
        :key="cit.key"
        class="ep-entity-row"
        @click="cit.isPending ? openEditPendingCitation(cit.id) : openEditCitation(cit.id)"
      >
        <div class="ep-entity-main">
          <div class="ep-entity-name">
            <span v-if="cit.confidence != null" :class="'confidence-badge confidence-' + cit.confidence">
              {{ $t('confidenceLevels.' + cit.confidence) }}
            </span>
            <LinkedText v-if="cit.page" :text="cit.page" class="ep-cit-page" />
            <span v-else class="ep-cit-page">{{ $t('citations.noPage') }}</span>
          </div>
          <div class="ep-entity-sub">{{ cit.sourceTitle }}</div>
        </div>
        <button
          type="button"
          class="btn-sm btn-delete"
          style="flex-shrink:0"
          :aria-label="$t('common.remove')"
          @click.stop="cit.isPending ? removePendingCitation(cit.id) : deleteCitation(cit.id)"
        ><IconTrash :size="14" /></button>
      </div>
    </div>

    <!-- Additional participants (godparents, witnesses, mourners, …).
         Visible for every event type — see plan
         2026-05-04-event-participants-and-marriage-flow Part A.2. The
         component handles its own load + reactivity via useEntityData and
         shows a "save the event first" hint when the event isn't persisted
         yet (in which case eventId is null). Excludes the primary
         (props.personId) and spouse (secondPersonId) so they aren't
         double-listed below the slots already showing them above. -->
    <!-- T22 — hide the participants section when this is a negative assertion.
         A negation says "this event did NOT happen" — there isn't anyone
         else to attach as witness / godparent / etc. The primary participant
         (panel-owner) is still attached because the negation is *about*
         them, but the rest of the role surface is intentionally hidden. -->
    <EventParticipantsSection
      v-if="!form.is_negation"
      :event-id="savedEventId"
      :exclude-person-ids="extraParticipantsExcludeIds"
    />

    <!-- Shared notes (T20) — only after first save so we have an event id
         to link the note to. Distinct from the inline `events.notes`
         text-blob above. -->
    <template v-if="savedEventId">
      <div class="ep-sec-header" data-entity="note">
        <div class="ep-sec-left">
          <span class="ep-sec-title">📝 {{ $t('notes.title') }}</span>
          <span class="ep-sec-count">{{ sharedNotesCount }}</span>
        </div>
        <button type="button" class="ep-sec-action" @click="sharedNotesSectionRef?.openAddChoice()">
          {{ $t('notes.add') }}
        </button>
      </div>
      <div class="ep-sec-content">
        <EntityNotesSection
          ref="sharedNotesSectionRef"
          entity-type="event"
          :entity-id="savedEventId"
        />
      </div>
    </template>

    <!-- Sub-panels -->
    <template #subpanels>
      <CitationModal
        v-if="subPanel === 'citation'"
        mode="subpanel"
        :event-id="savedEventId || undefined"
        :editing-citation="editingCitation"
        :defer="!savedEventId"
        :editing-pending="editingPendingCitation"
        @deferred-save="onPendingCitationSaved"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onCitationSaved"
      />
      <PersonModal
        v-if="subPanel === 'person' && props.personId"
        mode="subpanel"
        :add-related-to="{ personId: props.personId, mode: 'spouse' }"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onSpouseCreated"
      />
    </template>
  </BaseSubPanel>

  <ConfirmModal
    :visible="delCitation.visible.value"
    :title="$t('citations.removeConfirmTitle')"
    :message="$t('sourceDetail.confirmDeleteCitation')"
    tone="danger"
    icon="⚠️"
    :confirm-label="$t('common.delete')"
    @cancel="delCitation.cancel"
    @confirm="delCitation.confirm"
  />
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import CitationModal, { type DeferredCitationPayload } from './CitationModal.vue';
import LinkedText from '../LinkedText.vue';
import ConfirmModal from '../ConfirmModal.vue';
import IconTrash from '../ui/IconTrash.vue';
import { useDeleteConfirm } from '../../composables/useDeleteConfirm';
import { useToast } from '../../composables/useToast';
import DateInput from '../DateInput.vue';
import SimpleDateInput from '../SimpleDateInput.vue';
import PlacePicker from '../PlacePicker.vue';
import PersonPicker from '../PersonPicker.vue';
import EventParticipantsSection from '../EventParticipantsSection.vue';
import EntityNotesSection from '../EntityNotesSection.vue';
import PersonModal from './PersonModal.vue';
import { useEventForm, type EventForm } from '../../composables/useEventForm';
import { useEventValidation } from '../../composables/useEventValidation';
import { useEventCitations } from '../../composables/useEventCitations';
import { useEventParticipants } from '../../composables/useEventParticipants';
import { useEventSave, type EventSaveResult } from '../../composables/useEventSave';
import { EVENT_TYPE_VALUES, isSpanEventType } from '../../constants/eventTypes';
import { isEventTypeSortMode, sortEventTypes, type EventTypeSortMode } from '../../utils/eventTypeSort';
import { pickDisplayedName } from '../../utils/nameUtils';
import { eventTypeHasFactValue, valueFieldI18nKey } from '../../../api/events_gedcom';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const QUICK_EVENT_TYPES = ['birth', 'marriage', 'death'] as const;
type QuickType = typeof QUICK_EVENT_TYPES[number];

// Dropdown shows everything else — quick row already covers the top three.
const OTHER_EVENT_TYPES_RAW = EVENT_TYPE_VALUES.filter(
  (et) => !QUICK_EVENT_TYPES.includes(et as QuickType),
);

interface EditingCitation {
  id: string;
  page: string;
  confidence: number;
  transcription: string;
  notes: string;
  date_accessed: string;
}
// EventData mirrors the props' shape (modal callers still pass this shape in).
// The composables use their own EventForm type which is structurally equivalent.
interface EventData {
  id?: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_address?: string | null;
  cause: string | null;
  value: string | null;
  notes: string;
  // T22 — negation flags optional on the inbound EventData so older callers
  // still type-check; both default to absent (treated as not-a-negation).
  is_negation?: boolean | number | null;
  negation_event_type?: string | null;
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string;
  relationshipId?: string;
  editingEvent?: EventData | null;
  defaultEventType?: string;
  defaultPlaceId?: string | null;
}>(), {
  mode: 'subpanel',
  editingEvent: null,
  // Empty default — never pre-select an event type for new events (BENGT #28b).
  // Callers can still pass an explicit type to pre-fill the picker.
  defaultEventType: '',
  defaultPlaceId: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [event: EventData];
}>();

const { t } = useI18n();
const toast = useToast();

// User-controlled sort order (BENGT #1, #3). Default: alphabetical.
const eventTypeSort = ref<EventTypeSortMode>('alphabetical');
const OTHER_EVENT_TYPES = computed(() =>
  sortEventTypes(OTHER_EVENT_TYPES_RAW, eventTypeSort.value, (et) => t('eventTypes.' + et)),
);

async function loadEventTypeSort() {
  if (!window.api) return;
  try {
    const raw = (await window.api.db.getSetting('event_type_sort')) as string | null;
    eventTypeSort.value = isEventTypeSortMode(raw) ? raw : 'alphabetical';
  } catch {
    eventTypeSort.value = 'alphabetical';
  }
}

// ── Form state (via useEventForm composable) ─────────────────────────────
//
// The composable owns the reactive form shape + dirty tracking. We seed it
// with the editing event in edit mode (full shape) or defaults in create
// mode (just event_type + place_id from props). The edit-mode hydration
// branch of useEventForm is skipped because the modal already received the
// row via props (no need for a second fetch).
const savedEventId = ref<string | null>(props.editingEvent?.id ?? null);
const sharedNotesSectionRef = ref<(InstanceType<typeof EntityNotesSection> & { count: number; openAddChoice: () => void }) | null>(null);
const sharedNotesCount = computed(() => sharedNotesSectionRef.value?.count ?? 0);
const editingEventDefaults: Partial<EventForm> | undefined = props.editingEvent
  ? {
      event_type: props.editingEvent.event_type,
      date_type: props.editingEvent.date_type,
      date_value: props.editingEvent.date_value,
      date_value_end: props.editingEvent.date_value_end,
      date_original: props.editingEvent.date_original,
      place_id: props.editingEvent.place_id,
      place_address: props.editingEvent.place_address ?? null,
      cause: props.editingEvent.cause,
      value: props.editingEvent.value,
      notes: props.editingEvent.notes,
      // T22 — SQLite stores is_negation as 0/1; coerce to boolean for the form.
      is_negation: !!props.editingEvent.is_negation,
      negation_event_type: props.editingEvent.negation_event_type ?? '',
    }
  : {
      event_type: props.defaultEventType,
      place_id: props.defaultPlaceId,
    };
const { form } = useEventForm({
  // Pass mode 'create' regardless — we already have the props row, no need
  // for the composable's edit-hydration fetch.
  eventId: null,
  mode: 'create',
  defaults: editingEventDefaults,
});

const { canSave } = useEventValidation(form);

// Snapshot of the event_type at the moment we entered edit mode. Used to drive
// a soft warning when the user changes type on an already-saved event
// (BENGT #36 — warn, don't block).
const initialEventType = ref<string>(props.editingEvent?.event_type ?? '');

// Fact-shape detection: GEDCOM tags whose line value carries the primary fact
// value (OCCU "Carpenter", EDUC "BA", RELI "Lutheran"). The value field is
// shown only for these event types — but the form retains form.value across
// type toggles so authored data is never silently nulled (Prime Directive).
const showFactValueField = computed(() => eventTypeHasFactValue(form.event_type));
const valueLabelKey = computed(() => valueFieldI18nKey(form.event_type));

const contextName = ref('');

const eventTitle = computed(() => {
  let base = form.event_type ? t('eventTypes.' + form.event_type) : t('events.newEvent');
  // T22 — Prefix the base label with the negation-prefix word when the user
  // has flagged this row as a negative assertion. "Saknad vigsel" / "No marriage".
  if (form.is_negation) base = t('events.negationPrefix') + ' ' + base.toLowerCase();
  return contextName.value ? t('events.titleOf', { event: base, name: contextName.value }) : base;
});

// Span events (residence, occupation, education, military, travel) accept an
// optional end date even when date_type is not 'between' (BENGT #28a).
// T17: also surface the end-date whenever date_type is 'from_to' regardless of
// event_type — GEDCOM 7.0 FROM/TO dates carry an explicit span end (T09).
const showSpanEndDate = computed(
  () =>
    (isSpanEventType(form.event_type) && form.date_type !== 'between') ||
    form.date_type === 'from_to'
);
// Local end-date type (the schema only has date_value_end as a string, no
// matching `date_type_end` column). Defaults to 'unknown' so a span event
// stays open-ended unless the user explicitly picks a real end date.
const endDateType = ref<string>(form.date_value_end ? 'exact' : 'unknown');
function onEndDateTypeChange(t: string) {
  endDateType.value = t;
  if (t === 'unknown') form.date_value_end = null;
}
const showTypeDropdown = ref(false);

// ── Citations (via useEventCitations composable) ─────────────────────────
const {
  citations,
  pendingCitations,
  allCitationRows,
  reload: reloadCitations,
  addPending: addPendingCitation,
  updatePending: updatePendingCitation,
  removePending: removePendingCitationRow,
  removeSaved: removeSavedCitation,
} = useEventCitations(savedEventId);

// ── Participants (via useEventParticipants composable) ───────────────────
const {
  participants,
  reload: reloadParticipants,
} = useEventParticipants(savedEventId, props.personId ?? null);

// Existing participants tracked separately for the type-change warning UX —
// the composable's `participants` includes auto-seeded primary rows the user
// hasn't committed yet, while the warning needs to reflect persisted rows
// only. Keep a thin local cache populated from window.api on mount + after
// loadExistingParticipants() updates.
const existingParticipants = ref<Array<{ id: string; person_id: string; role: string }>>([]);

async function loadExistingParticipants() {
  if (!savedEventId.value || !window.api) return;
  try {
    existingParticipants.value = (await window.api.eventParticipants.getForEvent(savedEventId.value)) as Array<{
      id: string; person_id: string; role: string;
    }>;
    // Pre-fill the second-person picker for edit mode. Find the spouse row
    // that isn't the panel-owning person (the panel-owner is the 'primary').
    if (props.editingEvent && props.personId) {
      const spouse = existingParticipants.value.find(
        (p) => p.role === 'spouse' && p.person_id !== props.personId,
      );
      if (spouse) {
        existingSpouseParticipantId.value = spouse.id;
        secondPersonId.value = spouse.person_id;
        // If the spouse isn't reachable through the panel-owner's couple
        // relationships (e.g. wedding event without a backing relationship),
        // the relationship-derived select can't display them — switch to the
        // PersonPicker fallback so the user always sees who is on the event.
        if (!partnerOptions.value.some((o) => o.id === spouse.person_id)) {
          secondPersonMode.value = 'pick';
        }
      } else {
        existingSpouseParticipantId.value = null;
      }
    }
  } catch { /* ignore */ }
}

// Soft warning(s) when changing type on an existing event. We don't block — some
// users genuinely correct a mis-categorized event — but we surface the specific
// risks rather than a generic "may be inconsistent" line (BENGT #36 — warn,
// don't block).
const typeChangeWarnings = computed<string[]>(() => {
  if (!props.editingEvent || !initialEventType.value) return [];
  if (form.event_type === initialEventType.value) return [];
  const warnings: string[] = [];
  const wasCouple = COUPLE_EVENT_TYPES.has(initialEventType.value);
  const isCouple = COUPLE_EVENT_TYPES.has(form.event_type);
  const hasSpouseParticipant = existingParticipants.value.some((p) => p.role === 'spouse');
  if (wasCouple && !isCouple && hasSpouseParticipant) {
    warnings.push(t('events.typeChangeWarnSpouseOrphaned'));
  }
  if (!wasCouple && isCouple && !hasSpouseParticipant) {
    warnings.push(t('events.typeChangeWarnSpouseMissing'));
  }
  const citationCount = citations.value.length;
  if (citationCount > 0) {
    warnings.push(t('events.typeChangeWarnCitations', {
      count: citationCount,
      oldType: t('eventTypes.' + initialEventType.value),
    }, citationCount));
  }
  return warnings;
});

// Birth-only baptism companion fields. Hidden when editing an existing event so we
// don't accidentally create duplicate baptism events on every re-save.
const baptismDate = ref('');
const godparents = ref('');
const showBaptismFields = computed(
  () => form.event_type === 'birth' && !props.editingEvent && props.personId
);
const baptismCreatedId = ref<string | null>(null);

// Couple-event companion: when creating a marriage / wedding / engagement / divorce
// from a person panel, we need to attach a second participant (spouse).
const COUPLE_EVENT_TYPES = new Set(['marriage', 'wedding', 'engagement', 'divorce']);
interface PartnerOption { id: string; label: string; }
const partnerOptions = ref<PartnerOption[]>([]);
const secondPersonId = ref<string | null>(null);
const secondPersonMode = ref<'select' | 'pick'>('select');
// Visible whenever we're hosted on a person panel for a couple event — at
// create time AND when re-opening an existing event in edit mode. Editing must
// expose the same affordance as creating; otherwise the panel-owning
// genealogist can't see or change who the second participant is.
const showSecondPersonField = computed(
  () => COUPLE_EVENT_TYPES.has(form.event_type)
    && !!props.personId
    && !props.relationshipId
);

// Track the spouse-role participant row for the edit branch so we can update
// it in place (preserving its id + any future-attached metadata) rather than
// blindly delete-and-reinsert. Initialised by loadExistingParticipants.
const existingSpouseParticipantId = ref<string | null>(null);

// IDs already represented in the modal as dedicated rows (primary above the
// fold, spouse picker for couple events). Drop them from the additional
// participants list so they aren't shown twice on the same event.
const extraParticipantsExcludeIds = computed<string[]>(() => {
  const ids: string[] = [];
  if (props.personId) ids.push(props.personId);
  if (secondPersonId.value) ids.push(secondPersonId.value);
  return ids;
});

function onSecondPersonSelectChange(val: string) {
  if (val === '__pick') {
    secondPersonId.value = null;
    secondPersonMode.value = 'pick';
    return;
  }
  if (val === '__new') {
    secondPersonId.value = null;
    subPanel.value = 'person';
    return;
  }
  secondPersonId.value = val || null;
}

function openAddSpouse() {
  subPanel.value = 'person';
}

async function onSpouseCreated(person: { id: string }) {
  secondPersonId.value = person.id;
  subPanel.value = null;
  await reloadPartnerOptions();
}

async function reloadPartnerOptions() {
  if (!props.personId || !window.api) return;
  try {
    const rels = (await window.api.relationships.getForPerson(props.personId)) as Array<{
      id: string; type: string; person1_id: string | null; person2_id: string | null;
    }>;
    const partnerIds = rels
      .filter(r => r.type === 'couple')
      .map(r => r.person1_id === props.personId ? r.person2_id : r.person1_id)
      .filter((id): id is string => !!id && id !== props.personId);
    const seen = new Set<string>();
    const options: PartnerOption[] = [];
    for (const id of partnerIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string }>;
      const primary = names[0];
      const label = primary ? [primary.given_name, primary.surname].filter(Boolean).join(' ') : id;
      options.push({ id, label: label || id });
    }
    partnerOptions.value = options;
  } catch { /* ignore */ }
}

// Marriage-modal name-change companion (opt-in).
//
// PRIME DIRECTIVE: this checkbox is OFF by default. The fields are pre-filled
// from the person's current displayed name as a convenience, but no name row is
// written unless the user keeps the checkbox ticked when saving.
//
// CASCADE-DECOUPLING: once the companion name row is created in handleSave,
// it is a separately authored fact. Editing or deleting the marriage event
// later does NOT update or remove the name row. Do not add code that re-reads
// or syncs the name row when the event is mutated.
const NAME_CHANGE_EVENT_TYPES = new Set(['marriage', 'wedding', 'engagement']);
const recordNameChange = ref(false);
const nameChangeForm = reactive({
  given_name: '',
  surname: '',
  name_type: 'married' as 'married' | 'name_change',
});
const showNameChangeCompanion = computed(
  () => NAME_CHANGE_EVENT_TYPES.has(form.event_type)
    && !!props.personId
    && !props.editingEvent,
);

// Pre-fill name fields from the person's current displayed name when the
// checkbox is first ticked. Only pre-fills when both fields are empty so we
// never overwrite something the user typed.
watch([showNameChangeCompanion, recordNameChange], async ([visible, on]) => {
  if (!(visible && on)) return;
  if (nameChangeForm.given_name || nameChangeForm.surname) return;
  if (!props.personId || !window.api) return;
  try {
    const [namesResp, eventsResp] = await Promise.all([
      window.api.persons.getNames(props.personId) as Promise<Array<{
        id: string;
        given_name: string | null;
        surname: string | null;
        preferred_name: string | null;
        nickname: string | null;
        sort_order: number;
        name_type: string;
        date_from?: string | null;
      }>>,
      window.api.events.forPerson(props.personId) as Promise<Array<{
        event_type: string; date_value: string | null;
      }>>,
    ]);
    const current = pickDisplayedName(namesResp, eventsResp);
    if (!current) return;
    nameChangeForm.given_name = current.given_name ?? '';
    nameChangeForm.surname = current.surname ?? '';
  } catch { /* ignore */ }
});

// Sub-panel state — citation flow delegates source picking to CitationModal itself
const subPanel = ref<'citation' | 'person' | null>(null);
const editingCitation = ref<EditingCitation | null>(null);
const editingPendingCitation = ref<DeferredCitationPayload | null>(null);

function openAddCitation() {
  editingCitation.value = null;
  editingPendingCitation.value = null;
  subPanel.value = 'citation';
}

async function openEditCitation(citationId: string) {
  if (!window.api) return;
  try {
    const c = (await window.api.citations.get(citationId)) as EditingCitation | null;
    if (!c) return;
    editingCitation.value = c;
    editingPendingCitation.value = null;
    subPanel.value = 'citation';
  } catch { /* ignore */ }
}

function openEditPendingCitation(tempId: string) {
  const found = pendingCitations.value.find((c) => c.tempId === tempId);
  if (!found) return;
  editingCitation.value = null;
  editingPendingCitation.value = found as DeferredCitationPayload;
  subPanel.value = 'citation';
}

function closeSubPanel() {
  subPanel.value = null;
  editingCitation.value = null;
  editingPendingCitation.value = null;
}

async function onCitationSaved() {
  closeSubPanel();
  await reloadCitations();
}

function onPendingCitationSaved(payload: DeferredCitationPayload) {
  if (payload.tempId) {
    updatePendingCitation(payload.tempId, payload);
  } else {
    addPendingCitation(payload);
  }
  closeSubPanel();
}

function removePendingCitation(tempId: string) {
  removePendingCitationRow(tempId);
}

const delCitation = useDeleteConfirm<string>(async (id) => {
  await removeSavedCitation(id);
});
function deleteCitation(id: string) { delCitation.ask(id); }

onMounted(async () => {
  await loadEventTypeSort();
  // partnerOptions must load before participants so loadExistingParticipants
  // can decide between the select and the PersonPicker fallback when the
  // existing spouse isn't reachable via the panel-owner's couple relationships.
  await reloadPartnerOptions();
  await loadExistingParticipants();
  await loadContextName();
});

async function loadContextName() {
  if (!window.api) return;
  try {
    if (props.personId) {
      const names = (await window.api.persons.getNames(props.personId)) as Array<{ given_name: string; surname: string }>;
      const primary = names[0];
      if (primary) contextName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
    } else if (props.relationshipId) {
      const rel = (await window.api.relationships.get(props.relationshipId)) as { person1_id: string | null; person2_id: string | null } | null;
      if (rel) {
        const labels: string[] = [];
        for (const id of [rel.person1_id, rel.person2_id]) {
          if (!id) continue;
          const nm = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string }>;
          const p = nm[0];
          if (p) labels.push([p.given_name, p.surname].filter(Boolean).join(' '));
        }
        contextName.value = labels.join(' & ');
      }
    }
  } catch { /* ignore */ }
}

// ── Save orchestration (via useEventSave composable) ─────────────────────
//
// The composable handles the core save: create-or-update + flush pending
// citations + flush pending participants. Everything EventModal-specific
// — baptism companion, name-change companion, spouse sync on edit, quality
// check probe — runs in the `onSaved` callback after the core sequence.
//
// `extraCreateFields` forwards relationship_id when hosted on a relationship
// panel (the modal owns the prop and decides what flows into the payload).
//
// PRIME DIRECTIVE: useEventSave writes every authored field unconditionally
// regardless of whether the current event_type hides them in the UI. Hiding
// a field is not consent to discard its value.
const { save: composableSave, saving } = useEventSave({
  form,
  pendingCitations,
  participants,
  eventIdRef: savedEventId,
  mode: props.editingEvent ? 'edit' : 'create',
  canSave,
  emit: (name, payload) => {
    if (name === 'saved') emit('saved', payload as EventData);
    else if (name === 'cancel') emit('cancel');
    else if (name === 'close') emit('close');
  },
  extraCreateFields: () => {
    const extras: Record<string, unknown> = {};
    if (props.relationshipId) extras.relationship_id = props.relationshipId;
    return extras;
  },
  onSaved: async (ev: EventSaveResult) => {
    // On create from a person panel: attach panel-owner as primary (only on
    // create; useEventSave already flushes any buffered pending: rows from
    // useEventParticipants but the panel-owner primary is not buffered there
    // when props.personId is set — useEventParticipants does seed a primary
    // automatically and useEventSave flushes pending: rows, so this is a
    // belt-and-braces check). For couple events: also attach the second
    // person from the picker.
    const wasCreate = !props.editingEvent;
    if (wasCreate && window.api) {
      // useEventParticipants seeded a primary with role='primary' before save;
      // useEventSave already flushed it via participantAdd. But: the legacy
      // path also explicitly added the panel-owner if it wasn't already.
      // Confirm primary actually exists for this event_id; add if missing.
      try {
        const persisted = (await window.api.eventParticipants.getForEvent(ev.id)) as Array<{
          person_id: string; role: string;
        }>;
        if (props.personId && !persisted.some((p) => p.role === 'primary' && p.person_id === props.personId)) {
          await window.api.eventParticipants.add({
            event_id: ev.id,
            person_id: props.personId,
            role: 'primary',
          });
        }
        // Couple events from a person panel: also attach the second person.
        if (showSecondPersonField.value && secondPersonId.value && props.personId
          && secondPersonId.value !== props.personId
          && !persisted.some((p) => p.role === 'spouse' && p.person_id === secondPersonId.value)
        ) {
          await window.api.eventParticipants.add({
            event_id: ev.id,
            person_id: secondPersonId.value,
            role: 'spouse',
          });
        }
      } catch { /* ignore */ }
    }

    // Edit branch: keep the spouse participant in sync with the picker.
    // Four cases (Prime Directive — never blind delete + reinsert if value
    // didn't change):
    //   - same id  → no-op
    //   - changed  → remove old, add new
    //   - cleared  → remove old
    //   - both nil → no-op
    if (!wasCreate && showSecondPersonField.value && props.personId && window.api) {
      const desiredId = secondPersonId.value && secondPersonId.value !== props.personId
        ? secondPersonId.value
        : null;
      const existingId = existingSpouseParticipantId.value;
      const existingSpouse = existingId
        ? existingParticipants.value.find((p) => p.id === existingId)
        : null;
      const existingPersonId = existingSpouse?.person_id ?? null;
      if (desiredId !== existingPersonId) {
        if (existingId) {
          await window.api.eventParticipants.remove(existingId);
          existingSpouseParticipantId.value = null;
        }
        if (desiredId) {
          const added = (await window.api.eventParticipants.add({
            event_id: ev.id,
            person_id: desiredId,
            role: 'spouse',
          })) as { id: string } | null;
          if (added?.id) existingSpouseParticipantId.value = added.id;
        }
        await loadExistingParticipants();
      }
    }

    // Birth-only baptism companion (create-only via `showBaptismFields`).
    await syncBaptismCompanion(ev.id);

    // Marriage-modal name-change companion: only at create time, only when
    // the user keeps the checkbox ticked, only when at least one field has
    // content. PRIME DIRECTIVE: best-effort — failure must NOT roll back
    // the event. The name row is a separately authored fact from this
    // moment on (no cascade on later event edits or delete).
    if (
      !props.editingEvent
      && recordNameChange.value
      && showNameChangeCompanion.value
      && props.personId
      && window.api
    ) {
      const given = nameChangeForm.given_name.trim();
      const surname = nameChangeForm.surname.trim();
      if (given || surname) {
        try {
          await window.api.persons.addName(props.personId, {
            given_name: given,
            surname: surname || null,
            name_type: nameChangeForm.name_type,
            date_from: form.date_value || null,
            date_to: null,
          });
        } catch (nameErr) {
          console.error('[EventModal] companion name save failed:', nameErr);
          toast.error(t('errors.saveFailed'));
        }
      }
    }

    // Post-save quality check (informational, non-blocking).
    // Surfaces EVENT_BEFORE_BIRTH / EVENT_OUTSIDE_LIFESPAN_AFTER_DEATH at
    // save time so the user reconciles authored-but-inconsistent dates
    // instead of silently leaving them in the database. PRIME DIRECTIVE:
    // this never modifies `ev` — it just reads.
    if (window.api) {
      try {
        const checkResults = (await window.api.checks.runForEvent(ev.id)) as Array<{ code: string }> | null;
        if (checkResults && checkResults.length > 0) {
          toast.warning(t('quality.toast.eventOutsideLifespan', { count: checkResults.length }));
        }
      } catch (qcErr) {
        // Non-blocking: a failed quality probe must not block the save.
        console.error('[EventModal] post-save quality check failed:', qcErr);
      }
    }

    // Ensure citation list reflects any post-create flushes.
    await reloadCitations();
    await reloadParticipants();
  },
});

async function handleSave() {
  await composableSave();
}

// If the user filled in baptism date or godparents on a birth event, create/update
// a separate baptism event with the same place, link the same primary participant,
// and copy current citations from the birth event so the source carries over.
async function syncBaptismCompanion(birthEventId: string) {
  if (!showBaptismFields.value) return;
  if (!window.api) return;
  if (!props.personId) return;
  const date = baptismDate.value.trim();
  const fadder = godparents.value.trim();
  if (!date && !fadder) return;

  const notes = fadder ? `${t('events.godparents')}: ${fadder}` : '';
  const payload = {
    event_type: 'christening',
    date_type: 'exact',
    date_value: date || null,
    date_value_end: null,
    date_original: '',
    place_id: form.place_id,
    cause: null,
    value: null,
    notes,
    relationship_id: null,
  };

  let baptismId = baptismCreatedId.value;
  if (!baptismId) {
    const baptism = (await window.api.events.create(payload)) as { id: string };
    baptismId = baptism.id;
    baptismCreatedId.value = baptismId;
    await window.api.eventParticipants.add({
      event_id: baptismId,
      person_id: props.personId,
      role: 'primary',
    });
  } else {
    await window.api.events.update(baptismId, payload);
  }

  // Copy birth citations to baptism (only those not already present, by source_id)
  const birthCits = (await window.api.citations.forEvent(birthEventId)) as Array<{
    id: string; source_id: string; page: string; date_accessed: string;
    confidence: number; transcription: string; notes: string;
  }>;
  const baptismCits = (await window.api.citations.forEvent(baptismId)) as Array<{ source_id: string }>;
  const seen = new Set(baptismCits.map(c => c.source_id));
  for (const c of birthCits) {
    if (seen.has(c.source_id)) continue;
    await window.api.citations.create({
      source_id: c.source_id,
      event_id: baptismId,
      page: c.page,
      date_accessed: c.date_accessed,
      confidence: c.confidence,
      transcription: c.transcription,
      notes: c.notes,
    });
  }
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.ep-field-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin: calc(var(--space-xs) * -1) 0 var(--space-sm) 0;
  line-height: 1.4;
}
.ep-type-warning {
  font-size: var(--font-xs);
  color: var(--warning-text);
  background: var(--warning-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-sm);
  margin: var(--space-xs) 0 0 0;
  line-height: 1.4;
  list-style: none;
}
.ep-type-warning li + li {
  margin-top: var(--space-xs);
}
.ep-link-btn {
  background: none;
  border: none;
  color: var(--color-link, var(--accent));
  font-size: var(--font-sm);
  padding: var(--space-xs) 0 0 0;
  cursor: pointer;
}
.ep-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-sm);
  cursor: pointer;
  user-select: none;
}
.ep-checkbox input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}
.ep-link-btn:hover {
  text-decoration: underline;
}
/* Citation row visuals — keep page + confidence visible together so each row
   reads as a citation, not a source. */
.ep-cit-page {
  font-size: var(--font-xs);
  color: var(--text-primary);
  font-weight: 600;
  margin-left: var(--space-xs);
}
.confidence-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  vertical-align: baseline;
}
.confidence-0 { background: var(--error-bg);   color: var(--error-text); }
.confidence-1 { background: var(--warning-bg); color: var(--warning-text); }
.confidence-2 { background: var(--info-bg);    color: var(--info-text); }
.confidence-3 { background: var(--success-bg); color: var(--success-text); }
.ep-sec-empty {
  font-size: var(--font-xs);
  color: var(--text-muted);
  padding: var(--space-xs) 0;
}
</style>
