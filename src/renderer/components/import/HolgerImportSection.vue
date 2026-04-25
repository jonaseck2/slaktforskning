<template>
  <div class="io-groups">
  <div class="io-group">
    <h3>{{ $t('importExport.holgerTitle') }}</h3>
    <p class="section-desc">{{ $t('importExport.holgerDesc') }}</p>
    <div class="section-buttons">
      <button @click="holgerPickFile" :disabled="busy">{{ $t('importExport.holgerPickFile') }}</button>
      <button @click="holgerPickMedia" :disabled="busy">{{ $t('importExport.holgerPickMedia') }}</button>
      <button @click="handleImportFromHolger" :disabled="busy || !holgerSourcePath">{{ $t('importExport.holgerImport') }}</button>
    </div>
    <p v-if="holgerSourcePath" class="section-instructions">{{ holgerSourcePath }}<span v-if="holgerMediaDir"> + {{ holgerMediaDir }}</span></p>
    <p v-if="holgerProgress" class="section-progress">{{ holgerProgress }}</p>

    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <BaseSubPanel
      v-if="showImportReport && importReport"
      entity-type="neutral"
      :title="$t('importExport.importReportTitle')"
      label=""
      mode="standalone"
      hide-save
      :cancel-label="$t('common.close')"
      @cancel="showImportReport = false"
      @close="showImportReport = false"
    >
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
      <div v-if="importReport.submitterName" class="report-section">
        <p class="report-section-label">{{ $t('importExport.treeSubject') }}</p>
        <p class="subm-name">{{ $t('importExport.submitterFound', { name: importReport.submitterName }) }}</p>
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseSubPanel from '../modals/BaseSubPanel.vue';
import PersonPicker from '../PersonPicker.vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import { resetDefaultPersonId } from '../../composables/useDefaultPerson';
import { useRouter } from 'vue-router';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const holgerSourcePath = ref('');
const holgerMediaDir = ref('');
const holgerProgress = ref('');
const showImportReport = ref(false);
const importReport = ref<{
  version?: string;
  persons: number; families: number; events: Record<string, number>;
  sources: number; places: number; citations: number;
  skipped: { tag: string; count: number }[];
  warnings: string[];
  defaultPersonId?: string;
  submitterName?: string;
} | null>(null);
const matchedPersonName = ref<string | null>(null);
const manualTreeSubjectId = ref<string | null>(null);
const resolvedTreeSubjectId = ref<string | null>(null);

watch(() => importReport.value?.submitterName, async () => {
  resolvedTreeSubjectId.value = null;
  matchedPersonName.value = null;
  manualTreeSubjectId.value = null;
  if (!importReport.value?.submitterName) return;
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

async function holgerPickFile() {
  const r = await window.api.import.holgerSelectFile() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerSourcePath.value = r.path;
}

async function holgerPickMedia() {
  const r = await window.api.import.holgerSelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerMediaDir.value = r.path;
}

async function handleImportFromHolger() {
  if (!holgerSourcePath.value) return;
  busy.value = true;
  holgerProgress.value = t('importExport.holgerRunning');
  window.api.import.onHolgerProgress((msg: string) => { holgerProgress.value = msg; });
  try {
    const result = await window.api.import.holgerRun({
      sourcePath: holgerSourcePath.value,
      mediaDir: holgerMediaDir.value || undefined,
    }) as {
      success: boolean;
      report?: {
        version?: string;
        persons: number; families: number; events: Record<string, number>;
        sources: number; places: number; citations: number;
        skipped: { tag: string; count: number }[];
        warnings: string[];
        defaultPersonId?: string;
      };
      error?: string;
    };
    if (result.success && result.report) {
      importReport.value = result.report;
      showImportReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (result.report.defaultPersonId) {
        router.push(`/persons/${result.report.defaultPersonId}`);
      }
    } else {
      setStatus(t('importExport.holgerError', { error: result.error ?? 'Unknown error' }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.holgerError', { error: err instanceof Error ? err.message : String(err) }), 'error');
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
    holgerProgress.value = '';
  }
}

</script>

<style scoped>
.section-instructions {
  font-size: var(--font-sm);
  color: #444;
  background: #f8f8f8;
  border-left: 3px solid var(--color-primary);
  padding: 8px 12px;
  border-radius: 0 4px 4px 0;
  margin: 0;
}

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
