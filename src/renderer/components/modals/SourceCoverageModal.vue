<!--
  Add/edit a `source_coverage_events` row (T24 — GEDCOM SOUR/DATA/EVEN).

  Coverage describes what *kinds* of events / date ranges / places a source
  spans as a whole — e.g. "Östergötland parish register covers BIRT events
  1850-1920 in Östergötland". Distinct from a citation, which attaches a
  source to one specific authored event.
-->
<template>
  <BaseSubPanel
    entity-type="source"
    :title="modalTitle"
    :mode="mode"
    :save-disabled="!form.event_type || saving"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <label class="ep-field-label" for="cov-field-type">{{ $t('sourceCoverage.eventType') }}</label>
        <select id="cov-field-type" class="ep-input" v-model="form.event_type">
          <option value="" disabled>{{ $t('events.selectType') }}</option>
          <option v-for="et in sortedEventTypes" :key="et" :value="et">
            {{ $t('eventTypes.' + et) }}
          </option>
        </select>
      </div>
      <div class="ep-field-row">
        <div class="ep-field">
          <label class="ep-field-label" for="cov-field-from">{{ $t('sourceCoverage.dateFrom') }}</label>
          <input
            id="cov-field-from"
            class="ep-input"
            v-model="form.date_value_from"
            type="text"
            placeholder="YYYY"
          />
        </div>
        <div class="ep-field">
          <label class="ep-field-label" for="cov-field-to">{{ $t('sourceCoverage.dateTo') }}</label>
          <input
            id="cov-field-to"
            class="ep-input"
            v-model="form.date_value_to"
            type="text"
            placeholder="YYYY"
          />
        </div>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sourceCoverage.place') }}</span>
        <PlacePicker v-model="form.place_id" :placeholder="$t('sourceCoverage.place')" />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="cov-field-notes">{{ $t('sourceCoverage.notes') }}</label>
        <textarea
          id="cov-field-notes"
          class="ep-input"
          v-model="form.notes"
          rows="3"
        />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PlacePicker from '../PlacePicker.vue';
import { useToast } from '../../composables/useToast';
import { EVENT_TYPE_VALUES } from '../../constants/eventTypes';
import type { SourceCoverageEvent } from '../../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  sourceId: string;
  editing?: SourceCoverageEvent | null;
}>(), {
  mode: 'standalone',
  editing: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [coverage: SourceCoverageEvent];
}>();

const { t, locale } = useI18n();
const toast = useToast();
const saving = ref(false);

const form = reactive<{
  event_type: string;
  date_value_from: string;
  date_value_to: string;
  place_id: string | null;
  notes: string;
}>({
  event_type: props.editing?.event_type ?? '',
  date_value_from: props.editing?.date_value_from ?? '',
  date_value_to: props.editing?.date_value_to ?? '',
  place_id: props.editing?.place_id ?? null,
  notes: props.editing?.notes ?? '',
});

const sortedEventTypes = computed(() => {
  const collator = new Intl.Collator(locale.value);
  return [...EVENT_TYPE_VALUES].sort((a, b) =>
    collator.compare(t(`eventTypes.${a}`), t(`eventTypes.${b}`)),
  );
});

const modalTitle = computed(() =>
  props.editing ? t('sourceCoverage.editTitle') : t('sourceCoverage.addTitle'),
);

async function handleSave() {
  if (!form.event_type) return;
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = {
      event_type: form.event_type,
      date_value_from: form.date_value_from.trim(),
      date_value_to: form.date_value_to.trim(),
      place_id: form.place_id,
      notes: form.notes,
    };
    let row: SourceCoverageEvent;
    if (props.editing) {
      row = (await window.api.sourceCoverage.update(props.editing.id, payload)) as SourceCoverageEvent;
    } else {
      row = (await window.api.sourceCoverage.create({
        source_id: props.sourceId,
        ...payload,
      })) as SourceCoverageEvent;
    }
    emit('saved', row);
  } catch (err) {
    console.error('[SourceCoverageModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.ep-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}
</style>
