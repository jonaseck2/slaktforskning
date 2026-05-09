<template>
  <div class="io-groups">
    <div class="io-group">
      <h3>{{ $t('importExport.grampsTitle') }}</h3>
      <p class="section-desc">{{ $t('importExport.grampsDesc') }}</p>
      <div class="section-buttons">
        <button @click="pickFile" :disabled="busy">{{ $t('importExport.grampsPickFile') }}</button>
        <button @click="handleImport" :disabled="busy || !sourcePath">{{ $t('importExport.grampsImport') }}</button>
      </div>
      <p v-if="sourcePath" class="section-instructions">{{ sourcePath }}</p>
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

const sourcePath = ref('');
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
  const r = await window.api.import.grampsSelectFile() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) sourcePath.value = r.path;
}

async function handleImport() {
  if (!sourcePath.value) return;
  busy.value = true;
  progress.value = t('importExport.grampsRunning');
  window.api.import.onGrampsProgress((msg: string) => { progress.value = msg; });
  try {
    const result = await window.api.import.grampsRun({ sourcePath: sourcePath.value }) as {
      success?: boolean;
      imported?: boolean;
      summary?: GrampsSummary;
      error?: string;
    };
    if (result.imported && result.summary) {
      summary.value = result.summary;
      showReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
    } else {
      setStatus(t('importExport.grampsError', { error: result.error ?? 'Unknown error' }), 'error');
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
