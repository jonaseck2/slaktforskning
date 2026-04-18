<template>
  <div>
    <div class="header">
      <h2>{{ $t('settings.title') }}</h2>
    </div>

    <FilterChips :options="tabOptions" :model-value="activeTab" @update:model-value="activeTab = $event" />

    <div class="settings-content">
      <DatabaseView v-if="activeTab === 'database'" />
      <LinkRulesView v-else-if="activeTab === 'link-rules'" />
      <GazetteersView v-else-if="activeTab === 'gazetteers'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FilterChips from '../components/ui/FilterChips.vue';
import DatabaseView from './DatabaseView.vue';
import LinkRulesView from './LinkRulesView.vue';
import GazetteersView from './GazetteersView.vue';

const { t } = useI18n();

const activeTab = ref('database');

const tabOptions = computed(() => [
  { value: 'database', label: t('settings.tabs.database') },
  { value: 'link-rules', label: t('settings.tabs.linkRules') },
  { value: 'gazetteers', label: t('settings.tabs.gazetteers') },
]);
</script>

<style scoped>
.settings-content {
  margin-top: 16px;
}
</style>
