<template>
  <label>
    {{ $t('events.eventType') }}
    <select v-model="event.event_type" required>
      <option value="" disabled>{{ $t('events.selectType') }}</option>
      <optgroup v-if="commonTypes.length > 0" :label="$t('events.commonTypes')">
        <option v-for="et in commonTypes" :key="et" :value="et">{{ $t('eventTypes.' + et) }}</option>
      </optgroup>
      <optgroup :label="commonTypes.length > 0 ? $t('events.allTypes') : undefined">
        <option v-for="et in otherTypes" :key="et" :value="et">{{ $t('eventTypes.' + et) }}</option>
      </optgroup>
    </select>
  </label>

  <label>{{ $t('events.date') }}</label>
  <DateInput
    v-model:dateType="event.date_type"
    v-model:dateValue="event.date_value"
    v-model:dateValueEnd="event.date_value_end"
    v-model:dateOriginal="event.date_original"
  />

  <label>
    {{ $t('events.place') }}
    <PlacePicker v-model="event.place_id" :placeholder="$t('events.placePlaceholder')" />
  </label>

  <label>
    {{ $t('events.description') }}
    <textarea
      ref="descRef"
      v-model="event.description"
      rows="2"
      :placeholder="$t('events.descriptionPlaceholder')"
      :style="descStoredHeight ? { height: descStoredHeight + 'px' } : undefined"
      @mouseup="persistDescHeight"
    />
  </label>

  <label v-if="CAUSE_APPLICABLE_TYPES.includes(event.event_type as EventTypeValue)">
    {{ $t('events.cause') }}
    <input v-model="event.cause" type="text" :placeholder="$t('events.causePlaceholder')" />
  </label>

  <!-- Citation section — New or Copy-from-existing -->
  <div class="citation-section">
    <div class="citation-section-header">{{ $t('citations.title') }}</div>

    <div class="entry-mode-toggle">
      <button
        type="button"
        :class="['toggle-btn', { active: citationMode === 'new' }]"
        @click="setCitationMode('new')"
      >
        {{ $t('citations.newCitation') }}
      </button>
      <button
        type="button"
        :class="['toggle-btn', { active: citationMode === 'copy' }]"
        @click="setCitationMode('copy')"
      >
        {{ $t('citations.copyFrom') }}
      </button>
    </div>

    <template v-if="citationMode === 'copy'">
      <label>
        {{ $t('citations.copyFromSource') }}
        <SourcePicker
          :model-value="copyFromSourceId"
          @update:model-value="onCopySourceChange"
        />
      </label>
      <label v-if="copyFromSourceId && copyCitationOptions.length > 0">
        {{ $t('citations.selectToCopy') }}
        <select
          :value="selectedCopyCitationId"
          @change="copyFromCitation(($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ $t('citations.selectToCopy') }}</option>
          <option v-for="c in copyCitationOptions" :key="c.id" :value="c.id">
            {{ c.page || '—' }}{{ c.date_accessed ? ' (' + c.date_accessed + ')' : '' }}
          </option>
        </select>
      </label>
    </template>

    <CitationFields :model="citation" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DateInput from './DateInput.vue';
import PlacePicker from './PlacePicker.vue';
import SourcePicker from './SourcePicker.vue';
import CitationFields from './CitationFields.vue';
import type { CitationFieldsModel } from './CitationFields.vue';
import { PERSON_EVENT_TYPE_VALUES, RELATIONSHIP_EVENT_TYPE_VALUES } from '../constants/eventTypes';
import type { EventTypeValue } from '../constants/eventTypes';
import { useTextareaHeight } from '../composables/useTextareaHeight';

export interface EventBodyData {
  event_type: string;
  date_type: string;
  date_value: string;
  date_value_end: string;
  date_original: string;
  place_id: string | null;
  description: string;
  cause: string;
}

const props = defineProps<{ context: 'person' | 'relationship' }>();

const event = defineModel<EventBodyData>('event', { required: true });
const citation = defineModel<CitationFieldsModel>('citation', { required: true });

const { t } = useI18n();

const { textareaRef: descRef, storedHeight: descStoredHeight, persistHeight: persistDescHeight } = useTextareaHeight('event-form-description');

const CAUSE_APPLICABLE_TYPES: readonly EventTypeValue[] = ['death'];

// Most commonly used event types — shown first with a separator
const COMMON_EVENT_TYPES: readonly EventTypeValue[] = [
  'birth', 'baptism', 'death', 'burial', 'marriage', 'residence', 'census', 'emigration', 'immigration',
];

const unsortedEventTypes = computed(() =>
  props.context === 'relationship' ? RELATIONSHIP_EVENT_TYPE_VALUES : PERSON_EVENT_TYPE_VALUES,
);

const commonTypes = computed(() =>
  COMMON_EVENT_TYPES.filter(et => (unsortedEventTypes.value as readonly string[]).includes(et)),
);

const otherTypes = computed(() =>
  [...unsortedEventTypes.value]
    .filter(et => !COMMON_EVENT_TYPES.includes(et) && et !== 'other')
    .sort((a, b) => t('eventTypes.' + a).localeCompare(t('eventTypes.' + b), undefined, { sensitivity: 'base' }))
    .concat(['other'] as typeof unsortedEventTypes.value[number][]),
);

// Copy-from-existing state (presentational — operates on citation model only)
const citationMode = ref<'new' | 'copy'>('new');
const copyFromSourceId = ref<string | null>(null);
const selectedCopyCitationId = ref<string>('');
interface CopyCitationOption {
  id: string;
  page: string | null;
  date_accessed: string | null;
  confidence: number;
  transcription: string | null;
  notes: string | null;
  source_id: string;
}
const copyCitationOptions = ref<CopyCitationOption[]>([]);

function setCitationMode(mode: 'new' | 'copy') {
  citationMode.value = mode;
  if (mode === 'new') {
    copyFromSourceId.value = null;
    selectedCopyCitationId.value = '';
    copyCitationOptions.value = [];
  }
}

async function onCopySourceChange(sourceId: string | null) {
  copyFromSourceId.value = sourceId;
  selectedCopyCitationId.value = '';
  copyCitationOptions.value = [];
  if (!sourceId || !window.api) return;
  copyCitationOptions.value = (await window.api.citations.forSource(sourceId)) as CopyCitationOption[];
}

function copyFromCitation(id: string) {
  selectedCopyCitationId.value = id;
  if (!id) return;
  const c = copyCitationOptions.value.find(x => x.id === id);
  if (!c) return;
  citation.value.source_id = c.source_id;
  citation.value.page = c.page ?? '';
  citation.value.confidence = c.confidence ?? 0;
  citation.value.transcription = c.transcription ?? '';
  citation.value.notes = c.notes ?? '';
  if (c.date_accessed) citation.value.date_accessed = c.date_accessed;
}
</script>

<style scoped>
.citation-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 12px;
}
.citation-section > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.citation-section-header {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
}
.entry-mode-toggle {
  display: flex;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.toggle-btn {
  flex: 1;
  padding: 6px 12px;
  background: var(--surface);
  border: none;
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--text-secondary);
  font-family: inherit;
}
.toggle-btn:hover:not(.active) {
  background: var(--surface-hover);
}
.toggle-btn.active {
  background: var(--accent);
  color: var(--accent-text);
}
</style>
