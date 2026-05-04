<template>
  <BaseSubPanel
    entity-type="event"
    :title="eventTitle"
    :mode="mode"
    @cancel="handleCancel"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Fields -->
    <div class="ep-fields">
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
      <div v-if="showFactValueField" class="ep-field" data-testid="event-value-field">
        <span class="ep-field-label">{{ $t(valueLabelKey) }}</span>
        <input class="ep-input" v-model="form.value" :placeholder="$t('events.valuePlaceholder')" />
      </div>
      <div v-if="form.event_type === 'death'" class="ep-field">
        <span class="ep-field-label">{{ $t('events.cause') }}</span>
        <input class="ep-input" v-model="form.cause" :placeholder="$t('events.causePlaceholder')" />
      </div>

      <!-- Second person (only for couple events when called from a person panel) -->
      <template v-if="showSecondPersonField">
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('events.spouse') }}</span>
          <select
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
            <span class="ep-field-label">{{ $t('persons.givenName') }}</span>
            <input class="ep-input" v-model="nameChangeForm.given_name" type="text" />
          </div>
          <div class="ep-field">
            <span class="ep-field-label">{{ $t('persons.surname') }}</span>
            <input class="ep-input" v-model="nameChangeForm.surname" type="text" />
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
          <span class="ep-field-label">{{ $t('events.godparents') }}</span>
          <input class="ep-input" v-model="godparents" :placeholder="$t('events.godparentsPlaceholder')" />
        </div>
        <div v-if="baptismDate || godparents" class="ep-field-hint">
          {{ $t('events.baptismHint') }}
        </div>
      </template>

      <div class="ep-field">
        <span class="ep-field-label">{{ $t('events.notes') }}</span>
        <textarea class="ep-input" v-model="form.notes" rows="3" :placeholder="$t('events.notesPlaceholder')" />
      </div>
    </div>

    <!-- Citations section. In add mode (no savedEventId yet) we buffer
         pending citations in component state and persist them after the
         event row is created. -->
    <div class="ep-sec-header" data-entity="citation">
      <div class="ep-sec-left">
        <span class="ep-sec-title">📖 {{ $t('citations.title') }}</span>
        <span class="ep-sec-count">{{ allCitationRows.length }}</span>
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
            <span class="ep-cit-page">{{ cit.page || $t('citations.noPage') }}</span>
          </div>
          <div class="ep-entity-sub">{{ cit.sourceTitle }}</div>
        </div>
        <button
          type="button"
          class="btn-sm btn-delete"
          style="flex-shrink:0"
          :aria-label="$t('common.remove')"
          @click.stop="cit.isPending ? removePendingCitation(cit.id) : deleteCitation(cit.id)"
        >✕</button>
      </div>
    </div>

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
import ConfirmModal from '../ConfirmModal.vue';
import { useDeleteConfirm } from '../../composables/useDeleteConfirm';
import { useToast } from '../../composables/useToast';
import DateInput from '../DateInput.vue';
import SimpleDateInput from '../SimpleDateInput.vue';
import PlacePicker from '../PlacePicker.vue';
import PersonPicker from '../PersonPicker.vue';
import PersonModal from './PersonModal.vue';
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

