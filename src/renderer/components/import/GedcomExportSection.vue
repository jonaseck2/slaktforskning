<template>
  <div class="export-groups">
    <div class="export-group">
      <div class="group-header">
        <h3>GEDCOM 5.5.1</h3>
        <span class="card-badge card-badge--stable">{{ $t('gedcom.badgeStable') }}</span>
      </div>
      <p class="section-desc">{{ $t('gedcom.export551Desc') }}</p>
      <button @click="handleExportGedcom('5.5.1')" :disabled="busy">{{ $t('gedcom.export551Button') }}</button>
    </div>

    <div class="export-group">
      <div class="group-header">
        <h3>GEDCOM 7.0</h3>
        <span class="card-badge card-badge--modern">{{ $t('gedcom.badgeModern') }}</span>
      </div>
      <p class="section-desc">{{ $t('gedcom.export70Desc') }}</p>
      <button @click="handleExportGedcom('7.0')" :disabled="busy">{{ $t('gedcom.export70Button') }}</button>
    </div>

    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Export report modal -->
    <BaseModal v-if="showExportReport && exportReport" @close="showExportReport = false">
      <h3>{{ $t('importExport.exportReportTitle') }}</h3>
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
      <div class="modal-actions">
        <button @click="showExportReport = false">{{ $t('importExport.importReportClose') }}</button>
      </div>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import BaseModal from '../BaseModal.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
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
    const result = (await window.api.gedcom.export({ version })) as {
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

<style scoped>
.export-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 560px;
}

.export-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-header h3 {
  margin: 0;
}

.card-badge {
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.card-badge--stable {
  background: #e8f5e9;
  color: #2e7d32;
}

.card-badge--modern {
  background: #e3f2fd;
  color: #1565c0;
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
