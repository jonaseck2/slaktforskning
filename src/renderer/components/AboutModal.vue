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
      <h3 class="about-app-name">OurLegacy</h3>
      <p class="about-version">{{ $t('about.version', { version }) }}</p>
      <p class="about-description">{{ $t('about.description') }}</p>
      <p class="about-license">
        {{ $t('about.openSource') }}
        <a href="#" class="about-link" @click.prevent="openRepo">{{ $t('about.viewOnGitHub') }}</a>
      </p>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseSubPanel from './modals/BaseSubPanel.vue';

declare const window: Window & {
  api: {
    app: {
      getVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
    };
  };
};

const REPO_URL = 'https://github.com/jonaseck2/slaktforskning';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const version = ref('');

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
function openRepo() {
  if (window.api?.app?.openExternal) {
    window.api.app.openExternal(REPO_URL);
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
</style>
