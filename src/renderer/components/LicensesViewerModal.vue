<template>
  <BaseSubPanel
    v-if="visible"
    entity-type="neutral"
    :title="$t('about.licensesTitle')"
    icon="📄"
    mode="standalone"
    hide-save
    :cancel-label="$t('common.close')"
    @cancel="close"
    @close="close"
  >
    <div class="licenses-modal-body">
      <p v-if="loading" class="licenses-modal-loading">{{ $t('common.loading') }}</p>
      <p v-else-if="error" class="licenses-modal-error">{{ error }}</p>
      <template v-else>
        <p class="licenses-modal-electron-note">{{ $t('about.licensesElectronNote') }}</p>
        <pre class="licenses-modal-text">{{ text }}</pre>
      </template>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './modals/BaseSubPanel.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const loading = ref(false);
const error = ref('');
const text = ref('');

async function load() {
  if (!window.api?.app?.readThirdPartyLicenses) {
    error.value = t('errors.loadFailed');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    text.value = await window.api.app.readThirdPartyLicenses();
  } catch (err) {
    console.error('[LicensesViewerModal] load failed:', err);
    error.value = t('errors.loadFailed');
  } finally {
    loading.value = false;
  }
}

watch(() => props.visible, (v) => {
  if (v && !text.value && !loading.value) load();
}, { immediate: true });

function close() { emit('close'); }
</script>

<style scoped>
.licenses-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-width: 720px;
  max-height: 70vh;
}
.licenses-modal-electron-note {
  margin: 0;
  padding: var(--space-sm);
  background: var(--info-bg);
  color: var(--info-text);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
}
.licenses-modal-text {
  margin: 0;
  padding: var(--space-md);
  background: var(--surface-bg);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: var(--font-xs);
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.licenses-modal-loading,
.licenses-modal-error {
  margin: 0;
  color: var(--text-secondary);
}
.licenses-modal-error { color: var(--error-text); }
</style>
