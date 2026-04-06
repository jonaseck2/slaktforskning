<template>
  <div>
    <h2>{{ $t('importExport.title') }}</h2>

    <div class="sections">
      <!-- Import from Genney -->
      <div class="section">
        <h3>{{ $t('importExport.genneyTitle') }}</h3>
        <p class="section-desc">{{ $t('importExport.genneyDesc') }}</p>
        <div class="section-buttons">
          <button @click="handleGenneyDerby('archive')" :disabled="busy">
            {{ $t('importExport.genneyDerbySelectArchive') }}
          </button>
          <button @click="handleImportFromGenney" :disabled="busy">{{ $t('gedcom.genneyPickFile') }}</button>
        </div>
        <p v-if="genneyProgress" class="section-progress">{{ genneyProgress }}</p>
      </div>

      <!-- Holger / OurKind -->
      <div class="section">
        <h3>{{ $t('importExport.holgerTitle') }}</h3>
        <p class="section-desc">{{ $t('importExport.holgerDesc') }}</p>
        <div class="section-buttons">
          <button @click="holgerPickFile" :disabled="busy">{{ $t('importExport.holgerPickFile') }}</button>
          <button @click="holgerPickMedia" :disabled="busy">{{ $t('importExport.holgerPickMedia') }}</button>
          <button @click="handleImportFromHolger" :disabled="busy || !holgerSourcePath">{{ $t('importExport.holgerImport') }}</button>
        </div>
        <p v-if="holgerSourcePath" class="section-instructions">{{ holgerSourcePath }}<span v-if="holgerMediaDir"> + {{ holgerMediaDir }}</span></p>
        <p v-if="holgerProgress" class="section-progress">{{ holgerProgress }}</p>

        <hr class="section-divider" />

        <p class="subsection-label">{{ $t('importExport.holgerEdbTitle') }}</p>
        <p class="section-desc">{{ $t('importExport.holgerEdbDesc') }}</p>
        <div class="section-buttons">
          <button @click="holgerEdbPickDir" :disabled="busy">{{ $t('importExport.holgerEdbPickDir') }}</button>
          <button @click="handleImportFromHolgerEdb" :disabled="busy || !holgerEdbPath">{{ $t('importExport.holgerEdbImport') }}</button>
        </div>
        <p v-if="holgerEdbPath" class="section-instructions">{{ holgerEdbPath }}</p>
        <p v-if="holgerEdbProgress" class="section-progress">{{ holgerEdbProgress }}</p>
      </div>

      <!-- Import GEDCOM -->
      <div class="section">
        <h3>{{ $t('importExport.gedcomImportTitle') }}</h3>
        <p class="section-desc">{{ $t('importExport.gedcomImportDesc') }}</p>
        <button @click="handleImportGedcom" :disabled="busy">{{ $t('gedcom.import') }}</button>
      </div>

      <!-- Export GEDCOM -->
      <div class="section">
        <h3>{{ $t('importExport.gedcomExportTitle') }}</h3>
        <p class="section-desc">{{ $t('importExport.gedcomExportDesc') }}</p>
        <button @click="handleExportGedcom" :disabled="busy">{{ $t('gedcom.export') }}</button>
      </div>
    </div>

    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>

    <!-- Import report modal -->
    <div v-if="showImportReport && importReport" class="modal-overlay" @click.self="showImportReport = false">
      <div class="modal">
        <h3>{{ $t('importExport.importReportTitle') }}</h3>
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
        <div v-if="importReport.rawCounts" class="report-section">
          <p class="report-section-label">{{ $t('importExport.importReportRawCounts') }}</p>
          <ul class="report-counts">
            <li>{{ $t('importExport.importReportRawIndividuals', { raw: importReport.rawCounts.individuals, imported: importReport.persons }) }}</li>
            <li>{{ $t('importExport.importReportRawFamilies', { raw: importReport.rawCounts.families, imported: importReport.families }) }}</li>
            <li>{{ $t('importExport.importReportRawSources', { raw: importReport.rawCounts.sources, imported: importReport.sources }) }}</li>
            <li v-if="importReport.rawCounts.repositories > 0">{{ $t('importExport.importReportRawRepositories', { n: importReport.rawCounts.repositories }) }}</li>
            <li v-if="importReport.rawCounts.notes > 0">{{ $t('importExport.importReportRawNotes', { n: importReport.rawCounts.notes }) }}</li>
          </ul>
        </div>
        <div v-if="importReport.unmappedData && importReport.unmappedData.length > 0" class="report-section">
          <p class="report-section-label">{{ $t('importExport.importReportNotImported') }}</p>
          <ul>
            <li v-for="item in importReport.unmappedData" :key="item.category">{{ item.category }}: {{ item.count }}</li>
          </ul>
        </div>
        <div v-if="importReport.modelLimitations && importReport.modelLimitations.length > 0" class="report-section">
          <p class="report-section-label">{{ $t('importExport.importReportModelLimitations') }}</p>
          <ul>
            <li v-for="(lim, i) in importReport.modelLimitations" :key="i">{{ lim }}</li>
          </ul>
        </div>
        <div class="modal-actions">
          <button @click="showImportReport = false">{{ $t('importExport.importReportClose') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const genneyProgress = ref('');
const holgerSourcePath = ref('');
const holgerMediaDir = ref('');
const holgerProgress = ref('');
const holgerEdbPath = ref('');
const holgerEdbProgress = ref('');
const showImportReport = ref(false);
const importReport = ref<{
  version?: string;
  persons: number; families: number; events: Record<string, number>;
  sources: number; places: number; citations: number;
  skipped: { tag: string; count: number }[];
  warnings: string[];
  rawCounts?: {
    individuals: number; families: number; sources: number;
    repositories: number; notes: number; objects: number; submitters: number;
  };
  tagStats?: { tag: string; occurrences: number }[];
  unmappedData?: { category: string; count: number; example?: string }[];
  modelLimitations?: string[];
} | null>(null);

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handleGenneyDerby(mode: 'folder' | 'archive') {
  if (busy.value) return;

  const dockerCheck = await window.api.import.genneyCheckDocker() as { available: boolean };
  if (!dockerCheck.available) {
    setStatus(t('importExport.genneyDerbyNoDocker'), 'error');
    return;
  }

  const picked = mode === 'folder'
    ? await window.api.import.genneySelectDerby() as { canceled: boolean; path?: string }
    : await window.api.import.genneySelectArchive() as { canceled: boolean; path?: string };
  if (picked.canceled || !picked.path) return;

  busy.value = true;
  genneyProgress.value = t('importExport.genneyDerbyRunning');

  window.api.import.onProgress((msg: string) => { genneyProgress.value = msg; });

  try {
    const result = await window.api.import.genneyRun({ sourcePath: picked.path }) as {
      imported?: boolean;
      gedcomFallback?: boolean;
      gedcomPath?: string;
      summary?: { persons: number; events: number; citations: number };
      error?: string;
    };

    if (result.gedcomFallback) {
      genneyProgress.value = t('importExport.genneyDerbyFallback');
      const gedResult = await window.api.gedcom.import({ profile: 'genney' }) as { imported?: boolean; canceled?: boolean; filePath?: string };
      if (gedResult.imported) {
        setStatus(t('importExport.importSuccess', { file: gedResult.filePath ?? '' }));
        window.dispatchEvent(new CustomEvent('data-imported'));
      }
    } else if (result.imported && result.summary) {
      const s = result.summary;
      setStatus(t('importExport.genneyDerbySuccess', { persons: s.persons, events: s.events, citations: s.citations }));
      window.dispatchEvent(new CustomEvent('data-imported'));
    } else if (result.error) {
      setStatus(t('importExport.genneyDerbyError', { error: result.error }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.genneyDerbyError', { error: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    busy.value = false;
    genneyProgress.value = '';
  }
}

async function handleImportFromGenney() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.import({ profile: 'genney' })) as { imported?: boolean; canceled?: boolean; filePath?: string };
    if (result.imported) {
      setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
      window.dispatchEvent(new CustomEvent('data-imported'));
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[ImportExport] Genney import failed:', err);
  } finally {
    busy.value = false;
  }
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
      };
      error?: string;
    };
    if (result.success && result.report) {
      importReport.value = result.report;
      showImportReport.value = true;
      window.dispatchEvent(new CustomEvent('data-imported'));
    } else {
      setStatus(t('importExport.holgerError', { error: result.error ?? 'Unknown error' }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.holgerError', { error: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    busy.value = false;
    holgerProgress.value = '';
  }
}

async function holgerEdbPickDir() {
  const r = await window.api.import.holgerEdbSelectDir() as { canceled: boolean; path?: string };
  if (!r.canceled && r.path) holgerEdbPath.value = r.path;
}

async function handleImportFromHolgerEdb() {
  if (!holgerEdbPath.value) return;
  busy.value = true;
  holgerEdbProgress.value = t('importExport.holgerEdbRunning');
  window.api.import.onHolgerProgress((msg: string) => { holgerEdbProgress.value = msg; });
  try {
    const result = await window.api.import.holgerEdbRun({
      edbPath: holgerEdbPath.value,
    }) as {
      success: boolean;
      summary?: { persons: number; events: number };
      error?: string;
    };
    if (result.success && result.summary) {
      const s = result.summary;
      setStatus(t('importExport.holgerEdbSuccess', { persons: s.persons, events: s.events }));
      window.dispatchEvent(new CustomEvent('data-imported'));
    } else {
      setStatus(t('importExport.holgerEdbError', { error: result.error ?? 'Unknown error' }), 'error');
    }
  } catch (err) {
    setStatus(t('importExport.holgerEdbError', { error: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    busy.value = false;
    holgerEdbProgress.value = '';
  }
}

async function handleImportGedcom() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.import()) as {
      imported?: boolean;
      canceled?: boolean;
      filePath?: string;
      report?: {
        version?: string;
        persons: number;
        families: number;
        events: Record<string, number>;
        sources: number;
        places: number;
        citations: number;
        skipped: { tag: string; count: number }[];
        warnings: string[];
      };
    };
    if (result.imported) {
      window.dispatchEvent(new CustomEvent('data-imported'));
      if (result.report) {
        importReport.value = result.report;
        showImportReport.value = true;
      } else {
        setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
      }
    }
  } catch (err) {
    setStatus(t('importExport.importError'), 'error');
    console.error('[ImportExport] GEDCOM import failed:', err);
  } finally {
    busy.value = false;
  }
}

async function handleExportGedcom() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.export()) as { exported?: boolean; canceled?: boolean; filePath?: string };
    if (result.exported) setStatus(t('importExport.exportSuccess', { file: result.filePath ?? '' }));
  } catch (err) {
    setStatus(t('importExport.exportError'), 'error');
    console.error('[ImportExport] GEDCOM export failed:', err);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
h2 {
  margin-bottom: 24px;
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 560px;
}

.section {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section h3 {
  margin: 0;
  font-size: var(--font-md);
}

.section-desc {
  font-size: var(--font-sm);
  color: #666;
  margin: 0;
}

.section-instructions {
  font-size: var(--font-sm);
  color: #444;
  background: #f8f8f8;
  border-left: 3px solid #2c3e50;
  padding: 8px 12px;
  border-radius: 0 4px 4px 0;
  margin: 0;
}

.section-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.section-progress {
  font-size: var(--font-sm);
  color: #555;
  font-style: italic;
  margin: 0;
}

.section-divider {
  border: none;
  border-top: 1px solid #e5e5e5;
  margin: 4px 0;
}

.subsection-label {
  margin: 0;
  font-size: var(--font-sm);
  font-weight: 600;
  color: #444;
}

button {
  align-self: flex-start;
  background: #2c3e50;
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

.status {
  margin-top: 20px;
  font-size: var(--font-sm);
  padding: 8px 12px;
  border-radius: 4px;
  max-width: 560px;
}

.status.success {
  background: #d1fae5;
  color: #065f46;
}

.status.error {
  background: #fee2e2;
  color: #991b1b;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal h3 {
  margin: 0;
  font-size: var(--font-lg);
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

.report-event-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: var(--font-sm);
  color: #666;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
