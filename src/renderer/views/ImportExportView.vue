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
const showImportReport = ref(false);
const importReport = ref<{
  persons: number; families: number; events: Record<string, number>;
  sources: number; places: number; citations: number;
  skipped: { tag: string; count: number }[];
  warnings: string[];
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

async function handleImportGedcom() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.import()) as {
      imported?: boolean;
      canceled?: boolean;
      filePath?: string;
      report?: {
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
  font-size: 13px;
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
  font-size: 13px;
  color: #555;
  font-style: italic;
  margin: 0;
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
  font-size: 16px;
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
