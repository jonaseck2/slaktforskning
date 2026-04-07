<template>
  <div class="section">
    <h3>{{ $t('importExport.gedcomExportTitle') }}</h3>
    <div class="export-cards">
      <div class="export-card">
        <div class="card-header">
          <span class="card-title">GEDCOM 5.5.1</span>
          <span class="card-badge card-badge--stable">{{ $t('gedcom.badgeStable') }}</span>
        </div>
        <p class="card-desc">{{ $t('gedcom.export551Desc') }}</p>
        <button @click="handleExportGedcom('5.5.1')" :disabled="busy">{{ $t('gedcom.export551Button') }}</button>
      </div>
      <div class="export-card">
        <div class="card-header">
          <span class="card-title">GEDCOM 7.0</span>
          <span class="card-badge card-badge--modern">{{ $t('gedcom.badgeModern') }}</span>
        </div>
        <p class="card-desc">{{ $t('gedcom.export70Desc') }}</p>
        <button @click="handleExportGedcom('7.0')" :disabled="busy">{{ $t('gedcom.export70Button') }}</button>
      </div>
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
.export-cards {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.export-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  flex: 1;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: #222;
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

.card-desc {
  font-size: var(--font-sm);
  color: #555;
  margin: 0;
  line-height: 1.5;
  flex: 1;
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
  margin-top: 4px;
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
