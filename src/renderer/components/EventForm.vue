<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-event">
      <h3 id="modal-title-event">{{ editingEvent ? $t('events.editEvent') : $t('events.addEventTitle') }}</h3>
      <form @submit.prevent="save">
        <label>
          {{ $t('events.eventType') }}
          <select v-model="form.event_type" required>
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
          v-model:dateType="form.date_type"
          v-model:dateValue="form.date_value"
          v-model:dateValueEnd="form.date_value_end"
          v-model:dateOriginal="form.date_original"
        />

        <label>
          {{ $t('events.place') }}
          <PlacePicker v-model="form.place_id" :placeholder="$t('events.placePlaceholder')" />
        </label>

        <label>
          {{ $t('events.description') }}
          <textarea
            ref="descRef"
            v-model="form.description"
            rows="2"
            :placeholder="$t('events.descriptionPlaceholder')"
            :style="descStoredHeight ? { height: descStoredHeight + 'px' } : undefined"
            @mouseup="persistDescHeight"
          />
        </label>

        <label v-if="CAUSE_APPLICABLE_TYPES.includes(form.event_type)">
          {{ $t('events.cause') }}
          <input v-model="form.cause" type="text" :placeholder="$t('events.causePlaceholder')" />
        </label>

        <!-- Citations section when editing -->
        <div v-if="editingEvent" class="citations-section">
          <div class="citations-label">{{ $t('citations.title') }}</div>
          <div v-if="existingCitations.length === 0" class="citations-empty">{{ $t('citations.none') }}</div>
          <div v-for="cit in existingCitations" :key="cit.id" class="citation-row">
            <span class="citation-source">{{ cit.sourceTitle }}</span>
            <span v-if="cit.page" class="citation-page">{{ cit.page }}</span>
            <AppButton variant="ghost" size="sm" @click="deleteCitation(cit.id)">✕</AppButton>
          </div>
        </div>

        <!-- Source — always visible, not behind a checkbox -->
        <div class="source-section">
          <label>
            {{ $t('citations.source') }}
            <SourcePicker v-model="sourceForm.source_id" />
          </label>
          <label>
            {{ $t('citations.pageLocation') }}
            <input v-model="sourceForm.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
          </label>
        </div>

        <div class="modal-actions">
          <span v-if="addedCount > 0" class="added-badge">
            {{ $t('events.eventsAdded', addedCount) }}
          </span>
          <AppButton variant="secondary" @click="$emit('close')">
            {{ $t('common.cancel') }}
          </AppButton>
          <AppButton v-if="!editing" variant="secondary" @click="saveAndAnother">
            {{ $t('events.saveAndAnother') }}
          </AppButton>
          <AppButton variant="primary" type="submit">
            {{ editing ? $t('events.updateEvent') : $t('events.addEvent') }}
          </AppButton>
        </div>
      </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import DateInput from './DateInput.vue';
import PlacePicker from './PlacePicker.vue';
import SourcePicker from './SourcePicker.vue';
import { PERSON_EVENT_TYPE_VALUES, RELATIONSHIP_EVENT_TYPE_VALUES } from '../constants/eventTypes';
import type { EventTypeValue } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { useSourceSession } from '../stores/sourceSession';
import { useTextareaHeight } from '../composables/useTextareaHeight';

const { textareaRef: descRef, storedHeight: descStoredHeight, persistHeight: persistDescHeight } = useTextareaHeight('event-form-description');

const CAUSE_APPLICABLE_TYPES: readonly EventTypeValue[] = ['death'];

// Most commonly used event types — shown first with a separator
const COMMON_EVENT_TYPES: readonly EventTypeValue[] = [
  'birth', 'baptism', 'death', 'burial', 'marriage', 'residence', 'census', 'emigration', 'immigration',
];

interface EventData {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  description: string;
  cause: string | null;
}

interface CitationRow {
  id: string;
  source_id: string;
  sourceTitle: string;
  page: string | null;
}

