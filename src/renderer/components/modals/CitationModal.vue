<template>
  <BaseSubPanel
    entity-type="citation"
    :label="$t('citations.entity')"
    :title="sourceTitle"
    mode="subpanel"
    :save-label="$t('common.save') + ' ↩'"
    @cancel="$emit('cancel')"
    @save="save"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.sourceTitle') }}</span>
        <div class="ep-field-readonly">{{ sourceTitle }}</div>
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
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, nextTick, onMounted } from 'vue';
import BaseSubPanel from './BaseSubPanel.vue';
import { ENTITY_COLORS } from '../../constants/entityColors';
import { CONFIDENCE_LEVEL_VALUES } from '../../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  sourceId: string;
  sourceTitle: string;
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

const form = reactive({
  page: '',
  confidence: 2 as 0 | 1 | 2 | 3,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});

onMounted(() => nextTick(() => pageRef.value?.focus()));

async function save() {
  if (!window.api) return;
  try {
    const data: Record<string, unknown> = {
      source_id: props.sourceId,
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
    emit('saved');
  } catch (err) {
    console.error('[CitationModal] save failed:', err);
  }
}
</script>
