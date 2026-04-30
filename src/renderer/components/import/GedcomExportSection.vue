<template>
  <div class="io-groups">
    <ExportOptionsPanel @update:options="exportOpts = $event" />

    <div class="io-group">
      <div class="io-group-header">
        <h3>Export GEDCOM 5.5.1</h3>
        <span class="io-badge io-badge--stable">{{ $t('gedcom.badgeStable') }}</span>
      </div>
      <p class="section-desc">{{ $t('gedcom.export551Desc') }}</p>
      <button @click="handleExportGedcom('5.5.1')" :disabled="busy">{{ $t('gedcom.export551Button') }}</button>
    </div>

    <div class="io-group">
      <div class="io-group-header">
        <h3>Export GEDCOM 7.0</h3>
        <span class="io-badge io-badge--modern">{{ $t('gedcom.badgeModern') }}</span>
      </div>
      <p class="section-desc">{{ $t('gedcom.export70Desc') }}</p>
      <button @click="handleExportGedcom('7.0')" :disabled="busy">{{ $t('gedcom.export70Button') }}</button>
    </div>

    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Export report modal -->
    <BaseSubPanel
      v-if="showExportReport && exportReport"
      entity-type="neutral"
      :title="$t('importExport.exportReportTitle')"
      label=""
      mode="standalone"
      hide-save
      :cancel-label="$t('common.close')"
      @cancel="showExportReport = false"
      @close="showExportReport = false"
    >
      <div class="report-body">
        <ul class="report-counts">
          <li>{{ $t('importExport.exportReportPersons', { n: exportReport.persons }) }}</li>
          <li>{{ $t('importExport.exportReportFamilies', { n: exportReport.families }) }}</li>
          <li>{{ $t('importExport.exportReportEvents', { n: exportReport.events }) }}</li>
          <li>{{ $t('importExport.exportReportSources', { n: exportReport.sources }) }}</li>
        </ul>
        <div v-if="exportReport.excluded.length > 0" class="report-section">
          <p class="report-section-label">{{ $t('importExport.exportReportExcluded') }}</p>
          <ul>
            <li v-for="item in exportReport.excluded" :key="item.category">
              <strong>{{ item.category }}</strong> ({{ item.count }}): {{ item.reason }}
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
import ExportOptionsPanel from '../ExportOptionsPanel.vue';
import type { ExportOptions } from '../ExportOptionsPanel.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
const exportOpts = ref<ExportOptions | null>(null);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const showExportReport = ref(false);
const exportReport = ref<{
  persons: number;
  families: number;
  events: number;
  sources: number;
  excluded: { category: string; count: number; reason: string }[];
} | null>(null);

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handleExportGedcom(version: '5.5.1' | '7.0') {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.export({ version, exportOptions: exportOpts.value ?? undefined })) as {
      exported?: boolean;
      canceled?: boolean;
      filePath?: string;
      report?: {
        persons: number;
        families: number;
        events: number;
        sources: number;
        excluded: { category: string; count: number; reason: string }[];
      };
    };
    if (result.exported) {
      setStatus(t('importExport.exportSuccess', { file: result.filePath ?? '' }));
      if (result.report && result.report.excluded.length > 0) {
        exportReport.value = result.report;
        showExportReport.value = true;
      }
    }
  } catch (err) {
    setStatus(t('importExport.exportError'), 'error');
    console.error('[ImportExport] GEDCOM export failed:', err);
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}
</script>

