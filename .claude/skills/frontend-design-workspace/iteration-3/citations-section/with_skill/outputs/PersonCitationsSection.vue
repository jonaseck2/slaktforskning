<template>
  <div>
    <div v-if="citations.length === 0" class="empty-hint">{{ $t('citations.none') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('citations.source') }}</th>
          <th class="th-page">{{ $t('sourceDetail.page') }}</th>
          <th class="th-confidence">{{ $t('sourceDetail.confidence') }}</th>
          <th class="th-actions">{{ $t('common.actions') }}</th>
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
            <span v-else class="faint">{{ $t('common.unknown') }}</span>
          </td>
          <td class="td-page">{{ citation.page || '—' }}</td>
          <td class="td-confidence">
            <span v-if="citation.confidence != null" class="confidence-badge">
              {{ $t('confidenceLevels.' + citation.confidence) }}
            </span>
            <span v-else class="faint">—</span>
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
            <option v-for="source in sources" :key="source.id" :value="source.id">
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
          <select v-model.number="form.confidence">
            <option :value="3">{{ $t('confidenceLevels.3') }}</option>
            <option :value="2">{{ $t('confidenceLevels.2') }}</option>
            <option :value="1">{{ $t('confidenceLevels.1') }}</option>
            <option :value="0">{{ $t('confidenceLevels.0') }}</option>
          </select>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
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
}

interface SourceOption {
  id: string;
  title: string | null;
}

const props = defineProps<{ personId: string }>();

const { t } = useI18n();
const toast = useToast();

const citations = ref<CitationRow[]>([]);
const sources = ref<SourceOption[]>([]);
const showAddForm = ref(false);
const form = reactive<{ source_id: string; page: string; confidence: number }>({
  source_id: '',
  page: '',
  confidence: 3,
});

defineExpose({ openAddForm: () => { showAddForm.value = true; } });

async function load() {
  try {
    const raw = await window.api.citations.forPerson(props.personId) as CitationRow[];
    citations.value = raw;
  } catch (err) {
    console.error('[PersonCitationsSection] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function loadSources() {
  try {
    sources.value = await window.api.sources.list() as SourceOption[];
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
      confidence: form.confidence,
    });
    form.source_id = '';
    form.page = '';
    form.confidence = 3;
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

watch(() => props.personId, async () => {
  await Promise.all([load(), loadSources()]);
}, { immediate: true });
</script>

<style scoped>
.th-page,
.td-page { width: 120px; white-space: nowrap; }

.th-confidence,
.td-confidence { width: 160px; white-space: nowrap; }

.th-actions { text-align: right; width: 1px; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }

.confidence-badge {
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
}

.faint {
  color: var(--color-text-faint);
}
</style>
