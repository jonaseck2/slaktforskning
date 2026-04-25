<template>
  <BaseSubPanel
    entity-type="person"
    :label="$t('persons.entity')"
    :title="displayTitle"
    :mode="mode"
    :has-sub="subPanel !== null"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
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
    </div>

    <!-- Events section -->
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
import { ENTITY_COLORS } from '../../constants/entityColors';

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
}>(), {
  mode: 'standalone',
  personId: null,
  prefillSurname: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [person: Person];
}>();

const { t } = useI18n();
const givenNameRef = ref<HTMLInputElement | null>(null);
const savedPersonId = ref<string | null>(props.personId);

const form = reactive({
  given_name: '',
  surname: props.prefillSurname ?? '',
  sex: 'U' as 'M' | 'F' | 'U',
});

const displayTitle = computed(() =>
  [form.given_name, form.surname].filter(Boolean).join(' ') || t('persons.newPerson')
);

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

async function handleSave() {
  if (!window.api) return;
  try {
    let person: Person;
    if (savedPersonId.value) {
      person = (await window.api.persons.update(savedPersonId.value, {
        sex: form.sex,
      })) as Person;
    } else {
      const result = (await window.api.persons.createWithEvent({
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
        living: true,
      })) as { person: Person };
      person = result.person;
      savedPersonId.value = person.id;
    }
    emit('saved', person);
  } catch (err) {
    console.error('[PersonModal] save failed:', err);
  }
}

onMounted(async () => {
  await loadData();
  nextTick(() => givenNameRef.value?.focus());
});
</script>
