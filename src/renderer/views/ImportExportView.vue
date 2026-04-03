<template>
  <div>
    <h2>{{ $t('importExport.title') }}</h2>

    <div class="sections">
      <!-- Import from Genney -->
      <div class="section">
        <h3>{{ $t('importExport.genneyTitle') }}</h3>
        <p class="section-desc">{{ $t('importExport.genneyDesc') }}</p>
        <p class="section-instructions">{{ $t('gedcom.genneyInstructions') }}</p>
        <button @click="handleImportFromGenney" :disabled="busy">{{ $t('gedcom.genneyPickFile') }}</button>
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

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handleImportFromGenney() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.import({ profile: 'genney' })) as { imported?: boolean; canceled?: boolean; filePath?: string };
    if (result.imported) setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
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
    const result = (await window.api.gedcom.import()) as { imported?: boolean; canceled?: boolean; filePath?: string };
    if (result.imported) setStatus(t('importExport.importSuccess', { file: result.filePath ?? '' }));
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
  font-size: 15px;
}

.section-desc {
  font-size: 13px;
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

button {
  align-self: flex-start;
  background: #2c3e50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
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
  font-size: 13px;
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
</style>
