<template>
  <BaseSubPanel
    entity-type="person"
    :title="displayTitle"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Entry-mode toggle (only when addRelatedTo is set) -->
    <div v-if="addRelatedTo" class="ep-fields">
      <div class="ep-field">
        <div class="ep-seg">
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': entryMode === 'new' }"
            :style="entryMode === 'new' ? { background: ENTITY_COLORS.person.hd, color: ENTITY_COLORS.person.fg } : {}"
            @click="entryMode = 'new'; existingPersonId = null"
          >{{ $t('addRelated.newPerson') }}</button>
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': entryMode === 'existing' }"
            :style="entryMode === 'existing' ? { background: ENTITY_COLORS.person.hd, color: ENTITY_COLORS.person.fg } : {}"
            @click="entryMode = 'existing'"
          >{{ $t('addRelated.existingPerson') }}</button>
        </div>
      </div>
    </div>

    <!-- Existing person picker (only when addRelatedTo + entryMode=existing) -->
    <div v-if="addRelatedTo && entryMode === 'existing'" class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('addRelated.selectPerson') }}</span>
        <PersonPicker
          :model-value="existingPersonId"
          :placeholder="$t('addRelated.searchPlaceholder')"
          @update:model-value="existingPersonId = $event"
        />
      </div>

      <!-- Subtype (existing person path) -->
      <div v-if="addRelatedTo" class="ep-field">
        <span class="ep-field-label">{{ addRelatedTo.mode === 'spouse' ? $t('personDetail.coupleSubtype') : $t('relationshipDetail.subtype') }}</span>
        <select class="ep-input" v-model="form.subtype">
          <template v-if="addRelatedTo.mode === 'spouse'">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
          </template>
          <template v-else>
            <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('parentChildSubtypes.' + st) }}</option>
          </template>
        </select>
      </div>
    </div>

    <!-- New person fields (always shown unless addRelatedTo+existing) -->
    <template v-if="!addRelatedTo || entryMode === 'new'">
      <!-- Fields -->
      <div class="ep-fields">
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('persons.name') }}</span>
          <div class="ep-name-row">
            <input
              ref="givenNameRef"
              class="ep-input ep-input--name"
              v-model="form.given_name"
              :placeholder="$t('persons.givenName')"
            />
            <input
              class="ep-input ep-input--name"
              v-model="form.surname"
              :placeholder="$t('persons.surname')"
            />
          </div>
        </div>
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('persons.sex') }}</span>
          <div class="ep-seg">
            <button
              v-for="[val, key] in SEX_OPTIONS"
              :key="val"
              type="button"
              class="ep-seg-opt"
              :class="{ 'ep-seg-opt--on': form.sex === val }"
              :style="form.sex === val ? { background: ENTITY_COLORS.person.hd, color: ENTITY_COLORS.person.fg } : {}"
              @click="form.sex = val as 'M' | 'F' | 'U'"
            >{{ $t(key) }}</button>
          </div>
        </div>
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('persons.living') }}</span>
          <div class="ep-seg">
            <button
              type="button"
              class="ep-seg-opt"
              :class="{ 'ep-seg-opt--on': form.living }"
              :style="form.living ? { background: ENTITY_COLORS.person.hd, color: ENTITY_COLORS.person.fg } : {}"
              @click="form.living = true"
            >{{ $t('personDetail.statusLiving') }}</button>
            <button
              type="button"
              class="ep-seg-opt"
              :class="{ 'ep-seg-opt--on': !form.living }"
              :style="!form.living ? { background: ENTITY_COLORS.person.hd, color: ENTITY_COLORS.person.fg } : {}"
              @click="form.living = false"
            >{{ $t('personDetail.statusDeceased') }}</button>
          </div>
        </div>

        <!-- Subtype (new person path, when addRelatedTo is set) -->
        <div v-if="addRelatedTo" class="ep-field">
          <span class="ep-field-label">{{ addRelatedTo.mode === 'spouse' ? $t('personDetail.coupleSubtype') : $t('relationshipDetail.subtype') }}</span>
          <select class="ep-input" v-model="form.subtype">
            <template v-if="addRelatedTo.mode === 'spouse'">
              <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
            </template>
            <template v-else>
              <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('parentChildSubtypes.' + st) }}</option>
            </template>
          </select>
        </div>
      </div>

      <!-- Embedded event section (only for new persons, before the Events section) -->
      <div v-if="!savedPersonId" class="ep-event-inline">
        <details class="ep-event-details" :open="eventSectionOpen" @toggle="onEventToggle">
          <summary class="ep-event-summary">{{ $t('events.addEvent') }}</summary>
          <div class="ep-event-body">
            <EventFormBody
              v-model:event="eventForm"
              v-model:citation="citationForm"
              context="person"
            />
          </div>
        </details>
      </div>
    </template>

    <!-- Events section (shown only after person is saved) -->
    <template v-if="savedPersonId">
      <div
        class="ep-sec-header"
        :style="{ background: ENTITY_COLORS.event.hd, borderBottomColor: ENTITY_COLORS.event.border }"
      >
        <div class="ep-sec-left">
          <span class="ep-sec-title" :style="{ color: ENTITY_COLORS.event.fg }">
            📅 {{ $t('events.title') }}
          </span>
          <span class="ep-sec-count" :style="{ color: ENTITY_COLORS.event.fg }">{{ events.length }}</span>
        </div>
        <span class="ep-sec-open" :style="{ color: ENTITY_COLORS.event.fg }">›</span>
      </div>
      <div class="ep-sec-content">
        <input
          class="ep-search-input"
          :placeholder="$t('events.searchOrAdd')"
          @click="openAddEvent"
          readonly
        />
        <div
          v-for="ev in events"
          :key="ev.id"
          class="ep-entity-row"
          @click="openEditEvent(ev)"
        >
          <div class="ep-entity-main">
            <div class="ep-entity-name">{{ $t('eventTypes.' + ev.event_type) }}</div>
            <div class="ep-entity-sub">
              {{ ev.date_value || '' }}{{ ev.place_name ? ' · ' + ev.place_name : '' }}
            </div>
          </div>
          <span class="ep-entity-arrow">›</span>
        </div>
      </div>

      <div class="ep-sec-gap"></div>

      <!-- Relationships section -->
      <div
        class="ep-sec-header"
        :style="{ background: ENTITY_COLORS.relationship.hd, borderBottomColor: ENTITY_COLORS.relationship.border }"
      >
        <div class="ep-sec-left">
          <span class="ep-sec-title" :style="{ color: ENTITY_COLORS.relationship.fg }">
            🔗 {{ $t('relationships.title') }}
          </span>
          <span class="ep-sec-count" :style="{ color: ENTITY_COLORS.relationship.fg }">{{ relationships.length }}</span>
        </div>
        <span class="ep-sec-open" :style="{ color: ENTITY_COLORS.relationship.fg }">›</span>
      </div>
      <div class="ep-sec-content">
        <input class="ep-search-input" :placeholder="$t('relationships.searchOrAdd')" readonly />
        <div v-for="rel in relationships" :key="rel.id" class="ep-entity-row">
          <div class="ep-entity-main">
            <div class="ep-entity-name">{{ rel.label }}</div>
            <div class="ep-entity-sub">{{ rel.sub }}</div>
          </div>
          <span class="ep-entity-arrow">›</span>
        </div>
      </div>
      <div style="height:8px"></div>
    </template>

    <!-- Sub-panels -->
    <template #subpanels>
      <EventModal
        v-if="subPanel === 'event'"
        mode="subpanel"
        :person-id="savedPersonId || undefined"
        :editing-event="activeEvent || undefined"
        :default-event-type="defaultEventType"
        @cancel="subPanel = null"
        @close="subPanel = null"
        @saved="onEventSaved"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import EventModal from './EventModal.vue';
