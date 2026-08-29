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
        <button @click="importGcc" :disabled="busy || gccPaths.length === 0">{{ $t('importExport.genneyImport') }}</button>
      </div>
      <p v-if="gccPaths.length > 0 || gccMediaDir" class="section-instructions">
        {{ gccPaths.join(', ') }}<span v-if="gccMediaDir"> + {{ gccMediaDir }}</span>
      </p>
    </div>

    <!-- Box 3: .ged — three steps: pick file + optional media folder, then import -->
    <div class="io-group">
      <h3>{{ $t('importExport.genneyGedTitle') }}</h3>
      <p class="section-desc">{{ $t('importExport.genneyGedDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickGedFile" :disabled="busy">{{ $t('importExport.genneyGedPickFile') }}</button>
        <button @click="pickGedMedia" :disabled="busy">{{ $t('importExport.genneyPickMedia') }}</button>
        <button @click="importGed" :disabled="busy || gedPaths.length === 0">{{ $t('importExport.genneyImport') }}</button>
      </div>
      <p v-if="gedPaths.length > 0 || gedMediaDir" class="section-instructions">
        {{ gedPaths.join(', ') }}<span v-if="gedMediaDir"> + {{ gedMediaDir }}</span>
      </p>
    </div>

    <!-- Shared progress + status -->
    <p v-if="genneyProgress" class="section-progress">{{ genneyProgress }}</p>
    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Import report modal (shared across all three flows) -->
    <BaseSubPanel
      v-if="showGenneyReport && genneyReport"
      entity-type="neutral"
      :title="$t('importExport.genneyReportTitle')"
      label=""
      mode="standalone"
      hide-save
      :cancel-label="$t('common.close')"
      @cancel="showGenneyReport = false"
      @close="showGenneyReport = false"
    >
      <div class="report-body">
        <div v-if="queueOutcomes.length > 1" class="report-section">
          <p class="report-section-label">{{ $t('importExport.queueFilesLabel', { count: queueOutcomes.length }) }}</p>
          <ul>
            <li v-for="o in queueOutcomes" :key="o.file">
              <template v-if="o.error">{{ $t('importExport.queueFileFailed', { file: baseName(o.file), error: o.error }) }}</template>
              <template v-else>{{ baseName(o.file) }}</template>
            </li>
          </ul>
        </div>
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
      </div>
    </BaseSubPanel>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import BaseSubPanel from '../modals/BaseSubPanel.vue';
import type { ImportSummary } from '../../../import/genney/transform';
import { runImportQueue } from './import-queue';

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

// Per-box state. Paths are arrays: a researcher with four exports picks them
// in one action. A single pick behaves exactly as before.
const gccPaths = ref<string[]>([]);
const gccMediaDir = ref('');
const gedPaths = ref<string[]>([]);
const gedMediaDir = ref('');
const queueOutcomes = ref<{ file: string; error: string | null }[]>([]);
const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

// Register progress listener once — shared by all Derby import flows
window.api.import.onProgress((msg: string) => { genneyProgress.value = msg; });

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

// Upfront Docker probe removed (2026-05-15): the importer detects
// Docker / local Java / GEDCOM-fallback internally and surfaces a
// specific error if none of the paths work. The previous pre-flight
// check called a renderer stub that always returned `available: false`
// (the Tauri build never wired the actual probe) AND would have hit a
// stripped-PATH problem on macOS GUI launches even if it had been
// wired. Just run the import and let it report what failed.

async function pickGcc() {
  const picked = await window.api.import.genneySelectArchives() as string[];
  if (picked && picked.length > 0) gccPaths.value = picked;
}

async function pickGccMedia() {
  const r = await window.api.import.genneySelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gccMediaDir.value = r.path;
}

async function pickGedFile() {
  const picked = await window.api.gedcom.selectFiles() as string[];
  if (picked && picked.length > 0) gedPaths.value = picked;
}

async function pickGedMedia() {
  const r = await window.api.import.genneySelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) gedMediaDir.value = r.path;
}

/** One report out of N — the researcher asked one question. */
function sumSummaries(list: ImportSummary[]): ImportSummary {
  return list.reduce((acc, s) => ({
    persons: acc.persons + s.persons,
    coupleRelationships: acc.coupleRelationships + s.coupleRelationships,
    parentChildRelationships: acc.parentChildRelationships + s.parentChildRelationships,
    events: acc.events + s.events,
    places: acc.places + s.places,
    sources: acc.sources + s.sources,
    citations: acc.citations + s.citations,
    groups: acc.groups + s.groups,
    repositories: acc.repositories + s.repositories,
    researchTasks: acc.researchTasks + s.researchTasks,
    media: acc.media + s.media,
    warnings: [...acc.warnings, ...s.warnings],
    skipped: [...acc.skipped, ...s.skipped],
  }));
}

async function runDerbyImports(files: string[], mediaDir?: string) {
  if (files.length === 0) return;
  busy.value = true;
  queueOutcomes.value = [];
  genneyProgress.value = t('importExport.genneyDerbyRunning');
  try {
    // import:genneyRun runs in the worker thread and returns the
    // withImportLifecycle envelope: { success, report, error }.
    // The inner report shape: { imported: true, summary } on success,
    // { gedcomFallback: true, gedcomPath } when the .gcc archive is encrypted.
    const queue = await runImportQueue<ImportSummary>(files, async (sourcePath) => {
      const result = await window.api.import.genneyRun({ sourcePath, mediaDir }) as {
        success?: boolean;
        error?: string;
        report?: {
          imported?: boolean;
          gedcomFallback?: boolean;
          summary?: ImportSummary;
        };
      };
      if (!result.success) throw new Error(result.error ?? 'unknown');
      if (result.report?.gedcomFallback) throw new Error(t('importExport.genneyDerbyFallback'));
      if (!result.report?.imported || !result.report.summary) throw new Error('unknown');
      return result.report.summary;
    });

    queueOutcomes.value = queue.results.map(r => ({ file: r.file, error: r.error }));
    const summaries = queue.results
      .map(r => r.report)
      .filter((r): r is ImportSummary => r !== null);

    if (summaries.length > 0) {
      genneyReport.value = sumSummaries(summaries);
      showGenneyReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (queue.failed > 0) {
        setStatus(t('importExport.queueSummary', { succeeded: queue.succeeded, total: files.length }), 'error');
      }
    } else {
      const first = queue.results.find(r => r.error)?.error ?? 'unknown';
      setStatus(t('importExport.genneyDerbyError', { error: first }), 'error');
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
  const picked = await window.api.import.genneySelectArchives() as string[];
  if (!picked || picked.length === 0) return;
  await runDerbyImports(picked);
}

async function importGcc() {
  if (gccPaths.value.length === 0 || busy.value) return;
  await runDerbyImports([...gccPaths.value], gccMediaDir.value || undefined);
}

async function importGed() {
  if (gedPaths.value.length === 0 || busy.value) return;
  const files = [...gedPaths.value];
  busy.value = true;
  queueOutcomes.value = [];
  try {
    // gedcom:import runs in the worker thread and returns the
    // withImportLifecycle envelope: { success, report, error }.
    const queue = await runImportQueue<true>(files, async (filePath) => {
      const result = await window.api.gedcom.import({
        profile: 'genney',
        filePath,
        mediaDir: gedMediaDir.value || undefined,
      }) as { success?: boolean; error?: string };
      if (!result.success) throw new Error(result.error ?? 'unknown');
      return true;
    });
    queueOutcomes.value = queue.results.map(r => ({ file: r.file, error: r.error }));
    if (queue.succeeded > 0) {
      window.dispatchEvent(new CustomEvent('data-imported'));
      setStatus(queue.failed > 0
        ? t('importExport.queueSummary', { succeeded: queue.succeeded, total: files.length })
        : t('importExport.importSuccess', { file: files.join(', ') }),
      queue.failed > 0 ? 'error' : 'success');
    } else {
      setStatus(t('importExport.importError'), 'error');
      console.error('[GenneyImport] .ged import failed:', queue.results.map(r => r.error).filter(Boolean));
      toast.error(t('errors.saveFailed'));
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

