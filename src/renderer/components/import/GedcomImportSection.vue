<template>
  <div class="section">
    <h3>{{ $t('importExport.gedcomImportTitle') }}</h3>
    <p class="section-desc">{{ $t('importExport.gedcomImportDesc') }}</p>
    <button @click="handleImportGedcom" :disabled="busy">{{ $t('gedcom.import') }}</button>
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
      <div v-if="importReport.rawCounts" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportRawCounts') }}</p>
        <ul class="report-counts">
          <li>{{ $t('importExport.importReportRawIndividuals', { raw: importReport.rawCounts.individuals, imported: importReport.persons }) }}</li>
          <li>{{ $t('importExport.importReportRawFamilies', { raw: importReport.rawCounts.families, imported: importReport.families }) }}</li>
          <li>{{ $t('importExport.importReportRawSources', { raw: importReport.rawCounts.sources, imported: importReport.sources }) }}</li>
          <li v-if="importReport.rawCounts.repositories > 0">{{ $t('importExport.importReportRawRepositories', { n: importReport.rawCounts.repositories }) }}</li>
          <li v-if="importReport.rawCounts.notes > 0">{{ $t('importExport.importReportRawNotes', { n: importReport.rawCounts.notes }) }}</li>
        </ul>
      </div>
      <div v-if="importReport.unmappedData && importReport.unmappedData.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportNotImported') }}</p>
        <ul>
          <li v-for="item in importReport.unmappedData" :key="item.category">{{ item.category }}: {{ item.count }}</li>
        </ul>
      </div>
      <div v-if="importReport.modelLimitations && importReport.modelLimitations.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportModelLimitations') }}</p>
        <ul>
          <li v-for="(lim, i) in importReport.modelLimitations" :key="i">{{ lim }}</li>
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
const showImportReport = ref(false);
const importReport = ref<{
  version?: string;
  persons: number; families: number; events: Record<string, number>;
  sources: number; places: number; citations: number;
  skipped: { tag: string; count: number }[];
  warnings: string[];
  rawCounts?: {
    individuals: number; families: number; sources: number;
    repositories: number; notes: number; objects: number; submitters: number;
  };
  tagStats?: { tag: string; occurrences: number }[];
  unmappedData?: { category: string; count: number; example?: string }[];
  modelLimitations?: string[];
} | null>(null);

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handleImportGedcom() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.import()) as {
      imported?: boolean;
      canceled?: boolean;
      filePath?: string;
      report?: {
        version?: string;
        persons: number;
        families: number;
        events: Record<string, number>;
        sources: number;
        places: number;
        citations: number;
        skipped: { tag: string; count: number }[];
        warnings: string[];
      };
    };
    if (result.imported) {
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (result.report) {
        importReport.value = result.report;
        showImportReport.value = true;
      } else {
        setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
      }
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[ImportExport] GEDCOM import failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.section {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
}

.section h3 {
  margin: 0;
  font-size: var(--font-md);
}

.section-desc {
  font-size: var(--font-sm);
  color: #666;
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

.status {
  font-size: var(--font-sm);
  padding: 8px 12px;
  border-radius: 4px;
}

.status.success {
  background: #d1fae5;
  color: #065f46;
}

.status.error {
  background: var(--color-danger-bg);
  color: #991b1b;
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

.report-event-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: var(--font-sm);
  color: #666;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