import EventFormBody from '../EventFormBody.vue';
import PersonPicker from '../PersonPicker.vue';
import type { CitationFieldsModel } from '../CitationFields.vue';
import { ENTITY_COLORS } from '../../constants/entityColors';
import { COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../../constants/eventTypes';
import { suggestNextEventType } from '../../utils/eventDefaults';
import { useToast } from '../../composables/useToast';
import { useSourceSession } from '../../stores/sourceSession';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const SEX_OPTIONS: [string, string][] = [
  ['M', 'persons.male'],
  ['F', 'persons.female'],
  ['U', 'persons.sexUnknown'],
];

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name: string | null;
  cause: string | null;
  description: string;
}

interface RelRow { id: string; label: string; sub: string; }
interface Person { id: string; sex: string; living: boolean; }

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string | null;
  prefillSurname?: string | null;
  prefillPlaceId?: string | null;
  addRelatedTo?: {
    personId: string;
    mode: 'father' | 'mother' | 'spouse' | 'child';
    personSex?: 'M' | 'F' | 'U';
    personSurname?: string;
  } | null;
}>(), {
  mode: 'standalone',
  personId: null,
  prefillSurname: null,
  prefillPlaceId: null,
  addRelatedTo: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [person: Person];
}>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();
const givenNameRef = ref<HTMLInputElement | null>(null);
const savedPersonId = ref<string | null>(props.personId);

