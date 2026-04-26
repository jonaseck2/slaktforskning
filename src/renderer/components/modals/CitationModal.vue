<template>
  <BaseSubPanel
    entity-type="citation"
    :title="modalTitle"
    :mode="mode"
    :save-label="$t('common.save') + (mode === 'subpanel' ? ' ↩' : '')"
    :hide-save="phase === 'pick-source'"
    @cancel="$emit('cancel')"
    @save="save"
    @close="$emit('close')"
  >
    <!-- Phase A: pick a source first (standalone create with no preset) -->
    <div v-if="phase === 'pick-source'" class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.source') }}</span>
        <SourcePicker
          :model-value="pickedSourceId"
          @update:model-value="pickedSourceId = $event"
          @select="onSourceSelected"
          @create-new="openSourceCreate"
        />
      </div>
    </div>

    <!-- Phase B: citation fields, with source card at the bottom -->
    <div v-else class="ep-fields">
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

      <!-- Source entity card -->
      <div class="ep-source-card" data-entity="source">
        <span class="ep-source-card-icon" aria-hidden="true">📚</span>
        <div class="ep-source-card-body">
          <span class="ep-source-card-label">{{ $t('citations.source') }}</span>
          <span class="ep-source-card-title">{{ pickedSourceTitle || $t('citations.selectSource') }}</span>
        </div>
        <button
          v-if="pickedSourceId"
          class="ep-source-card-action"
          type="button"
          :title="$t('common.edit')"
          @click="openSourceEdit({ id: pickedSourceId, title: pickedSourceTitle })"
        >✎</button>
        <button
          v-if="canChangeSource"
          class="ep-source-card-action"
          type="button"
          @click="resetSource"
        >{{ $t('citations.changeSource') }}</button>
      </div>
    </div>

    <template #subpanels>
      <SourceModal
        v-if="showSourceModal"
        mode="subpanel"
        :editing-source="editingSourceForModal"
        :initial-title="editingSourceForModal ? undefined : pendingTitle"
        @saved="onSourceModalSaved"
        @cancel="showSourceModal = false"
        @close="showSourceModal = false"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, nextTick, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import SourcePicker from '../SourcePicker.vue';
import SourceModal from './SourceModal.vue';
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

const { t } = useI18n();

const pageRef = ref<HTMLInputElement | null>(null);

// Source sub-panel
const showSourceModal = ref(false);
const pendingTitle = ref('');
interface EditSource { id: string; title: string; }
const editingSourceForModal = ref<EditSource | null>(null);

function openSourceCreate(title: string) {
  editingSourceForModal.value = null;
  pendingTitle.value = title;
  showSourceModal.value = true;
}

function openSourceEdit(source: EditSource) {
  editingSourceForModal.value = source;
  pendingTitle.value = '';
  showSourceModal.value = true;
}

function onSourceModalSaved(sourceId: string, sourceTitle: string) {
  pickedSourceId.value = sourceId;
  pickedSourceTitle.value = sourceTitle;
  showSourceModal.value = false;
}
const sourceSession = useSourceSession();

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

// ── Phases ─────────────────────────────────────────────────────────────────
// Phase A ('pick-source'): no source picked yet, user must choose one.
// Phase B ('edit-citation'): a source is set, edit citation fields.
//
// canChangeSource is true only in standalone-create flows where the parent
// did not preset a source — those are the only cases the user can step back
// to phase A.
const isStandaloneCreate = !props.sourceId && !props.editingCitation;
const phase = computed<'pick-source' | 'edit-citation'>(() =>
  pickedSourceId.value ? 'edit-citation' : 'pick-source'
);
const canChangeSource = computed(() => isStandaloneCreate);

const citedEntityName = ref('');

const modalTitle = computed(() => {
  if (phase.value === 'pick-source') return t('citations.chooseSourceTitle');
  const base = pickedSourceTitle.value || t('citations.addTitle');
  return citedEntityName.value
    ? t('citations.titleFor', { title: base, name: citedEntityName.value })
    : base;
});

async function loadCitedEntityName() {
  if (!window.api) return;
  try {
    if (props.eventId) {
      const ev = (await window.api.events.get(props.eventId)) as { event_type: string } | null;
      if (ev) citedEntityName.value = t('eventTypes.' + ev.event_type);
    } else if (props.personId) {
      const names = (await window.api.persons.getNames(props.personId)) as Array<{ given_name: string; surname: string }>;
      const primary = names[0];
      if (primary) citedEntityName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
    } else if (props.relationshipId) {
      const rel = (await window.api.relationships.get(props.relationshipId)) as { person1_id: string | null; person2_id: string | null } | null;
      if (rel) {
        const labels: string[] = [];
        for (const id of [rel.person1_id, rel.person2_id]) {
          if (!id) continue;
          const nm = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string }>;
          const p = nm[0];
          if (p) labels.push([p.given_name, p.surname].filter(Boolean).join(' '));
        }
        citedEntityName.value = labels.join(' & ');
      }
    } else if (props.placeId) {
      const place = (await window.api.places.get(props.placeId)) as { name: string } | null;
      if (place) citedEntityName.value = place.name;
    }
  } catch { /* ignore */ }
}

function resetSource() {
  pickedSourceId.value = null;
  pickedSourceTitle.value = '';
}

// Focus the page field when entering edit-citation phase.
watch(phase, (p) => {
  if (p === 'edit-citation') nextTick(() => pageRef.value?.focus());
});

onMounted(async () => {
  // Pre-fill source from session when no source was preset by parent.
  if (!props.sourceId && !props.editingCitation && sourceSession.lastSourceId) {
    pickedSourceId.value = sourceSession.lastSourceId;
    try {
      const src = (await window.api.sources.get(sourceSession.lastSourceId)) as SourceRow | null;
      if (src) pickedSourceTitle.value = src.title;
    } catch { /* non-critical */ }
  }
  await loadCitedEntityName();
  if (phase.value === 'edit-citation') {
    nextTick(() => pageRef.value?.focus());
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

<style scoped>
.ep-source-card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--entity-bg);
  border: 1px solid var(--entity-border);
  border-left: 3px solid var(--entity-text);
  border-radius: var(--radius-md);
}
.ep-source-card-icon {
  font-size: var(--font-lg);
  flex-shrink: 0;
}
.ep-source-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ep-source-card-label {
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--entity-text);
}
.ep-source-card-title {
  font-size: var(--font-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-source-card-action {
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-xs);
  padding: var(--space-xs) var(--space-sm);
  line-height: 1;
}
.ep-source-card-action:hover {
  background: var(--surface);
  color: var(--text-primary);
}
</style>
