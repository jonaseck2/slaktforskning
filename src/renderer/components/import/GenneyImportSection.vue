<template>
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
    <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const genneyProgress = ref('');

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
    toast.error(t('errors.saveFailed'));
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.section {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
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

.status {
  font-size: var(--font-sm);
  padding: 8px 12px;
  border-radius: 4px;
}

.status.success {
  background: #d1fae5;
  color: #065f46;
}

.status.error {
  background: var(--color-danger-bg);
  color: #991b1b;
}
</style>