// ── Add-related state ───────────────────────────────────────────────────────
const entryMode = ref<'new' | 'existing'>('new');
const existingPersonId = ref<string | null>(null);

function defaultSex(): 'M' | 'F' | 'U' {
  if (!props.addRelatedTo) return 'U';
  const m = props.addRelatedTo.mode;
  if (m === 'father') return 'M';
  if (m === 'mother') return 'F';
  if (m === 'spouse') {
    if (props.addRelatedTo.personSex === 'M') return 'F';
    if (props.addRelatedTo.personSex === 'F') return 'M';
    return 'U';
  }
  return 'U';
}

function defaultSurname(): string {
  if (props.prefillSurname) return props.prefillSurname;
  if (props.addRelatedTo?.mode === 'child' && props.addRelatedTo.personSurname) {
    return props.addRelatedTo.personSurname;
  }
  return '';
}

function defaultSubtype(): string {
  if (props.addRelatedTo?.mode === 'spouse') return 'unknown';
  if (props.addRelatedTo) return 'biological';
  return '';
}

const form = reactive({
  given_name: '',
  surname: defaultSurname(),
  sex: defaultSex(),
  living: true,
  subtype: defaultSubtype(),
});

const displayTitle = computed(() => {
  if (props.addRelatedTo) {
    const m = props.addRelatedTo.mode;
    if (m === 'father') return t('personDetail.addFatherTitle');
    if (m === 'mother') return t('personDetail.addMotherTitle');
    if (m === 'spouse') return t('personDetail.addSpouseTitle');
    return t('personDetail.addChildTitle');
  }
  return [form.given_name, form.surname].filter(Boolean).join(' ') || t('persons.newPerson');
});

// ── Embedded event form ─────────────────────────────────────────────────────
const eventSectionOpen = ref(!!props.prefillPlaceId);

const eventForm = reactive({
  event_type: '' as string,
  date_type: 'exact',
  date_value: '',
  date_value_end: '',
  date_original: '',
  place_id: (props.prefillPlaceId ?? null) as string | null,
  description: '',
  cause: '',
});

const citationForm = reactive<CitationFieldsModel>({
  source_id: null,
  page: '',
  confidence: 2,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});

function onEventToggle(e: Event) {
  eventSectionOpen.value = (e.target as HTMLDetailsElement).open;
}

// ── Events + relationships (loaded after person exists) ─────────────────────
const events = ref<EventRow[]>([]);
const relationships = ref<RelRow[]>([]);

async function loadData() {
  if (!savedPersonId.value || !window.api) return;
  try {
    events.value = (await window.api.events.forPerson(savedPersonId.value)) as EventRow[];
    const rels = (await window.api.relationships.getForPerson(savedPersonId.value)) as Array<{
      id: string; type: string; subtype: string | null;
    }>;
    relationships.value = rels.map(r => ({
      id: r.id,
      label: t('relationshipTypes.' + r.type),
      sub: r.subtype ? t('coupleSubtypes.' + r.subtype) : '',
    }));
  } catch { /* ignore */ }
}

const subPanel = ref<'event' | null>(null);
const activeEvent = ref<EventRow | null>(null);
const defaultEventType = ref('birth');

function openAddEvent() {
  defaultEventType.value = 'birth';
  activeEvent.value = null;
  subPanel.value = 'event';
}

function openEditEvent(ev: EventRow) {
  activeEvent.value = ev;
  subPanel.value = 'event';
}

async function onEventSaved() {
  subPanel.value = null;
  await loadData();
}

