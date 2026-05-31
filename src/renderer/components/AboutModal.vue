<template>
  <BaseSubPanel
    v-if="visible"
    entity-type="neutral"
    :title="$t('about.title')"
    icon="ℹ️"
    mode="standalone"
    hide-save
    :cancel-label="$t('common.close')"
    @cancel="close"
    @close="close"
  >
    <div class="about-body">
      <h3 class="about-app-name">Släktforskning</h3>
      <p v-if="$t('about.nameMeaning')" class="about-name-meaning">{{ $t('about.nameMeaning') }}</p>
      <p class="about-version">{{ $t('about.version', { version }) }}</p>
      <p class="about-description">{{ $t('about.description') }}</p>
      <p class="about-license">
        {{ $t('about.openSource') }}
        <a href="#" class="about-link" @click.prevent="openRepo">{{ $t('about.viewOnGitHub') }}</a>
      </p>
      <p class="about-license">
        <a href="#" class="about-link" @click.prevent="openLicenses">{{ $t('about.viewLicenses') }}</a>
      </p>

      <div v-if="updater.supported.value" class="about-updater">
        <p v-if="updater.installed.value" class="about-updater-status about-updater-status--available">
          {{ $t('updater.installedRestart') }}
        </p>
        <p v-else-if="updater.available.value" class="about-updater-status about-updater-status--available">
          {{ $t('updater.available', { version: updater.available.value.version }) }}
        </p>
        <p v-else-if="checkedAt" class="about-updater-status">{{ $t('updater.upToDate') }}</p>

        <div v-if="updater.installing.value && updater.progress.value" class="about-updater-progress">
          <div class="about-updater-progress-bar" :class="{ indeterminate: !isDeterminate }">
            <div v-if="isDeterminate" class="about-updater-progress-fill" :style="{ width: percent + '%' }" />
            <div v-else class="about-updater-progress-pulse" />
          </div>
          <p class="about-updater-progress-label">{{ progressLabel }}</p>
        </div>

        <div v-if="!updater.installed.value" class="about-updater-actions">
          <button type="button" class="btn-add" :disabled="updater.checking.value || updater.installing.value" @click="onCheck">
            {{ updater.checking.value ? $t('updater.checking') : $t('updater.checkNow') }}
          </button>
          <button
            v-if="updater.available.value"
            type="button"
            class="btn-add"
            :disabled="updater.installing.value"
            @click="onInstall"
          >
            {{ updater.installing.value ? $t('updater.installing') : $t('updater.installNow') }}
          </button>
        </div>
        <p v-if="updater.available.value?.body && !updater.installed.value" class="about-updater-notes">
          {{ updater.available.value.body }}
        </p>
      </div>
    </div>
    <LicensesViewerModal :visible="licensesVisible" @close="licensesVisible = false" />
    <ConfirmModal
      :visible="confirmInstall"
      :title="$t('updater.confirmTitle')"
      :message="$t('updater.confirmMessage')"
      icon="↻"
      :confirm-label="$t('updater.installNow')"
      @cancel="confirmInstall = false"
      @confirm="performInstall"
    />
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './modals/BaseSubPanel.vue';
import LicensesViewerModal from './LicensesViewerModal.vue';
import ConfirmModal from './ConfirmModal.vue';
import { useAppUpdater } from '../composables/useAppUpdater';
import { useToast } from '../composables/useToast';

const REPO_URL = 'https://github.com/jonaseck2/slaktforskning';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const updater = useAppUpdater();
const toast = useToast();

const version = ref('');
const licensesVisible = ref(false);
const checkedAt = ref<number | null>(null);
const confirmInstall = ref(false);

const isDeterminate = computed(() =>
  !!updater.progress.value && updater.progress.value.total !== null && updater.progress.value.total > 0
);

const percent = computed(() => {
  const p = updater.progress.value;
  if (!p || p.total === null || p.total === 0) return 0;
  const pct = (p.downloaded / p.total) * 100;
  return Math.max(0, Math.min(100, pct));
});

const progressLabel = computed(() => {
  const p = updater.progress.value;
  if (!p) return '';
  if (p.total !== null) {
    return t('updater.progressOf', { downloaded: formatBytes(p.downloaded), total: formatBytes(p.total) });
  }
  return t('updater.progressUnknown', { downloaded: formatBytes(p.downloaded) });
});

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

async function loadVersion() {
  if (!window.api?.app?.getVersion) return;
  try {
    version.value = await window.api.app.getVersion();
  } catch { /* ignore */ }
}

watch(() => props.visible, (v) => {
  if (v && !version.value) loadVersion();
}, { immediate: true });

function close() { emit('close'); }
function openLicenses() { licensesVisible.value = true; }
function openRepo() {
  if (window.api?.app?.openExternal) {
    window.api.app.openExternal(REPO_URL);
  }
}

async function onCheck() {
  const result = await updater.checkNow();
  checkedAt.value = Date.now();
  if (!result) {
    toast.info(t('updater.upToDate'));
  }
}

function onInstall() {
  confirmInstall.value = true;
}

async function performInstall() {
  confirmInstall.value = false;
  const res = await updater.installNow();
  if (!res.ok) {
    toast.error(t('updater.installFailed'));
  } else {
    toast.success(t('updater.installedRestart'));
  }
}
</script>

<style scoped>
.about-body {
  padding: var(--space-md) var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-width: 420px;
}
.about-app-name {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: 700;
}
.about-name-meaning {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-sm);
  font-style: italic;
}
.about-version {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-sm);
}
.about-description {
  margin: var(--space-sm) 0 0 0;
  font-size: var(--font-base);
  line-height: 1.5;
}
.about-license {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
.about-link {
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}
.about-link:hover {
  color: var(--accent-hover);
}
.about-updater {
  margin-top: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--surface-border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.about-updater-status {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
.about-updater-status--available {
  color: var(--text-primary);
  font-weight: 600;
}
.about-updater-actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}
.about-updater-notes {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--text-muted);
  white-space: pre-wrap;
}
.about-updater-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.about-updater-progress-bar {
  height: 6px;
  background: var(--surface-hover);
  border-radius: var(--radius-full);
  overflow: hidden;
  position: relative;
}
.about-updater-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.18s ease-out;
}
.about-updater-progress-pulse {
  position: absolute;
  height: 100%;
  width: 40%;
  background: var(--accent);
  border-radius: inherit;
  animation: about-updater-pulse 1.2s ease-in-out infinite;
}
@keyframes about-updater-pulse {
  0%   { left: -40%; }
  100% { left: 100%; }
}
.about-updater-progress-label {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
