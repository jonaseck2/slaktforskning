<template>
  <div class="section">
    <h3>{{ $t('importExport.genneyTitle') }}</h3>
    <p class="section-desc">{{ $t('importExport.genneyDesc') }}</p>
    <div class="section-buttons">
      <button @click="handleGenneyDerby('archive')" :disabled="busy">
        {{ $t('importExport.genneyDerbySelectArchive') }}
      </button>
      <button @click="handleImportFromGenney" :disabled="busy">{{ $t('gedcom.genneyPickFile') }}</button>
    </div>
    <p v-if="genneyProgress" class="section-progress">{{ genneyProgress }}</p>
    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Genney import report modal -->
    <BaseModal v-if="showGenneyReport && genneyReport" @close="showGenneyReport = false">
      <h3>{{ $t('importExport.genneyReportTitle') }}</h3>
      <ul class="report-counts">
        <li>{{ $t('importExport.genneyReportPersons', { n: genneyReport.persons }) }}</li>
        <li>{{ $t('importExport.genneyReportCoupleRels', { n: genneyReport.coupleRelationships }) }}</li>
        <li>{{ $t('importExport.genneyReportParentChildRels', { n: genneyReport.parentChildRelationships }) }}</li>
        <li>{{ $t('importExport.genneyReportEvents', { n: genneyReport.events }) }}</li>
        <li>{{ $t('importExport.genneyReportPlaces', { n: genneyReport.places }) }}</li>
        <li>{{ $t('importExport.genneyReportSources', { n: genneyReport.sources }) }}</li>
        <li>{{ $t('importExport.genneyReportCitations', { n: genneyReport.citations }) }}</li>
      </ul>
      <div v-if="genneyReport.warnings.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportWarnings') }}</p>
        <ul>
          <li v-for="(w, i) in genneyReport.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <div v-if="genneyReport.skipped.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportSkipped') }}</p>
        <ul>
          <li v-for="s in genneyReport.skipped" :key="s.category">
            <strong>{{ s.category }}</strong> ({{ s.count }}): {{ s.reason }}
          </li>
        </ul>
      </div>
      <div class="modal-actions">
        <button @click="showGenneyReport = false">{{ $t('importExport.importReportClose') }}</button>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import BaseModal from '../BaseModal.vue';
import type { ImportSummary } from '../../../import/genney/transform';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const genneyProgress = ref('');
const showGenneyReport = ref(false);
const genneyReport = ref<ImportSummary | null>(null);

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handleGenneyDerby(mode: 'folder' | 'archive') {
  if (busy.value) return;

  const dockerCheck = await window.api.import.genneyCheckDocker() as { available: boolean };
  if (!dockerCheck.available) {
    setStatus(t('importExport.genneyDerbyNoDocker'), 'error');
    return;
  }

  const picked = mode === 'folder'
    ? await window.api.import.genneySelectDerby() as { canceled: boolean; path?: string }
    : await window.api.import.genneySelectArchive() as { canceled: boolean; path?: string };
  if (picked.canceled || !picked.path) return;

  busy.value = true;
  genneyProgress.value = t('importExport.genneyDerbyRunning');

  window.api.import.onProgress((msg: string) => { genneyProgress.value = msg; });

  try {
    const result = await window.api.import.genneyRun({ sourcePath: picked.path }) as {
      imported?: boolean;
      gedcomFallback?: boolean;
      gedcomPath?: string;
      summary?: {
        persons: number; coupleRelationships: number; parentChildRelationships: number;
        events: number; places: number; sources: number; citations: number;
        groups: number; repositories: number; researchTasks: number; media: number;
        warnings: string[];
        skipped: { category: string; count: number; reason: string }[];
      };
      error?: string;
    };

    if (result.gedcomFallback) {
      genneyProgress.value = t('importExport.genneyDerbyFallback');
      const gedResult = await window.api.gedcom.import({ profile: 'genney' }) as { imported?: boolean; canceled?: boolean; filePath?: string };
      if (gedResult.imported) {
        setStatus(t('importExport.importSuccess', { file: gedResult.filePath ?? '' }));
        window.dispatchEvent(new CustomEvent('data-imported'));
      }
    } else if (result.imported && result.summary) {
      genneyReport.value = result.summary;
      showGenneyReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
    } else if (result.error) {
      setStatus(t('importExport.genneyDerbyError', { error: result.error }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.genneyDerbyError', { error: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    busy.value = false;
    genneyProgress.value = '';
  }
}

async function handleImportFromGenney() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.import({ profile: 'genney' })) as { imported?: boolean; canceled?: boolean; filePath?: string };
    if (result.imported) {
      setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
      window.dispatchEvent(new CustomEvent('data-imported'));
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[ImportExport] Genney import failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
button {
  align-self: flex-start;
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-sm);
  font-family: inherit;
}

button:hover:not(:disabled) {
  opacity: 0.9;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:deep(.modal) {
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.report-counts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-base);
}

.report-section {
  border-top: 1px solid #eee;
  padding-top: 8px;
}

.report-section-label {
  margin: 0 0 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: #555;
}

.report-section ul {
  margin: 0;
  padding-left: 16px;
  font-size: var(--font-sm);
  color: #444;
}
</style>
