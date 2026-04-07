<template>
  <div class="section">
    <h3>{{ $t('importExport.genneyTitle') }}</h3>

    <!-- Box 1: .backup -->
    <div class="import-box">
      <h4>{{ $t('importExport.genneyBackupTitle') }}</h4>
      <p class="box-desc">{{ $t('importExport.genneyBackupDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickBackup" :disabled="busy">{{ $t('importExport.genneyBackupPickFile') }}</button>
        <button @click="importBackup" :disabled="busy || !backupPath">{{ $t('importExport.genneyImport') }}</button>
      </div>
      <p v-if="backupPath" class="section-instructions">
        {{ backupPath }}
        <span class="media-badge">{{ $t('importExport.genneyBackupMediaAuto') }}</span>
      </p>
    </div>

    <!-- Box 2: .gcc -->
    <div class="import-box">
      <h4>{{ $t('importExport.genneyGccTitle') }}</h4>
      <p class="box-desc">{{ $t('importExport.genneyGccDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickGcc" :disabled="busy">{{ $t('importExport.genneyGccPickFile') }}</button>
        <button @click="pickGccMedia" :disabled="busy">{{ $t('importExport.genneyPickMedia') }}</button>
        <button @click="importGcc" :disabled="busy || !gccPath">{{ $t('importExport.genneyImport') }}</button>
      </div>
      <p v-if="gccPath || gccMediaDir" class="section-instructions">
        {{ gccPath }}<span v-if="gccMediaDir"> + {{ gccMediaDir }}</span>
      </p>
    </div>

    <!-- Box 3: .ged -->
    <div class="import-box">
      <h4>{{ $t('importExport.genneyGedTitle') }}</h4>
      <p class="box-desc">{{ $t('importExport.genneyGedDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickGedMedia" :disabled="busy">{{ $t('importExport.genneyPickMedia') }}</button>
        <button @click="importGed" :disabled="busy">{{ $t('importExport.genneyImport') }}</button>
      </div>
      <p v-if="gedMediaDir" class="section-instructions">{{ gedMediaDir }}</p>
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
const backupPath = ref('');
const gccPath = ref('');
const gccMediaDir = ref('');
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

async function pickBackup() {
  const r = await window.api.import.genneySelectArchive() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) backupPath.value = r.path;
}

async function pickGcc() {
  const r = await window.api.import.genneySelectArchive() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gccPath.value = r.path;
}

async function pickGccMedia() {
  const r = await window.api.import.genneySelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gccMediaDir.value = r.path;
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

async function importBackup() {
  if (!backupPath.value || busy.value) return;
  if (!await checkDocker()) return;
  await runDerbyImport(backupPath.value);
}

async function importGcc() {
  if (!gccPath.value || busy.value) return;
  if (!await checkDocker()) return;
  await runDerbyImport(gccPath.value, gccMediaDir.value || undefined);
}

async function importGed() {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await window.api.gedcom.import({
      profile: 'genney',
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
.import-box {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.import-box h4 {
  margin: 0;
  font-size: var(--font-base);
  font-weight: 600;
}

.box-desc {
  margin: 0;
  font-size: var(--font-sm);
  color: #555;
}

.media-badge {
  margin-left: 8px;
  font-size: var(--font-xs);
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 4px;
  padding: 2px 6px;
}

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

button:hover:not(:disabled) { opacity: 0.9; }
button:disabled { opacity: 0.5; cursor: not-allowed; }

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
