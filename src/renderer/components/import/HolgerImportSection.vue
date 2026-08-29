<template>
  <div class="io-groups">
  <div class="io-group">
    <h3>{{ $t('importExport.holgerTitle') }}</h3>
    <p class="section-desc">{{ $t('importExport.holgerDesc') }}</p>
    <div class="section-buttons">
      <button @click="holgerPickFile" :disabled="busy">{{ $t('importExport.holgerPickFile') }}</button>
      <button @click="holgerPickMedia" :disabled="busy">{{ $t('importExport.holgerPickMedia') }}</button>
      <button @click="handleImportFromHolger" :disabled="busy || holgerSourcePaths.length === 0">{{ $t('importExport.holgerImport') }}</button>
    </div>
    <p v-for="p in holgerSourcePaths" :key="p" class="section-instructions">{{ p }}<span v-if="holgerMediaDir"> + {{ holgerMediaDir }}</span></p>
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
      @cancel="closeReportAndNavigate"
      @close="closeReportAndNavigate"
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
          <router-link :to="'/persons/' + resolvedTreeSubjectId" class="person-link" @click="showImportReport = false">
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
      </div>
    </BaseSubPanel>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseSubPanel from '../modals/BaseSubPanel.vue';
import { runImportQueue } from './import-queue';
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
// Every picked path, in pick order. One file behaves exactly as before.
const holgerSourcePaths = ref<string[]>([]);
const queueOutcomes = ref<{ file: string; error: string | null }[]>([]);
const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
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
// Holds the tree-subject id between "import done" and "user closed report".
// Navigation runs AFTER the user closes the modal, so the report stays
// readable instead of being destroyed by the route-change unmount.
const pendingNavigatePersonId = ref<string | null>(null);

function closeReportAndNavigate() {
  showImportReport.value = false;
  const personId = pendingNavigatePersonId.value;
  pendingNavigatePersonId.value = null;
  if (personId) {
    router.push(`/persons/${personId}`);
  }
}

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
  const picked = await window.api.import.holgerSelectFiles() as string[];
  if (picked && picked.length > 0) holgerSourcePaths.value = picked;
}

async function holgerPickMedia() {
  const r = await window.api.import.holgerSelectMedia() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerMediaDir.value = r.path;
}

const PROGRESS_TOAST_ID = 'import-holger';

// Parse a "(N / M)" suffix the importer appends to per-row progress
// messages — used to drive the determinate progress bar. If the parse
// fails, the toast falls back to an indeterminate (animated) bar.
function parseCounts(msg: string): { current?: number; total?: number } {
  const m = msg.match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (!m) return {};
  return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
}

type HolgerReport = NonNullable<typeof importReport.value>;

/** One report out of N — the researcher asked one question. */
function sumReports(reports: HolgerReport[]): HolgerReport {
  return reports.reduce((acc, r) => {
    const events: Record<string, number> = { ...acc.events };
    for (const [type, n] of Object.entries(r.events)) events[type] = (events[type] ?? 0) + n;
    return {
      ...acc,
      version: acc.version && acc.version !== 'unknown' ? acc.version : r.version,
      persons: acc.persons + r.persons,
      families: acc.families + r.families,
      events,
      sources: acc.sources + r.sources,
      places: acc.places + r.places,
      citations: acc.citations + r.citations,
      skipped: [...acc.skipped, ...r.skipped],
      warnings: [...acc.warnings, ...r.warnings],
      defaultPersonId: acc.defaultPersonId ?? r.defaultPersonId,
    };
  });
}

async function handleImportFromHolger() {
  if (holgerSourcePaths.value.length === 0) return;
  const files = [...holgerSourcePaths.value];
  busy.value = true;
  queueOutcomes.value = [];
  holgerProgress.value = t('importExport.holgerRunning');
  toast.progress(PROGRESS_TOAST_ID, t('importExport.holgerRunning'));
  window.api.import.onHolgerProgress((msg: string) => {
    holgerProgress.value = msg;
    const { current, total } = parseCounts(msg);
    toast.progress(PROGRESS_TOAST_ID, msg, current, total);
  });
  try {
    const queue = await runImportQueue<HolgerReport>(files, async (sourcePath) => {
      const result = await window.api.import.holgerRun({
        sourcePath,
        mediaDir: holgerMediaDir.value || undefined,
      }) as { success: boolean; report?: HolgerReport; error?: string };
      if (!result.success || !result.report) {
        throw new Error(result.error ?? 'Unknown error');
      }
      return result.report;
    });

    queueOutcomes.value = queue.results.map(r => ({ file: r.file, error: r.error }));
    const reports = queue.results
      .map(r => r.report)
      .filter((r): r is HolgerReport => r !== null);

    if (reports.length > 0) {
      importReport.value = sumReports(reports);
      showImportReport.value = true;
      // Stash the tree-subject id so we can route there once the user has
      // closed the report. Routing immediately would unmount this view and
      // destroy the report modal before it can be read.
      pendingNavigatePersonId.value = importReport.value.defaultPersonId ?? null;
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (queue.failed > 0) {
        setStatus(t('importExport.queueSummary', { succeeded: queue.succeeded, total: files.length }), 'error');
      }
    } else {
      const first = queue.results.find(r => r.error)?.error ?? 'Unknown error';
      setStatus(t('importExport.holgerError', { error: first }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.holgerError', { error: err instanceof Error ? err.message : String(err) }), 'error');
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
    holgerProgress.value = '';
    toast.dismissProgress(PROGRESS_TOAST_ID);
  }
}

</script>

<style scoped>
.section-instructions {
  font-size: var(--font-sm);
  color: var(--text-primary);
  background: var(--surface-hover);
  border-left: 3px solid var(--accent);
  padding: 8px 12px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
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
