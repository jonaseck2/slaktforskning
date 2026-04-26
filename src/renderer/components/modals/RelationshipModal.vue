<template>
  <BaseSubPanel
    entity-type="relationship"
    :title="displayTitle"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Fields -->
    <div class="ep-fields">
      <!-- Type segmented control -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('common.type') }}</span>
        <div class="ep-seg">
          <button
            v-for="rt in RELATIONSHIP_TYPE_VALUES"
            :key="rt"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.type === rt }"
            @click="selectType(rt)"
          >{{ $t('relTypes.' + rt) }}</button>
        </div>
      </div>

      <!-- Subtype (conditional) -->
      <div v-if="form.type === 'couple'" class="ep-field">
        <span class="ep-field-label">{{ $t('relationshipDetail.subtype') }}</span>
        <select class="ep-input" v-model="form.subtype">
          <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
            {{ $t('coupleSubtypes.' + st) }}
          </option>
        </select>
      </div>
      <div v-if="form.type === 'parent_child'" class="ep-field">
        <span class="ep-field-label">{{ $t('relationshipDetail.subtype') }}</span>
        <select class="ep-input" v-model="form.subtype">
          <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">
            {{ $t('parentChildSubtypes.' + st) }}
          </option>
        </select>
      </div>

      <!-- Person 1 -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('relationships.person1') }}</span>
        <PersonPicker
          v-model="form.person1_id"
          :placeholder="$t('relationships.searchPerson')"
          @select="onPerson1Select"
        />
      </div>

      <!-- Person 2 -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('relationships.person2') }}</span>
        <PersonPicker
          v-model="form.person2_id"
          :placeholder="$t('relationships.searchPerson')"
          @select="onPerson2Select"
        />
      </div>

      <!-- Notes -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('common.notes') }}</span>
        <textarea
          class="ep-input"
          v-model="form.notes"
          rows="3"
          :placeholder="$t('relationshipDetail.notesPlaceholder')"
        />
      </div>
    </div>

    <!-- Events section (only visible after first save) -->
    <template v-if="savedRelationshipId">
      <div class="ep-sec-header" data-entity="event">
        <div class="ep-sec-left">
          <span class="ep-sec-title">📅 {{ $t('events.title') }}</span>
          <span class="ep-sec-count">{{ events.length }}</span>
        </div>
        <span class="ep-sec-open">›</span>
      </div>
      <div class="ep-sec-content">
        <input
          class="ep-search-input"
          :placeholder="$t('events.searchOrAdd')"
          readonly
          @click="openAddEvent"
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
      <div style="height:8px"></div>
    </template>

    <!-- Sub-panels -->
    <template #subpanels>
      <EventModal
        v-if="subPanel === 'event'"
        mode="subpanel"
        :relationship-id="savedRelationshipId ?? undefined"
        :editing-event="activeEvent || undefined"
        :default-event-type="form.type === 'couple' ? 'marriage' : 'other'"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onEventSaved"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import EventModal from './EventModal.vue';
import PersonPicker from '../PersonPicker.vue';
import {
  RELATIONSHIP_TYPE_VALUES,
  COUPLE_SUBTYPE_VALUES,
  PARENT_CHILD_SUBTYPE_VALUES,
} from '../../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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

interface RelationshipData {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string | null;
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  editingRelationship?: RelationshipData | null;
}>(), {
  mode: 'standalone',
  editingRelationship: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [relationship: RelationshipData];
}>();

const { t } = useI18n();

const savedRelationshipId = ref<string | null>(props.editingRelationship?.id ?? null);

const form = reactive({
  type: props.editingRelationship?.type ?? 'couple',
  subtype: props.editingRelationship?.subtype ?? 'marriage',
  person1_id: props.editingRelationship?.person1_id ?? null as string | null,
  person2_id: props.editingRelationship?.person2_id ?? null as string | null,
  notes: props.editingRelationship?.notes ?? '',
});

// Person names for the display title
const person1Name = ref<string | null>(null);
const person2Name = ref<string | null>(null);

const displayTitle = computed(() => {
  const p1 = person1Name.value;
  const p2 = person2Name.value;
  if (p1 && p2) return `${p1} & ${p2}`;
  if (p1) return p1;
  if (p2) return p2;
  return t('relationships.newRelationship');
});

function onPerson1Select(person: { given_name: string; surname: string }) {
  person1Name.value = [person.given_name, person.surname].filter(Boolean).join(' ') || null;
}

function onPerson2Select(person: { given_name: string; surname: string }) {
  person2Name.value = [person.given_name, person.surname].filter(Boolean).join(' ') || null;
}

function selectType(type: string) {
  form.type = type;
  // Reset subtype to sensible default when switching type
  if (type === 'couple') {
    form.subtype = 'marriage';
  } else if (type === 'parent_child') {
    form.subtype = 'biological';
  } else {
    form.subtype = '';
  }
}

// Events section
const events = ref<EventRow[]>([]);

async function loadEvents() {
  if (!savedRelationshipId.value || !window.api) return;
  try {
    events.value = (await window.api.events.forRelationship(savedRelationshipId.value)) as EventRow[];
  } catch { /* ignore */ }
}

// Sub-panel state
const subPanel = ref<'event' | null>(null);
const activeEvent = ref<EventRow | null>(null);

function openAddEvent() {
  activeEvent.value = null;
  subPanel.value = 'event';
}

function openEditEvent(ev: EventRow) {
  activeEvent.value = ev;
  subPanel.value = 'event';
}

function closeSubPanel() {
  subPanel.value = null;
  activeEvent.value = null;
}

async function onEventSaved() {
  closeSubPanel();
  await loadEvents();
}

// Load person names when editing an existing relationship
async function loadPersonNames() {
  if (!window.api) return;
  if (form.person1_id) {
    try {
      const names = (await window.api.persons.getNames(form.person1_id)) as Array<{ given_name: string; surname: string }>;
      if (names.length > 0) {
        person1Name.value = [names[0].given_name, names[0].surname].filter(Boolean).join(' ') || null;
      }
    } catch { /* ignore */ }
  }
  if (form.person2_id) {
    try {
      const names = (await window.api.persons.getNames(form.person2_id)) as Array<{ given_name: string; surname: string }>;
      if (names.length > 0) {
        person2Name.value = [names[0].given_name, names[0].surname].filter(Boolean).join(' ') || null;
      }
    } catch { /* ignore */ }
  }
}

// Save relationship
async function handleSave() {
  if (!window.api) return;
  try {
    let rel: RelationshipData;
    const payload = {
      type: form.type,
      person1_id: form.person1_id,
      person2_id: form.person2_id,
      subtype: form.subtype || null,
      notes: form.notes || null,
    };
    if (savedRelationshipId.value) {
      rel = (await window.api.relationships.update(savedRelationshipId.value, payload)) as RelationshipData;
    } else {
      rel = (await window.api.relationships.create(payload)) as RelationshipData;
      savedRelationshipId.value = rel.id;
    }
    emit('saved', rel);
  } catch (err) {
    console.error('[RelationshipModal] save failed:', err);
  }
}

// Watch person1_id changes to clear name when picker is cleared
watch(() => form.person1_id, (id) => {
  if (!id) person1Name.value = null;
});

watch(() => form.person2_id, (id) => {
  if (!id) person2Name.value = null;
});

onMounted(async () => {
  await loadPersonNames();
  await loadEvents();
});
</script>
