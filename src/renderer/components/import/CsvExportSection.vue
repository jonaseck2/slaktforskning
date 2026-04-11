<template>
  <div class="io-groups">
    <div class="io-group">
      <h3>{{ $t('csv.title') }}</h3>

      <form @submit.prevent="handleExport" class="csv-form">
        <label>
          {{ $t('csv.entityType') }}
          <select v-model="entityType">
            <option value="persons">{{ $t('nav.persons') }}</option>
            <option value="events">{{ $t('events.title') }}</option>
            <option value="sources">{{ $t('nav.sources') }}</option>
            <option value="places">{{ $t('places.title') }}</option>
          </select>
        </label>

        <label>
          {{ $t('csv.delimiter') }}
          <select v-model="delimiter">
            <option value=",">{{ $t('csv.comma') }}</option>
            <option value=";">{{ $t('csv.semicolon') }}</option>
            <option value="\t">{{ $t('csv.tab') }}</option>
          </select>
        </label>

        <label class="checkbox-label">
          <input type="checkbox" v-model="useBom" />
          {{ $t('csv.bom') }}
        </label>

        <button type="submit" :disabled="busy">{{ $t('csv.export') }}</button>
      </form>

      <p v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</p>
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

const entityType = ref('persons');
const delimiter = ref(',');
const useBom = ref(false);
const busy = ref(false);
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 4000);
}

async function handleExport() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.csv.export(entityType.value, {
      delimiter: delimiter.value,
      encoding: useBom.value ? 'utf-8-bom' : 'utf-8',
    })) as { success?: boolean; canceled?: boolean; filePath?: string; error?: string };

    if (result.canceled) return;
    if (result.success) {
      setStatus(t('csv.success'));
    } else {
      setStatus(result.error ?? 'Export failed', 'error');
    }
  } catch (err) {
    setStatus('Export failed', 'error');
    console.error('[CsvExport] failed:', err);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.csv-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 320px;
}

.csv-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
}

.csv-form select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-sm);
}

.csv-form button {
  align-self: flex-start;
}
</style>
