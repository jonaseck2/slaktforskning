<template>
  <div class="io-groups">

    <!-- Box 1: .backup — single step, imports immediately after file pick -->
    <div class="io-group">
      <h3>{{ $t('importExport.genneyBackupTitle') }}</h3>
      <p class="section-desc">{{ $t('importExport.genneyBackupDesc') }}</p>
      <button @click="pickAndImportBackup" :disabled="busy">{{ $t('importExport.genneyBackupPickFile') }}</button>
    </div>

    <!-- Box 2: .gcc — two steps: pick archive + optional media folder, then import -->
    <div class="io-group">
      <h3>{{ $t('importExport.genneyGccTitle') }}</h3>
      <p class="section-desc">{{ $t('importExport.genneyGccDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickGcc" :disabled="busy">{{ $t('importExport.genneyGccPickFile') }}</button>
        <button @click="pickGccMedia" :disabled="busy">{{ $t('importExport.genneyPickMedia') }}</button>
        <button @click="importGcc" :disabled="busy || !gccPath">{{ $t('importExport.genneyImport') }}</button>
      </div>
      <p v-if="gccPath || gccMediaDir" class="section-instructions">
        {{ gccPath }}<span v-if="gccMediaDir"> + {{ gccMediaDir }}</span>
      </p>
    </div>

    <!-- Box 3: .ged — three steps: pick file + optional media folder, then import -->
    <div class="io-group">
      <h3>{{ $t('importExport.genneyGedTitle') }}</h3>
      <p class="section-desc">{{ $t('importExport.genneyGedDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickGedFile" :disabled="busy">{{ $t('importExport.genneyGedPickFile') }}</button>
        <button @click="pickGedMedia" :disabled="busy">{{ $t('importExport.genneyPickMedia') }}</button>
        <button @click="importGed" :disabled="busy || !gedPath">{{ $t('importExport.genneyImport') }}</button>
      </div>
      <p v-if="gedPath || gedMediaDir" class="section-instructions">
        {{ gedPath }}<span v-if="gedMediaDir"> + {{ gedMediaDir }}</span>
      </p>
    </div>

    <!-- Shared progress + status -->
    <p v-if="genneyProgress" class="section-progress">{{ genneyProgress }}</p>
    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Import report modal (shared across all three flows) -->
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

// Per-box state
const gccPath = ref('');
const gccMediaDir = ref('');
const gedPath = ref('');
const gedMediaDir = ref('');

// Register progress listener once — shared by all Derby import flows
window.api.import.onProgress((msg: string) => { genneyProgress.value = msg; });

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function checkDocker(): Promise<boolean> {
  const r = await window.api.import.genneyCheckDocker() as { available: boolean };
  if (!r.available) {
    setStatus(t('importExport.genneyDerbyNoDocker'), 'error');
    return false;
  }
  return true;
}

async function pickGcc() {
  const r = await window.api.import.genneySelectArchive() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gccPath.value = r.path;
}

async function pickGccMedia() {
  const r = await window.api.import.genneySelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gccMediaDir.value = r.path;
}

async function pickGedFile() {
  const r = await window.api.gedcom.selectFile() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gedPath.value = r.path;
}

async function pickGedMedia() {
  const r = await window.api.import.genneySelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gedMediaDir.value = r.path;
}

async function runDerbyImport(sourcePath: string, mediaDir?: string) {
  busy.value = true;
  genneyProgress.value = t('importExport.genneyDerbyRunning');
  try {
    const result = await window.api.import.genneyRun({ sourcePath, mediaDir }) as {
      imported?: boolean;
      gedcomFallback?: boolean;
      summary?: ImportSummary;
      error?: string;
    };
    if (result.error) {
      setStatus(t('importExport.genneyDerbyError', { error: result.error }), 'error');
    } else if (result.imported && result.summary) {
      genneyReport.value = result.summary;
      showGenneyReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
    } else if (result.gedcomFallback) {
      setStatus(t('importExport.genneyDerbyFallback'), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.genneyDerbyError', { error: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    busy.value = false;
    genneyProgress.value = '';
  }
}

async function pickAndImportBackup() {
  if (busy.value) return;
  const r = await window.api.import.genneySelectArchive() as { canceled: boolean; path?: string };
  if (r.canceled || !r.path) return;
  if (!await checkDocker()) return;
  await runDerbyImport(r.path);
}

async function importGcc() {
  if (!gccPath.value || busy.value) return;
  if (!await checkDocker()) return;
  await runDerbyImport(gccPath.value, gccMediaDir.value || undefined);
}

async function importGed() {
  if (!gedPath.value || busy.value) return;
  busy.value = true;
  try {
    const result = await window.api.gedcom.import({
      profile: 'genney',
      filePath: gedPath.value,
      mediaDir: gedMediaDir.value || undefined,
    }) as { imported?: boolean; canceled?: boolean; filePath?: string };
    if (result.imported) {
      setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
      window.dispatchEvent(new CustomEvent('data-imported'));
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[GenneyImport] .ged import failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
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
