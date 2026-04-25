<template>
  <div class="io-groups">
    <!-- Export -->
    <div class="io-group">
      <div class="io-group-header">
        <h3>{{ $t('importExport.archiveExportTitle') }}</h3>
      </div>
      <p class="section-desc">{{ $t('importExport.archiveExportDesc') }}</p>
      <button @click="handleExport" :disabled="busy">{{ $t('importExport.archiveExportButton') }}</button>
    </div>

    <!-- Import -->
    <div class="io-group">
      <div class="io-group-header">
        <h3>{{ $t('importExport.archiveImportTitle') }}</h3>
      </div>
      <p class="section-desc">{{ $t('importExport.archiveImportDesc') }}</p>
      <button @click="handleImport" :disabled="busy">{{ $t('importExport.archiveImportButton') }}</button>
    </div>

    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Export report modal -->
    <BaseSubPanel
      v-if="showExportReport && exportReportData"
      entity-type="neutral"
      :title="$t('importExport.exportReportTitle')"
      label=""
      mode="standalone"
      hide-save
      :cancel-label="$t('common.close')"
      @cancel="showExportReport = false"
      @close="showExportReport = false"
    >
      <ul class="report-counts">
        <li>{{ $t('importExport.exportReportPersons', { n: exportReportData.gedcomReport.persons }) }}</li>
        <li>{{ $t('importExport.exportReportFamilies', { n: exportReportData.gedcomReport.families }) }}</li>
        <li>{{ $t('importExport.exportReportEvents', { n: exportReportData.gedcomReport.events }) }}</li>
        <li>{{ $t('importExport.exportReportSources', { n: exportReportData.gedcomReport.sources }) }}</li>
        <li>{{ $t('importExport.archiveMediaCount', { count: exportReportData.mediaCount }) }}</li>
      </ul>
      <div v-if="exportReportData.missingMedia.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.archiveMissingMedia') }}</p>
        <ul>
          <li v-for="(f, i) in exportReportData.missingMedia" :key="i">{{ f }}</li>
        </ul>
      </div>
      <div v-if="exportReportData.gedcomReport.excluded.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.exportReportExcluded') }}</p>
        <ul>
          <li v-for="item in exportReportData.gedcomReport.excluded" :key="item.category">
            <strong>{{ item.category }}</strong> ({{ item.count }}): {{ item.reason }}
          </li>
        </ul>
      </div>
    </BaseSubPanel>

    <!-- Import report modal -->
    <BaseSubPanel
      v-if="showImportReport && importReportData"
      entity-type="neutral"
      :title="$t('importExport.importReportTitle')"
      label=""
      mode="standalone"
      hide-save
      :cancel-label="$t('common.close')"
      @cancel="showImportReport = false"
      @close="showImportReport = false"
    >
      <ul class="report-counts">
        <li>{{ $t('importExport.importReportPersons', { n: importReportData.gedcomReport.persons }) }}</li>
        <li>{{ $t('importExport.importReportFamilies', { n: importReportData.gedcomReport.families }) }}</li>
        <li>{{ $t('importExport.importReportEvents', { n: Object.values(importReportData.gedcomReport.events).reduce((a: number, b: number) => a + b, 0) }) }}</li>
        <li>{{ $t('importExport.importReportSources', { n: importReportData.gedcomReport.sources }) }}</li>
        <li>{{ $t('importExport.importReportPlaces', { n: importReportData.gedcomReport.places }) }}</li>
        <li>{{ $t('importExport.importReportCitations', { n: importReportData.gedcomReport.citations }) }}</li>
        <li>{{ $t('importExport.archiveMediaImported', { count: importReportData.mediaImported }) }}</li>
      </ul>
      <div v-if="importReportData.gedcomReport.warnings && importReportData.gedcomReport.warnings.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.importReportWarnings') }}</p>
        <ul>
          <li v-for="(w, i) in importReportData.gedcomReport.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <div v-if="importReportData.mediaSkipped.length > 0" class="report-section">
        <p class="report-section-label">{{ $t('importExport.archiveMissingMedia') }}</p>
        <ul>
          <li v-for="(f, i) in importReportData.mediaSkipped" :key="i">{{ f }}</li>
        </ul>
      </div>
      <div v-if="importReportData.gedcomReport.submitterName" class="report-section">
        <p class="report-section-label">{{ $t('importExport.treeSubject') }}</p>
        <p class="subm-name">{{ $t('importExport.submitterFound', { name: importReportData.gedcomReport.submitterName }) }}</p>
        <div v-if="resolvedTreeSubjectId" class="subm-matched">
          <span>{{ $t('importExport.submitterMatched') }}</span>
          <router-link :to="'/visualisering/' + resolvedTreeSubjectId" class="person-link" @click="showImportReport = false">
            {{ matchedPersonName || resolvedTreeSubjectId }}
          </router-link>
        </div>
        <div v-else class="subm-unmatched">
          <p>{{ $t('importExport.submitterUnmatched') }}</p>
          <PersonPicker
            :model-value="manualTreeSubjectId"
            :placeholder="$t('importExport.submitterPickPerson')"
            @update:model-value="setTreeSubjectFromImport"
          />
        </div>
      </div>
    </BaseSubPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import { resetDefaultPersonId } from '../../composables/useDefaultPerson';
