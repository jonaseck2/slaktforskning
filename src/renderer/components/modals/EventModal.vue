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
            :style="form.event_type === et ? { background: ENTITY_COLORS.event.hd, color: ENTITY_COLORS.event.fg } : {}"
            @click="form.event_type = et"
          >{{ $t('eventTypes.' + et) }}</button>
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': !QUICK_EVENT_TYPES.includes(form.event_type as QuickType) && !!form.event_type }"
            @click="showTypeDropdown = !showTypeDropdown"
          >…</button>
        </div>
        <select
          v-if="showTypeDropdown"
          class="ep-input"
          :style="{ marginTop: 'var(--space-xs)' }"
          v-model="form.event_type"
          @change="showTypeDropdown = false"
        >
          <option v-for="et in EVENT_TYPE_VALUES" :key="et" :value="et">
            {{ $t('eventTypes.' + et) }}
          </option>
        </select>
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
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('places.title') }}</span>
        <PlacePicker v-model="form.place_id" :placeholder="$t('events.placePlaceholder')" />
      </div>
      <div v-if="form.event_type === 'death'" class="ep-field">
        <span class="ep-field-label">{{ $t('events.cause') }}</span>
        <input class="ep-input" v-model="form.cause" :placeholder="$t('events.causePlaceholder')" />
      </div>
    </div>

    <!-- Sources section -->
    <div
      class="ep-sec-header"
      :style="{ background: ENTITY_COLORS.source.hd, borderBottomColor: ENTITY_COLORS.source.border }"
    >
      <div class="ep-sec-left">
        <span class="ep-sec-title" :style="{ color: ENTITY_COLORS.source.fg }">
          📚 {{ $t('sources.title') }}
        </span>
        <span class="ep-sec-count" :style="{ color: ENTITY_COLORS.source.fg }">{{ citations.length }}</span>
      </div>
      <span class="ep-sec-open" :style="{ color: ENTITY_COLORS.source.fg }">›</span>
    </div>
    <div class="ep-sec-content">
      <div class="ep-search-wrap">
        <input
          class="ep-search-input"
          v-model="sourceSearch"
          :placeholder="$t('sources.searchOrAdd')"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
          @keydown.down.prevent="highlightedIdx = Math.min(highlightedIdx + 1, searchResults.length)"
          @keydown.up.prevent="highlightedIdx = Math.max(highlightedIdx - 1, 0)"
          @keydown.enter.prevent="selectHighlighted"
          @keydown.esc="closeDropdown"
          @input="runSearch"
        />
        <div v-if="showDropdown" class="ep-dropdown">
          <div
            v-for="(src, i) in searchResults"
            :key="src.id"
            class="ep-dd-row"
            :class="{ 'ep-dd-row--hl': i === highlightedIdx }"
            @mousedown.prevent="openCitationFor(src.id, src.title)"
          >
            {{ src.title }}
            <span class="ep-dd-key">↩</span>
          </div>
          <div
            class="ep-dd-row ep-dd-row--create"
            :class="{ 'ep-dd-row--hl': highlightedIdx === searchResults.length }"
            @mousedown.prevent="openCreateSource"
          >
            + {{ $t('sources.createNewSource') }}
            <span class="ep-dd-key">↩</span>
          </div>
        </div>
      </div>

      <!-- Citations list -->
      <div v-for="cit in citations" :key="cit.id" class="ep-entity-row">
        <div class="ep-entity-main">
          <div class="ep-entity-name">{{ cit.sourceTitle }}</div>
          <div v-if="cit.page" class="ep-entity-sub">{{ cit.page }}</div>
        </div>
        <button
          type="button"
          class="btn-sm btn-delete"
          style="flex-shrink:0"
          :aria-label="$t('common.remove')"
          @click.stop="deleteCitation(cit.id)"
        >✕</button>
      </div>
    </div>

    <!-- Sub-panels -->
    <template #subpanels>
      <CitationModal
        v-if="subPanel === 'citation' && activeSrc"
        :source-id="activeSrc.id"
        :source-title="activeSrc.title"
        :event-id="savedEventId || undefined"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onCitationSaved"
      />
      <SourceModal
        v-if="subPanel === 'source'"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onSourceCreated"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import CitationModal from './CitationModal.vue';
import SourceModal from './SourceModal.vue';
import DateInput from '../DateInput.vue';
import PlacePicker from '../PlacePicker.vue';
import { ENTITY_COLORS } from '../../constants/entityColors';
import { EVENT_TYPE_VALUES } from '../../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const QUICK_EVENT_TYPES = ['birth', 'marriage', 'death'] as const;
type QuickType = typeof QUICK_EVENT_TYPES[number];