// ── Save ────────────────────────────────────────────────────────────────────
async function handleSave() {
  if (!window.api) return;
  try {
    let person: Person;

    if (savedPersonId.value) {
      // Edit mode
      person = (await window.api.persons.update(savedPersonId.value, {
        sex: form.sex,
        living: form.living,
      })) as Person;
    } else if (props.addRelatedTo && entryMode.value === 'existing') {
      // Link existing person
      if (!existingPersonId.value) return;
      person = (await window.api.persons.get(existingPersonId.value)) as Person;
    } else {
      // Create new person (with optional embedded event)
      const payload: Record<string, unknown> = {
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
        living: form.living,
      };

      if (eventSectionOpen.value && eventForm.event_type) {
        payload.event = {
          event_type: eventForm.event_type,
          date_type: eventForm.date_type,
          date_value: eventForm.date_value || null,
          date_value_end: eventForm.date_type === 'between' ? (eventForm.date_value_end || null) : null,
          date_original: eventForm.date_original,
          place_id: eventForm.place_id,
          place_name: null,
          description: eventForm.description,
          cause: eventForm.event_type === 'death' ? (eventForm.cause || null) : null,
        };
        if (citationForm.source_id) {
          payload.citation = {
            source_id: citationForm.source_id,
            page: citationForm.page,
            confidence: citationForm.confidence,
            transcription: citationForm.transcription,
            notes: citationForm.notes,
            date_accessed: citationForm.date_accessed,
          };
          sourceSession.setLastUsed(citationForm.source_id, citationForm.page);
        }
      }

      const result = (await window.api.persons.createWithEvent(payload)) as { person: Person };
      person = result.person;
      savedPersonId.value = person.id;
    }

    // Create relationship (when addRelatedTo is set)
    if (props.addRelatedTo) {
      const targetPersonId = (props.addRelatedTo && entryMode.value === 'existing')
        ? existingPersonId.value!
        : (savedPersonId.value ?? person.id);

      const relData: Record<string, unknown> = {};
      const m = props.addRelatedTo.mode;
      if (m === 'father' || m === 'mother') {
        relData.type = 'parent_child';
        relData.person1_id = targetPersonId;        // parent
        relData.person2_id = props.addRelatedTo.personId; // child
        relData.subtype = form.subtype;
      } else if (m === 'child') {
        relData.type = 'parent_child';
        relData.person1_id = props.addRelatedTo.personId; // parent
        relData.person2_id = targetPersonId;        // child
        relData.subtype = form.subtype;
      } else {
        relData.type = 'couple';
        relData.person1_id = props.addRelatedTo.personId;
        relData.person2_id = targetPersonId;
        relData.subtype = form.subtype;
      }
      await window.api.relationships.create(relData);
    }

    emit('saved', person);
    if (props.addRelatedTo) emit('close');
  } catch (err) {
    console.error('[PersonModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(async () => {
  // Load smart-defaults setting for embedded event type
  if (!savedPersonId.value && !props.addRelatedTo) {
    let smartDefaultsEnabled = true;
    if (window.api) {
      try {
        const raw = (await window.api.db.getSetting('event_defaults_config')) as string | null;
        if (raw) {
          const parsed = JSON.parse(raw) as { smartDefaults?: boolean };
          if (typeof parsed.smartDefaults === 'boolean') {
            smartDefaultsEnabled = parsed.smartDefaults;
          }
        }
      } catch {
        smartDefaultsEnabled = true;
      }
    }
    eventForm.event_type = suggestNextEventType([], smartDefaultsEnabled);
  } else if (props.addRelatedTo) {
    // For related persons default event type is birth
    eventForm.event_type = 'birth';
  }

  // Pre-fill citation from source session
  if (sourceSession.lastSourceId) {
    citationForm.source_id = sourceSession.lastSourceId;
    if (sourceSession.lastPage) citationForm.page = sourceSession.lastPage;
  }

  await loadData();
  nextTick(() => givenNameRef.value?.focus());
});
</script>

<style scoped>
.ep-event-inline {
  padding: 0 12px 8px;
}
.ep-event-details {
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}
.ep-event-summary {
  cursor: pointer;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
  user-select: none;
  list-style: none;
}
.ep-event-summary::-webkit-details-marker { display: none; }
.ep-event-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
