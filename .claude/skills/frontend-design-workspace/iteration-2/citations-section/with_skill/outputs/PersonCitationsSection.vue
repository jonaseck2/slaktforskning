<template>
  <div>
    <div v-if="citations.length === 0" class="empty-hint">{{ $t('citations.none') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('citations.source') }}</th>
          <th class="th-shrink">{{ $t('sourceDetail.page') }}</th>
          <th class="th-shrink">{{ $t('sourceDetail.confidence') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="citation in citations" :key="citation.id">
          <td>
            <router-link
              v-if="citation.source_id"
              :to="'/sources/' + citation.source_id"
              class="person-link"
              @click.stop
            >{{ citation.source_title || $t('common.unknown') }}</router-link>
            <span v-else>{{ $t('common.unknown') }}</span>
          </td>
          <td class="td-shrink">{{ citation.page || '—' }}</td>
          <td class="td-shrink">
            <span v-if="citation.confidence != null" class="confidence-badge">
              {{ $t('confidenceLevels.' + citation.confidence) }}
            </span>
            <span v-else>—</span>
          </td>
          <td class="actions-cell">
            <button class="btn-sm btn-delete" @click="remove(citation.id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>

    <BaseModal v-if="showAddForm" @close="showAddForm = false">
      <h3>{{ $t('citations.addTitle') }}</h3>
      <form @submit.prevent="add">
        <label>
          {{ $t('citations.source') }} *
          <select v-model="form.source_id" required autofocus>
            <option value="" disabled>{{ $t('citations.selectSource') }}</option>
            <option v-for="source in availableSources" :key="source.id" :value="source.id">
              {{ source.title || $t('common.unknown') }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('citations.pageLocation') }}
          <input v-model="form.page" type="text" :placeholder="$t('citations.pagePlaceholder')" />
        </label>
        <label>
          {{ $t('citations.confidence') }}
          <select v-model="form.confidence">
            <option :value="null">—</option>
            <option :value="3">{{ $t('confidenceLevels.3') }}</option>
            <option :value="2">{{ $t('confidenceLevels.2') }}</option>
            <option :value="1">{{ $t('confidenceLevels.1') }}</option>
            <option :value="0">{{ $t('confidenceLevels.0') }}</option>
          </select>
        </label>
        <label>
          {{ $t('citations.transcription') }}
          <textarea
            v-model="form.transcription"
            rows="3"
            :placeholder="$t('citations.transcriptionPlaceholder')"
          />
        </label>
        <label>
          {{ $t('citations.notes') }}
          <textarea
            v-model="form.notes"
            rows="2"
            :placeholder="$t('citations.notesPlaceholder')"
          />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="showAddForm = false">
            {{ $t('common.cancel') }}
          </button>
          <button type="submit">{{ $t('common.save') }}</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { useToast } from '../composables/useToast';

export interface CitationRow {
  id: string;
  source_id: string;
  source_title: string | null;
  page: string | null;
  confidence: number | null;
  transcription: string | null;
  notes: string | null;
}

interface SourceOption {
  id: string;
  title: string | null;
}

const props = defineProps<{ personId: string }>();

const { t } = useI18n();
const toast = useToast();

const citations = ref<CitationRow[]>([]);
const availableSources = ref<SourceOption[]>([]);
const showAddForm = ref(false);
const form = reactive<{
  source_id: string;
  page: string;
  confidence: number | null;
  transcription: string;
  notes: string;
}>({
  source_id: '',
  page: '',
  confidence: null,
  transcription: '',
  notes: '',
});

defineExpose({ openAddForm: () => { showAddForm.value = true; loadSources(); } });

async function load() {
  try {
    const raw = (await window.api.citations.forPerson(props.personId)) as Array<{
      id: string;
      source_id: string;
      page?: string | null;
      confidence?: number | null;
      transcription?: string | null;
      notes?: string | null;
    }>;

    // Enrich with source titles in a single batch
    const sourceIds = [...new Set(raw.map((c) => c.source_id).filter(Boolean))];
    const sourceMap = new Map<string, string | null>();

    await Promise.all(
      sourceIds.map(async (sid) => {
        try {
          const src = (await window.api.sources.get(sid)) as { title?: string | null } | null;
          sourceMap.set(sid, src?.title ?? null);
        } catch {
          sourceMap.set(sid, null);
        }
      }),
    );

    citations.value = raw.map((c) => ({
      id: c.id,
      source_id: c.source_id,
      source_title: sourceMap.get(c.source_id) ?? null,
      page: c.page ?? null,
      confidence: c.confidence ?? null,
      transcription: c.transcription ?? null,
      notes: c.notes ?? null,
    }));
  } catch (err) {
    console.error('[PersonCitationsSection] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function loadSources() {
  try {
    availableSources.value = (await window.api.sources.list()) as SourceOption[];
  } catch (err) {
    console.error('[PersonCitationsSection] loadSources failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function add() {
  if (!form.source_id) return;
  try {
    await window.api.citations.create({
      source_id: form.source_id,
      person_id: props.personId,
      page: form.page || undefined,
      confidence: form.confidence ?? undefined,
      transcription: form.transcription || undefined,
      notes: form.notes || undefined,
    });
    form.source_id = '';
    form.page = '';
    form.confidence = null;
    form.transcription = '';
    form.notes = '';
    showAddForm.value = false;
    await load();
  } catch (err) {
    console.error('[PersonCitationsSection] add failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function remove(id: string) {
  if (!confirm(t('citations.confirmDelete'))) return;
  try {
    await window.api.citations.delete(id);
    await load();
  } catch (err) {
    console.error('[PersonCitationsSection] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.th-shrink,
.td-shrink {
  width: 1%;
  white-space: nowrap;
}
.confidence-badge {
  background: var(--color-bg-muted);
  color: var(--color-text-subtle);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  white-space: nowrap;
}
</style>
