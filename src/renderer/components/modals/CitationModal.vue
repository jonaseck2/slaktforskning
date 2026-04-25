<template>
  <BaseSubPanel
    entity-type="citation"
    :title="pickedSourceTitle || $t('citations.addTitle')"
    :mode="mode"
    :save-label="$t('common.save') + (mode === 'subpanel' ? ' ↩' : '')"
    @cancel="$emit('cancel')"
    @save="save"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.sourceTitle') }}</span>
        <div v-if="props.sourceId" class="ep-field-readonly">{{ props.sourceTitle }}</div>
        <SourcePicker
          v-else
          :model-value="pickedSourceId"
          @update:model-value="pickedSourceId = $event"
          @select="onSourceSelected"
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.pageLocation') }}</span>
        <input
          ref="pageRef"
          class="ep-input"
          v-model="form.page"
          :placeholder="$t('citations.pagePlaceholder')"
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.confidence') }}</span>
        <div class="ep-seg">
          <button
            v-for="level in CONFIDENCE_LEVEL_VALUES"
            :key="level"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.confidence === level }"
            :style="form.confidence === level ? { background: ENTITY_COLORS.citation.hd, color: ENTITY_COLORS.citation.fg } : {}"
            @click="form.confidence = level"
          >{{ $t('confidenceLevels.' + level) }}</button>
        </div>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.transcription') }}</span>
        <textarea
          class="ep-textarea"
          v-model="form.transcription"
          :placeholder="$t('citations.transcriptionPlaceholder')"
          rows="2"
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.notes') }}</span>
        <input class="ep-input" v-model="form.notes" :placeholder="$t('citations.notesPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.dateAccessed') }}</span>
        <input class="ep-input" type="date" v-model="form.date_accessed" />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, nextTick, onMounted } from 'vue';
import BaseSubPanel from './BaseSubPanel.vue';
import SourcePicker from '../SourcePicker.vue';
import { ENTITY_COLORS } from '../../constants/entityColors';
import { CONFIDENCE_LEVEL_VALUES } from '../../constants/eventTypes';
import { useSourceSession } from '../../stores/sourceSession';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  mode?: 'subpanel' | 'standalone';
  sourceId?: string;
  sourceTitle?: string;
  editingCitation?: {
    id: string;
    page: string;
    confidence: number;
    transcription: string;
    notes: string;
    date_accessed: string;
  } | null;
  eventId?: string;
  personId?: string;
  relationshipId?: string;
  placeId?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [];
}>();

const pageRef = ref<HTMLInputElement | null>(null);
const sourceSession = useSourceSession();

// When sourceId is preset by parent (e.g. EventModal), use it directly.
// When not preset (e.g. PlacePanel), allow source picking via SourcePicker.
const pickedSourceId = ref<string | null>(props.sourceId ?? null);
const pickedSourceTitle = ref(props.sourceTitle ?? '');

interface SourceRow { id: string; title: string; }
function onSourceSelected(source: SourceRow) {
  pickedSourceTitle.value = source.title;
}

const form = reactive({
  page: props.editingCitation?.page ?? '',
  confidence: (props.editingCitation?.confidence ?? 2) as 0 | 1 | 2 | 3,
  transcription: props.editingCitation?.transcription ?? '',
  notes: props.editingCitation?.notes ?? '',
  date_accessed: props.editingCitation?.date_accessed ?? new Date().toISOString().slice(0, 10),
});

const mode = props.mode ?? 'subpanel';

onMounted(async () => {
  nextTick(() => pageRef.value?.focus());
  // Pre-fill source from session when no source was preset
  if (!props.sourceId && sourceSession.lastSourceId) {
    pickedSourceId.value = sourceSession.lastSourceId;
    // Fetch title for the pre-filled source so the picker displays it
    try {
      const src = (await window.api.sources.get(sourceSession.lastSourceId)) as SourceRow | null;
      if (src) pickedSourceTitle.value = src.title;
    } catch { /* non-critical */ }
  }
});

async function save() {
  if (!window.api) return;
  if (!pickedSourceId.value && !props.editingCitation) return;
  try {
    if (props.editingCitation) {
      await window.api.citations.update(props.editingCitation.id, {
        page: form.page,
        confidence: form.confidence,
        transcription: form.transcription,
        notes: form.notes,
        date_accessed: form.date_accessed,
      });
    } else {
      const data: Record<string, unknown> = {
        source_id: pickedSourceId.value,
        page: form.page,
        confidence: form.confidence,
        transcription: form.transcription,
        notes: form.notes,
        date_accessed: form.date_accessed,
      };
      if (props.eventId)        data.event_id        = props.eventId;
      if (props.personId)       data.person_id       = props.personId;
      if (props.relationshipId) data.relationship_id = props.relationshipId;
      if (props.placeId)        data.place_id        = props.placeId;

      await window.api.citations.create(data);
      if (pickedSourceId.value) sourceSession.setLastUsed(pickedSourceId.value, form.page);
    }
    emit('saved');
  } catch (err) {
    console.error('[CitationModal] save failed:', err);
  }
}
</script>