interface SourceRow { id: string; title: string; }
interface CitationRow { id: string; sourceTitle: string; page: string | null; }
interface EventData {
  id?: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  cause: string | null;
  description: string;
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string;
  relationshipId?: string;
  editingEvent?: EventData | null;
  defaultEventType?: string;
}>(), {
  mode: 'subpanel',
  editingEvent: null,
  defaultEventType: 'birth',
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [event: EventData];
}>();

const { t } = useI18n();

const savedEventId = ref<string | null>(props.editingEvent?.id ?? null);

const form = reactive<EventData>({
  id: props.editingEvent?.id,
  event_type: props.editingEvent?.event_type ?? props.defaultEventType,
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? null,
  date_value_end: props.editingEvent?.date_value_end ?? null,
  date_original: props.editingEvent?.date_original ?? '',
  place_id: props.editingEvent?.place_id ?? null,
  cause: props.editingEvent?.cause ?? null,
  description: props.editingEvent?.description ?? '',
});

const eventTitle = computed(() =>
  form.event_type ? t('eventTypes.' + form.event_type) : t('events.newEvent')
);
const showTypeDropdown = ref(false);

// Source search
const sourceSearch = ref('');
const searchResults = ref<SourceRow[]>([]);
const showDropdown = ref(false);
const highlightedIdx = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function runSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (!window.api) return;
    try {
      if (sourceSearch.value.trim()) {
        const all = (await window.api.sources.search(sourceSearch.value)) as SourceRow[];
        searchResults.value = all.slice(0, 5);
      } else {
        const all = (await window.api.sources.list()) as SourceRow[];
        searchResults.value = all.slice(0, 5);
      }
      showDropdown.value = true;
      highlightedIdx.value = 0;
    } catch { /* ignore */ }
  }, 150);
}

async function onSearchFocus() {
  if (!window.api) return;
  try {
    const all = (await window.api.sources.list()) as SourceRow[];
    searchResults.value = all.slice(0, 5);
    showDropdown.value = true;
    highlightedIdx.value = 0;
  } catch { /* ignore */ }
}

function onSearchBlur() {
  setTimeout(() => { showDropdown.value = false; }, 150);
}

function closeDropdown() {
  showDropdown.value = false;
}

function selectHighlighted() {
  if (!showDropdown.value) return;
  if (highlightedIdx.value < searchResults.value.length) {
    const src = searchResults.value[highlightedIdx.value];
    openCitationFor(src.id, src.title);
  } else {
    openCreateSource();
  }
}

// Sub-panel state
const subPanel = ref<'citation' | 'source' | null>(null);
const activeSrc = ref<SourceRow | null>(null);

function openCitationFor(sourceId: string, sourceTitle: string) {
  closeDropdown();
  sourceSearch.value = sourceTitle;
  activeSrc.value = { id: sourceId, title: sourceTitle };
  subPanel.value = 'citation';
}

function openCreateSource() {
  closeDropdown();
  subPanel.value = 'source';
}

function closeSubPanel() {
  subPanel.value = null;
  activeSrc.value = null;
  sourceSearch.value = '';
}

function onSourceCreated(sourceId: string, sourceTitle: string) {
  activeSrc.value = { id: sourceId, title: sourceTitle };
  subPanel.value = 'citation';
}

// Citations list
const citations = ref<CitationRow[]>([]);

async function loadCitations() {
  if (!savedEventId.value || !window.api) return;
  try {
    const raw = (await window.api.citations.forEvent(savedEventId.value)) as Array<{
      id: string; source_id: string; page: string | null;
    }>;
    const rows: CitationRow[] = [];
    for (const c of raw) {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      rows.push({ id: c.id, sourceTitle: src?.title ?? c.source_id, page: c.page });
    }
    citations.value = rows;
  } catch { /* ignore */ }
}

async function onCitationSaved() {
  closeSubPanel();
  await loadCitations();
}

async function deleteCitation(id: string) {
  if (!window.api) return;
  await window.api.citations.delete(id);
  await loadCitations();
}

onMounted(loadCitations);

// Save event
async function handleSave() {
  if (!window.api) return;
  try {
    let ev: EventData;
    if (savedEventId.value) {
      ev = (await window.api.events.update(savedEventId.value, {
        event_type: form.event_type,
        date_type: form.date_type,
        date_value: form.date_value || null,
        date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
        date_original: form.date_original,
        place_id: form.place_id,
        cause: form.event_type === 'death' ? form.cause : null,
        description: form.description,
      })) as EventData;
    } else {
      ev = (await window.api.events.create({
        event_type: form.event_type,
        date_type: form.date_type,
        date_value: form.date_value || null,
        date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
        date_original: form.date_original,
        place_id: form.place_id,
        cause: form.event_type === 'death' ? form.cause : null,
        description: form.description,
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
    }
    emit('saved', ev);
  } catch (err) {
    console.error('[EventModal] save failed:', err);
  }
}

function handleCancel() {
  emit('cancel');
}
</script>
