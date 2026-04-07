<template>
  <div class="section">
    <h3>{{ $t('importExport.holgerTitle') }}</h3>
    <p class="section-desc">{{ $t('importExport.holgerDesc') }}</p>
    <div class="section-buttons">
      <button @click="holgerPickFile" :disabled="busy">{{ $t('importExport.holgerPickFile') }}</button>
      <button @click="holgerPickMedia" :disabled="busy">{{ $t('importExport.holgerPickMedia') }}</button>
      <button @click="handleImportFromHolger" :disabled="busy || !holgerSourcePath">{{ $t('importExport.holgerImport') }}</button>
    </div>
    <p v-if="holgerSourcePath" class="section-instructions">{{ holgerSourcePath }}<span v-if="holgerMediaDir"> + {{ holgerMediaDir }}</span></p>
    <p v-if="holgerProgress" class="section-progress">{{ holgerProgress }}</p>

    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <BaseModal v-if="showImportReport && importReport" @close="showImportReport = false">
      <h3>{{ $t('importExport.importReportTitle') }}</h3>
      <p class="report-version">{{ importReport.version && importReport.version !== 'unknown' ? 'GEDCOM ' + importReport.version : $t('importExport.importReportVersionUnknown') }}</p>
      <ul class="report-counts">
        <li>{{ $t('importExport.importReportPersons', { n: importReport.persons }) }}</li>
        <li>{{ $t('importExport.importReportFamilies', { n: importReport.families }) }}</li>
        <li>{{ $t('importExport.importReportEvents', { n: Object.values(importReport.events).reduce((a, b) => a + b, 0) }) }}</li>
        <li>{{ $t('importExport.importReportSources', { n: importReport.sources }) }}</li>
        <li>{{ $t('importExport.importReportPlaces', { n: importReport.places }) }}</li>
        <li>{{ $t('importExport.importReportCitations', { n: importReport.citations }) }}</li>
      </ul>
      <div v-if="Object.keys(importReport.events).length > 0" class="report-section">
        <ul class="report-event-list">
          <li v-for="(count, type) in importReport.events" :key="type">{{ type }}: {{ count }}</li>
        </ul>
      </div>
      <div v-if="importReport.warnings.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportWarnings') }}</p>
        <ul>
          <li v-for="(w, i) in importReport.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <div v-if="importReport.skipped.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportSkipped') }}</p>
        <ul>
          <li v-for="s in importReport.skipped" :key="s.tag">{{ s.tag }}: {{ s.count }}</li>
        </ul>
      </div>
      <div class="modal-actions">
        <button @click="showImportReport = false">{{ $t('importExport.importReportClose') }}</button>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BaseModal from '../BaseModal.vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const holgerSourcePath = ref('');
const holgerMediaDir = ref('');
const holgerProgress = ref('');
const showImportReport = ref(false);
const importReport = ref<{
  version?: string;
  persons: number; families: number; events: Record<string, number>;
  sources: number; places: number; citations: number;
  skipped: { tag: string; count: number }[];
  warnings: string[];
} | null>(null);

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function holgerPickFile() {
  const r = await window.api.import.holgerSelectFile() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerSourcePath.value = r.path;
}

async function holgerPickMedia() {
  const r = await window.api.import.holgerSelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerMediaDir.value = r.path;
}

async function handleImportFromHolger() {
  if (!holgerSourcePath.value) return;
  busy.value = true;
  holgerProgress.value = t('importExport.holgerRunning');
  window.api.import.onHolgerProgress((msg: string) => { holgerProgress.value = msg; });
  try {
    const result = await window.api.import.holgerRun({
      sourcePath: holgerSourcePath.value,
      mediaDir: holgerMediaDir.value || undefined,
    }) as {
      success: boolean;
      report?: {
        version?: string;
        persons: number; families: number; events: Record<string, number>;
        sources: number; places: number; citations: number;
        skipped: { tag: string; count: number }[];
        warnings: string[];
      };
      error?: string;
    };
    if (result.success && result.report) {
      importReport.value = result.report;
      showImportReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
    } else {
      setStatus(t('importExport.holgerError', { error: result.error ?? 'Unknown error' }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.holgerError', { error: err instanceof Error ? err.message : String(err) }), 'error');
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
    holgerProgress.value = '';
  }
}

</script>

<style scoped>
.section-instructions {
  font-size: var(--font-sm);
  color: #444;
  background: #f8f8f8;
  border-left: 3px solid var(--color-primary);
  padding: 8px 12px;
  border-radius: 0 4px 4px 0;
  margin: 0;
}

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

.modal-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
