<template>
  <div>
    <div class="header">
      <h2>{{ $t('settings.title') }}</h2>
    </div>

    <FilterChips :options="tabOptions" :model-value="activeTab" @update:model-value="activeTab = $event" />

    <div class="settings-content">
      <DatabaseView v-if="activeTab === 'database'" />
      <DefaultsView v-else-if="activeTab === 'defaults'" />
      <LinkRulesView v-else-if="activeTab === 'link-rules'" />
      <GazetteersView v-else-if="activeTab === 'gazetteers'" />
    </div>

    <div class="settings-about">
      <button type="button" class="about-link" @click="openAbout">
        {{ $t('about.openLink') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FilterChips from '../components/ui/FilterChips.vue';
import DatabaseView from './DatabaseView.vue';
import DefaultsView from './DefaultsView.vue';
import LinkRulesView from './LinkRulesView.vue';
import GazetteersView from './GazetteersView.vue';

const { t } = useI18n();

const activeTab = ref('database');

const tabOptions = computed(() => [
  { value: 'database', label: t('settings.tabs.database') },
  { value: 'defaults', label: t('settings.tabs.defaults') },
  { value: 'link-rules', label: t('settings.tabs.linkRules') },
  { value: 'gazetteers', label: t('settings.tabs.gazetteers') },
]);

// AboutModal listens to the same `app:openAbout` IPC channel that the
// native Help / app menus use, so this entry point reuses the existing
// modal without forking it.
function openAbout() {
  window.dispatchEvent(new CustomEvent('app:openAbout'));
}
</script>

<style scoped>
.settings-content {
  margin-top: 16px;
}
.settings-about {
  margin-top: var(--space-2xl);
  padding-top: var(--space-md);
  border-top: 1px solid var(--surface-border-subtle);
  text-align: center;
}
.about-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
}
.about-link:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
</style>
