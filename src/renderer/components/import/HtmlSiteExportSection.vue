<template>
  <div class="io-groups">
    <div class="io-group">
      <div class="io-group-header">
        <h3>{{ $t('htmlSite.title') }}</h3>
      </div>
      <p class="section-desc">{{ $t('htmlSite.desc') }}</p>

      <label class="checkbox-label">
        <input type="checkbox" v-model="excludeLiving">
        {{ $t('htmlSite.excludeLiving') }}
      </label>

      <label class="field-label">
        {{ $t('htmlSite.siteTitleLabel') }}
        <input type="text" v-model="siteTitle" :placeholder="$t('htmlSite.siteTitlePlaceholder')" class="site-title-input">
      </label>

      <div class="button-row">
        <button @click="handleExport" :disabled="busy">
          {{ busy ? $t('htmlSite.generating') : $t('htmlSite.export') }}
        </button>
        <button v-if="lastOutputDir" class="btn-secondary" @click="openFolder">
          {{ $t('htmlSite.openFolder') }}
        </button>
      </div>

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

const busy = ref(false);
const excludeLiving = ref(false);
const siteTitle = ref('');
const statusMessage = ref('');
const statusType = ref<'success' | 'error'>('success');
const lastOutputDir = ref('');

function setStatus(msg: string, type: 'success' | 'error' = 'success') {
  statusMessage.value = msg;
  statusType.value = type;
  setTimeout(() => { statusMessage.value = ''; }, 6000);
}

async function handleExport() {
  if (!window.api || busy.value) return;

  // Select output directory
  const dirResult = (await window.api.export.htmlSiteSelectDir()) as { canceled?: boolean; path?: string };
  if (dirResult.canceled || !dirResult.path) return;

  busy.value = true;
  try {
    const result = (await window.api.export.htmlSite({
      outputDir: dirResult.path,
      excludeLiving: excludeLiving.value,
      siteTitle: siteTitle.value || undefined,
    })) as { pageCount: number; personCount: number; placeCount: number; sourceCount: number };

    lastOutputDir.value = dirResult.path;
    setStatus(t('htmlSite.success', {
      pages: result.pageCount,
      persons: result.personCount,
      places: result.placeCount,
      sources: result.sourceCount,
    }));
  } catch (err) {
    console.error('[HtmlSiteExport] failed:', err);
    setStatus(t('htmlSite.error'), 'error');
  } finally {
    busy.value = false;
  }
}

async function openFolder() {
  if (lastOutputDir.value) {
    await window.api.export.openFolder(lastOutputDir.value);
  }
}
</script>

<style scoped>
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
  cursor: pointer;
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
}
.site-title-input {
  padding: 6px 10px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-size: var(--font-sm);
  font-family: inherit;
  max-width: 300px;
  background: var(--surface-bg);
  color: var(--text-primary);
}
.site-title-input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
  background: var(--surface);
}
.button-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-secondary {
  background: #e2e8f0;
  color: #334155;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-sm);
  font-family: inherit;
}
.btn-secondary:hover { background: #cbd5e1; }
</style>
