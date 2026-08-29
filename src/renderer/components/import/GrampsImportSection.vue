<template>
  <div class="io-groups">
    <div class="io-group">
      <h3>{{ $t('importExport.grampsTitle') }}</h3>
      <p class="section-desc">{{ $t('importExport.grampsDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickFile" :disabled="busy">{{ $t('importExport.grampsPickFile') }}</button>
        <button @click="handleImport" :disabled="busy || sourcePaths.length === 0">{{ $t('importExport.grampsImport') }}</button>
      </div>
      <p v-for="p in sourcePaths" :key="p" class="section-instructions">{{ p }}</p>
      <p v-if="progress" class="section-progress">{{ progress }}</p>

      <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

      <BaseSubPanel
        v-if="showReport && summary"
        entity-type="neutral"
        :title="$t('importExport.importReportTitle')"
        label=""
        mode="standalone"
        hide-save
        :cancel-label="$t('common.close')"
        @cancel="showReport = false"
        @close="showReport = false"
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
            <li>{{ $t('importExport.importReportPersons', { n: summary.persons }) }}</li>
            <li>{{ $t('importExport.importReportFamilies', { n: summary.coupleRelationships }) }}</li>
            <li>{{ $t('importExport.rootsmagicReportParentChild', { n: summary.parentChildRelationships }) }}</li>
            <li>{{ $t('importExport.importReportEvents', { n: summary.events }) }}</li>
            <li>{{ $t('importExport.importReportPlaces', { n: summary.places }) }}</li>
            <li>{{ $t('importExport.importReportSources', { n: summary.sources }) }}</li>
            <li>{{ $t('importExport.importReportCitations', { n: summary.citations }) }}</li>
            <li>{{ $t('importExport.importReportMedia', { n: summary.media }) }}</li>
          </ul>
          <div v-if="summary.warnings.length > 0" class="report-section">
            <p class="report-section-label">{{ $t('importExport.importReportWarnings') }}</p>
            <ul>
              <li v-for="(w, i) in summary.warnings" :key="i">{{ w }}</li>
            </ul>
          </div>
        </div>
      </BaseSubPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import BaseSubPanel from '../modals/BaseSubPanel.vue';
import { runImportQueue } from './import-queue';

interface GrampsSummary {
  persons: number;
  coupleRelationships: number;
  parentChildRelationships: number;
  events: number;
  places: number;
  sources: number;
  citations: number;
  media: number;
  warnings: string[];
  skipped: { category: string; count: number; reason: string }[];
}

const { t } = useI18n();
const toast = useToast();

// Every picked path, in pick order. One file behaves exactly as before.
const sourcePaths = ref<string[]>([]);
const queueOutcomes = ref<{ file: string; error: string | null }[]>([]);
const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
const busy = ref(false);
const progress = ref('');
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const showReport = ref(false);
const summary = ref<GrampsSummary | null>(null);

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function pickFile() {
  const picked = await window.api.import.grampsSelectFiles() as string[];
  if (picked && picked.length > 0) sourcePaths.value = picked;
}

/** One report out of N — the researcher asked one question. */
function sumSummaries(list: GrampsSummary[]): GrampsSummary {
  return list.reduce((acc, s) => ({
    persons: acc.persons + s.persons,
    coupleRelationships: acc.coupleRelationships + s.coupleRelationships,
    parentChildRelationships: acc.parentChildRelationships + s.parentChildRelationships,
    events: acc.events + s.events,
    places: acc.places + s.places,
    sources: acc.sources + s.sources,
    citations: acc.citations + s.citations,
    media: acc.media + s.media,
    warnings: [...acc.warnings, ...s.warnings],
    skipped: [...acc.skipped, ...s.skipped],
  }));
}

async function handleImport() {
  if (sourcePaths.value.length === 0) return;
  const files = [...sourcePaths.value];
  busy.value = true;
  queueOutcomes.value = [];
  progress.value = t('importExport.grampsRunning');
  window.api.import.onGrampsProgress((msg: string) => { progress.value = msg; });
  try {
    const queue = await runImportQueue<GrampsSummary>(files, async (sourcePath) => {
      const result = await window.api.import.grampsRun({ sourcePath }) as {
        success?: boolean;
        imported?: boolean;
        summary?: GrampsSummary;
        error?: string;
      };
      if (!result.imported || !result.summary) {
        throw new Error(result.error ?? 'Unknown error');
      }
      return result.summary;
    });

    queueOutcomes.value = queue.results.map(r => ({ file: r.file, error: r.error }));
    const summaries = queue.results
      .map(r => r.report)
      .filter((r): r is GrampsSummary => r !== null);

    if (summaries.length > 0) {
      summary.value = sumSummaries(summaries);
      showReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (queue.failed > 0) {
        setStatus(t('importExport.queueSummary', { succeeded: queue.succeeded, total: files.length }), 'error');
      }
    } else {
      const first = queue.results.find(r => r.error)?.error ?? 'Unknown error';
      setStatus(t('importExport.grampsError', { error: first }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.grampsError', { error: err instanceof Error ? err.message : String(err) }), 'error');
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
    progress.value = '';
  }
}
</script>