import BaseSubPanel from '../modals/BaseSubPanel.vue';
import PersonPicker from '../PersonPicker.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface ExportReport {
  mediaCount: number;
  missingMedia: string[];
  gedcomReport: {
    persons: number;
    families: number;
    events: number;
    sources: number;
    excluded: { category: string; count: number; reason: string }[];
  };
}

interface ImportReport {
  gedcomReport: {
    persons: number;
    families: number;
    events: Record<string, number>;
    sources: number;
    places: number;
    citations: number;
    warnings: string[];
    defaultPersonId?: string;
    submitterName?: string;
  };
  mediaImported: number;
  mediaSkipped: string[];
}

const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const showExportReport = ref(false);
const exportReportData = ref<ExportReport | null>(null);
const showImportReport = ref(false);
const importReportData = ref<ImportReport | null>(null);
const matchedPersonName = ref<string | null>(null);
const manualTreeSubjectId = ref<string | null>(null);
const resolvedTreeSubjectId = ref<string | null>(null);

watch(() => importReportData.value?.gedcomReport?.submitterName, async () => {
  resolvedTreeSubjectId.value = null;
  matchedPersonName.value = null;
  manualTreeSubjectId.value = null;
  if (!importReportData.value?.gedcomReport?.submitterName) return;
  const id = await window.api.db.getSetting('default_person_id') as string | null;
  if (!id) return;
  resolvedTreeSubjectId.value = id;
  try {
    const names = await window.api.persons.getNames(id) as { given_name?: string; surname?: string }[];
    const primary = names?.[0];
    if (primary) {
      matchedPersonName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
    }
  } catch { /* ignore */ }
}, { immediate: true });

async function setTreeSubjectFromImport(personId: string | null) {
  manualTreeSubjectId.value = personId;
  if (personId) {
    await window.api.db.setSetting('default_person_id', personId);
    resetDefaultPersonId();
    resolvedTreeSubjectId.value = personId;
    try {
      const names = await window.api.persons.getNames(personId) as { given_name?: string; surname?: string }[];
      const primary = names?.[0];
      if (primary) {
        matchedPersonName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
      }
    } catch { /* ignore */ }
  }
}

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handleExport() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.archive.export()) as {
      exported?: boolean;
      canceled?: boolean;
      filePath?: string;
      report?: ExportReport;
    };
    if (result.exported) {
      setStatus(t('importExport.archiveExportSuccess', { file: result.filePath ?? '' }));
      if (result.report) {
        exportReportData.value = result.report;
        showExportReport.value = true;
      }
    }
  } catch (err) {
    setStatus(t('importExport.archiveExportError'), 'error');
    console.error('[Archive] export failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}

async function handleImport() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.archive.import()) as {
      imported?: boolean;
      canceled?: boolean;
      filePath?: string;
      report?: ImportReport;
    };
    if (result.imported) {
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (result.report) {
        importReportData.value = result.report;
        showImportReport.value = true;
      } else {
        setStatus(t('importExport.archiveImportSuccess'));
      }
    }
  } catch (err) {
    setStatus(t('importExport.archiveImportError'), 'error');
    console.error('[Archive] import failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.subm-name {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.subm-matched {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
}
.subm-unmatched {
  font-size: var(--font-sm);
}
.subm-unmatched p {
  margin-bottom: 6px;
}
</style>
