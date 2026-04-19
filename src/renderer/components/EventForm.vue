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
          <div v-if="existingCitations.length === 0" class="citations-empty">{{ $t('empty.citations') }}</div>
          <div v-for="cit in existingCitations" :key="cit.id" class="citation-row">
            <span class="citation-source">{{ cit.sourceTitle }}</span>
            <span v-if="cit.page" class="citation-page">{{ cit.page }}</span>
            <AppButton variant="ghost" size="sm" @click="deleteCitation(cit.id)">✕</AppButton>
          </div>
        </div>

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

          <CitationFields :model="citationForm" />
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
import CitationFields from './CitationFields.vue';
import type { CitationFieldsModel } from './CitationFields.vue';
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

const citationForm = reactive<CitationFieldsModel>({
  source_id: null,
  page: '',
  confidence: 0,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});
const existingCitations = ref<CitationRow[]>([]);

// Copy-from-existing state
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
  citationForm.source_id = c.source_id;
  citationForm.page = c.page ?? '';
  citationForm.confidence = c.confidence ?? 0;
  citationForm.transcription = c.transcription ?? '';
  citationForm.notes = c.notes ?? '';
  if (c.date_accessed) citationForm.date_accessed = c.date_accessed;
}

onMounted(async () => {
  if (!window.api) return;
  if (sourceSession.lastSourceId) {
    citationForm.source_id = sourceSession.lastSourceId;
    if (sourceSession.lastPage) citationForm.page = sourceSession.lastPage;
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

    if (citationForm.source_id && eventId) {
      const citData: Record<string, unknown> = {
        source_id: citationForm.source_id,
        page: citationForm.page,
        confidence: citationForm.confidence,
        transcription: citationForm.transcription,
        notes: citationForm.notes,
        date_accessed: citationForm.date_accessed,
        event_id: eventId,
      };
      if (props.personId) citData.person_id = props.personId;
      await window.api.citations.create(citData);
      sourceSession.setLastUsed(citationForm.source_id, citationForm.page);
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
    // Keep: form.place_id, citationForm.source_id, citationForm.page
    existingCitations.value = [];
    addedCount.value++;
  }
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