const props = defineProps<{
  personId?: string;
  relationshipId?: string;
  editingEvent?: EventData | null;
  defaultEventType?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();

const editing = computed(() => !!props.editingEvent);
const addedCount = ref(0);

const unsortedEventTypes = props.relationshipId ? RELATIONSHIP_EVENT_TYPE_VALUES : PERSON_EVENT_TYPE_VALUES;

// Split into common (top) and other (bottom) groups
const commonTypes = computed(() =>
  COMMON_EVENT_TYPES.filter(et => (unsortedEventTypes as readonly string[]).includes(et))
);
const otherTypes = computed(() =>
  [...unsortedEventTypes]
    .filter(et => !COMMON_EVENT_TYPES.includes(et) && et !== 'other')
    .sort((a, b) => t('eventTypes.' + a).localeCompare(t('eventTypes.' + b), undefined, { sensitivity: 'base' }))
    .concat(['other'] as typeof unsortedEventTypes[number][])
);

const form = reactive({
  event_type: props.editingEvent?.event_type ?? props.defaultEventType ?? '',
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? '',
  date_value_end: props.editingEvent?.date_value_end ?? '',
  date_original: props.editingEvent?.date_original ?? '',
  place_id: (props.editingEvent?.place_id ?? null) as string | null,
  description: props.editingEvent?.description ?? '',
  cause: props.editingEvent?.cause ?? '',
});

const sourceForm = reactive({ source_id: null as string | null, page: '' });
const existingCitations = ref<CitationRow[]>([]);

onMounted(async () => {
  if (!window.api) return;
  if (sourceSession.lastSourceId) {
    sourceForm.source_id = sourceSession.lastSourceId;
  }
  if (props.editingEvent) {
    await loadCitations();
  }
});

async function loadCitations() {
  if (!props.editingEvent || !window.api) return;
  const raw = (await window.api.citations.forEvent(props.editingEvent.id)) as Array<{
    id: string; source_id: string; page: string | null;
  }>;
  existingCitations.value = await Promise.all(
    raw.map(async (c) => {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      return { id: c.id, source_id: c.source_id, sourceTitle: src?.title ?? c.source_id, page: c.page };
    }),
  );
}

async function deleteCitation(id: string) {
  if (!window.api) return;
  try {
    await window.api.citations.delete(id);
    await loadCitations();
  } catch (err) {
    console.error('[EventForm] deleteCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

async function doSave(): Promise<boolean> {
  if (!window.api) return false;
  try {
    const data: Record<string, unknown> = {
      event_type: form.event_type,
      date_type: form.date_type,
      date_value: form.date_value || null,
      date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
      date_original: form.date_original,
      place_id: form.place_id || null,
      description: form.description,
      cause: CAUSE_APPLICABLE_TYPES.includes(form.event_type as EventTypeValue) ? (form.cause || null) : null,
    };

    if (props.relationshipId) data.relationship_id = props.relationshipId;

    let eventId: string;
    if (props.editingEvent) {
      await window.api.events.update(props.editingEvent.id, data);
      eventId = props.editingEvent.id;
    } else {
      const event = (await window.api.events.create(data)) as { id: string };
      eventId = event.id;
      if (props.personId && eventId) {
        await window.api.eventParticipants.add({
          event_id: eventId,
          person_id: props.personId,
          role: 'primary',
        });
      }
    }

    if (sourceForm.source_id && eventId) {
      const citData: Record<string, unknown> = {
        source_id: sourceForm.source_id,
        page: sourceForm.page,
        confidence: 2,
        event_id: eventId,
      };
      if (props.personId) citData.person_id = props.personId;
      await window.api.citations.create(citData);
      sourceSession.setLastUsed(sourceForm.source_id, sourceForm.page);
    }

    return true;
  } catch (err) {
    console.error('[EventForm] save failed:', err);
    toast.error(t('errors.saveFailed'));
    return false;
  }
}

async function save() {
  if (await doSave()) {
    emit('saved');
    emit('close');
  }
}

async function saveAndAnother() {
  if (await doSave()) {
    emit('saved');
    // Reset event-specific fields but keep place, source, page for rapid entry
    form.event_type = '';
    form.date_type = 'exact';
    form.date_value = '';
    form.date_value_end = '';
    form.date_original = '';
    form.description = '';
    form.cause = '';
    // Keep: form.place_id, sourceForm.source_id, sourceForm.page
    existingCitations.value = [];
    addedCount.value++;
  }
}
</script>

<style scoped>
.source-section {
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 8px;
}
.citations-section {
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 8px;
  margin-bottom: 4px;
}
.citations-label {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}
.citations-empty {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-bottom: 4px;
}
.citation-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  margin-bottom: 4px;
}
.citation-source {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.citation-page {
  color: var(--text-secondary);
  flex-shrink: 0;
}
.added-badge {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-right: auto;
}
</style>