interface CitationRow { id: string; sourceTitle: string; page: string | null; confidence: number | null; }
interface EditingCitation {
  id: string;
  page: string;
  confidence: number;
  transcription: string;
  notes: string;
  date_accessed: string;
}
interface EventData {
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

const savedEventId = ref<string | null>(props.editingEvent?.id ?? null);

// Snapshot of the event_type at the moment we entered edit mode. Used to drive
// a soft warning when the user changes type on an already-saved event
// (BENGT #36 — warn, don't block).
const initialEventType = ref<string>(props.editingEvent?.event_type ?? '');

const form = reactive<EventData>({
  id: props.editingEvent?.id,
  event_type: props.editingEvent?.event_type ?? props.defaultEventType,
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? null,
  date_value_end: props.editingEvent?.date_value_end ?? null,
  date_original: props.editingEvent?.date_original ?? '',
  place_id: props.editingEvent ? props.editingEvent.place_id : (props.defaultPlaceId ?? null),
  cause: props.editingEvent?.cause ?? null,
  value: props.editingEvent?.value ?? null,
  notes: props.editingEvent?.notes ?? '',
});

// Fact-shape detection: GEDCOM tags whose line value carries the primary fact
// value (OCCU "Carpenter", EDUC "BA", RELI "Lutheran"). The value field is
// shown only for these event types — but the form retains form.value across
// type toggles so authored data is never silently nulled (Prime Directive).
const showFactValueField = computed(() => eventTypeHasFactValue(form.event_type));
const valueLabelKey = computed(() => valueFieldI18nKey(form.event_type));

const contextName = ref('');

const eventTitle = computed(() => {
  const base = form.event_type ? t('eventTypes.' + form.event_type) : t('events.newEvent');
  return contextName.value ? t('events.titleOf', { event: base, name: contextName.value }) : base;
});

// Span events (residence, occupation, education, military, travel) accept an
// optional end date even when date_type is not 'between' (BENGT #28a).
const showSpanEndDate = computed(
  () => isSpanEventType(form.event_type) && form.date_type !== 'between'
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

// Existing participants (only loaded when editing). Used by the type-change
// warning to flag spouses/secondary participants that would no longer fit a
// new type, or that are missing for a type that requires them.
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
  editingPendingCitation.value = found;
  subPanel.value = 'citation';
}

function closeSubPanel() {
  subPanel.value = null;
  editingCitation.value = null;
  editingPendingCitation.value = null;
}

// Citations list
const citations = ref<CitationRow[]>([]);

async function loadCitations() {
  if (!savedEventId.value || !window.api) return;
  try {
    const raw = (await window.api.citations.forEvent(savedEventId.value)) as Array<{
      id: string; source_id: string; page: string | null; confidence: number | null;
    }>;
    const rows: CitationRow[] = [];
    for (const c of raw) {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      rows.push({
        id: c.id,
        sourceTitle: src?.title ?? c.source_id,
        page: c.page,
        confidence: c.confidence,
      });
    }
    citations.value = rows;
  } catch { /* ignore */ }
}

async function onCitationSaved() {
  closeSubPanel();
  await loadCitations();
}

// Pending (buffered) citations — used while creating a new event that does not
// yet have an event_id. They are persisted in handleSave() after events.create.
const pendingCitations = ref<DeferredCitationPayload[]>([]);

function onPendingCitationSaved(payload: DeferredCitationPayload) {
  if (payload.tempId) {
    const i = pendingCitations.value.findIndex((c) => c.tempId === payload.tempId);
    if (i >= 0) pendingCitations.value.splice(i, 1, payload);
  } else {
    pendingCitations.value.push({
      ...payload,
      tempId: 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    });
  }
  closeSubPanel();
}

function removePendingCitation(tempId: string) {
  const i = pendingCitations.value.findIndex((c) => c.tempId === tempId);
  if (i >= 0) pendingCitations.value.splice(i, 1);
}

interface MergedCitationRow {
  key: string;
  id: string;
  isPending: boolean;
  sourceTitle: string;
  page: string | null;
  confidence: number | null;
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

const delCitation = useDeleteConfirm<string>(async (id) => {
  if (!window.api) return;
  await window.api.citations.delete(id);
  await loadCitations();
});
function deleteCitation(id: string) { delCitation.ask(id); }

onMounted(async () => {
  await loadEventTypeSort();
  await loadCitations();
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

// Save event
async function handleSave() {
  if (!window.api) return;
  try {
    let ev: EventData;
    if (savedEventId.value) {
      // Preserve user-authored cause/date_value_end regardless of current
      // event_type. The form hides those fields outside of death/span types,
      // but hiding a field is not consent to discard its value — see Prime
      // Directive in CLAUDE.md.
      // PRIME DIRECTIVE: send `value` and `notes` unconditionally, regardless
      // of whether `showFactValueField` is true at this moment. Hiding the
      // value field on a type change is not consent to discard the authored
      // value. Same rule that protects `cause` and `date_value_end` above.
      ev = (await window.api.events.update(savedEventId.value, {
        event_type: form.event_type,
        date_type: form.date_type,
        date_value: form.date_value || null,
        date_value_end: form.date_value_end || null,
        date_original: form.date_original,
        place_id: form.place_id,
        cause: form.cause || null,
        value: form.value || null,
        notes: form.notes || '',
      })) as EventData;
      // Couple events: keep the spouse participant in sync with the picker.
      // Four cases (see Prime Directive — never blind delete + reinsert if
      // the value didn't change):
      //   - same id  → no-op
      //   - changed  → remove old, add new
      //   - cleared  → remove old
      //   - both nil → no-op
      if (showSecondPersonField.value && props.personId) {
        const desiredId = secondPersonId.value && secondPersonId.value !== props.personId
          ? secondPersonId.value
          : null;
        const existingId = existingSpouseParticipantId.value;
        // Re-derive the existing spouse's person_id from the cached
        // participants list (loaded in loadExistingParticipants).
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
              event_id: savedEventId.value,
              person_id: desiredId,
              role: 'spouse',
            })) as { id: string } | null;
            if (added?.id) existingSpouseParticipantId.value = added.id;
          }
          // Refresh the cache so subsequent saves observe the new state.
          await loadExistingParticipants();
        }
      }
    } else {
      ev = (await window.api.events.create({
        event_type: form.event_type,
        date_type: form.date_type,
        date_value: form.date_value || null,
        date_value_end: form.date_value_end || null,
        date_original: form.date_original,
        place_id: form.place_id,
        cause: form.cause || null,
        value: form.value || null,
        notes: form.notes || '',
        relationship_id: props.relationshipId ?? null,
      })) as EventData;
      savedEventId.value = ev.id!;
      if (props.personId) {
        await window.api.eventParticipants.add({
          event_id: ev.id,
          person_id: props.personId,
          role: 'primary',
        });
      }
      // Couple events from a person panel: also attach the second person.
      if (showSecondPersonField.value && secondPersonId.value && props.personId
        && secondPersonId.value !== props.personId) {
        await window.api.eventParticipants.add({
          event_id: ev.id,
          person_id: secondPersonId.value,
          role: 'spouse',
        });
      }
      // Persist any citations the user added before the event existed.
      // syncBaptismCompanion below reads citations.forEvent(birthEventId), so
      // these must be written first for the baptism companion to inherit them.
      for (const pc of pendingCitations.value) {
        await window.api.citations.create({
          source_id: pc.source_id,
          page: pc.page,
          confidence: pc.confidence,
          transcription: pc.transcription,
          notes: pc.notes,
          date_accessed: pc.date_accessed,
          event_id: ev.id,
        });
      }
      pendingCitations.value = [];
    }
    await syncBaptismCompanion(ev.id!);
    // Marriage-modal name-change companion: only at create time, only when the
    // user keeps the checkbox ticked, only when at least one field has content.
    // PRIME DIRECTIVE: best-effort — if this fails, surface but do NOT roll
    // back the event. The name row is a separately authored fact from this
    // moment on (no cascade on later event edits or delete).
    if (
      !props.editingEvent
      && recordNameChange.value
      && showNameChangeCompanion.value
      && props.personId
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
    emit('saved', ev);
  } catch (err) {
    console.error('[EventModal] save failed:', err);
  }
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
.ep-sec-action {
  background: transparent;
  border: 1px solid var(--entity-border, var(--surface-border));
  color: var(--entity-text, var(--text-primary));
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
}
.ep-sec-action:hover { background: var(--entity-bg, var(--surface-hover)); filter: brightness(0.97); }
.ep-sec-empty {
  font-size: var(--font-xs);
  color: var(--text-muted);
  padding: var(--space-xs) 0;
}
</style>
