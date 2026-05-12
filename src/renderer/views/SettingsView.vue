<template>
  <div>
    <div class="header">
      <h2>{{ $t('settings.title') }}</h2>
    </div>

    <FilterChips
      role="tablist"
      tabpanel-id-prefix="settings"
      :aria-label="$t('settings.title')"
      :options="tabOptions"
      :model-value="activeTab"
      @update:model-value="activeTab = $event as Tab"
    />

    <div class="settings-content">
      <div
        v-if="activeTab === 'database'"
        id="settings-database"
        role="tabpanel"
        aria-labelledby="settings-tab-database"
      ><DatabaseView /></div>
      <div
        v-else-if="activeTab === 'defaults'"
        id="settings-defaults"
        role="tabpanel"
        aria-labelledby="settings-tab-defaults"
      ><DefaultsView /></div>
      <div
        v-else-if="activeTab === 'link-rules'"
        id="settings-link-rules"
        role="tabpanel"
        aria-labelledby="settings-tab-link-rules"
      ><LinkRulesView /></div>
      <div
        v-else-if="activeTab === 'gazetteers'"
        id="settings-gazetteers"
        role="tabpanel"
        aria-labelledby="settings-tab-gazetteers"
      ><GazetteersView /></div>
    </div>

    <div class="settings-about">
      <button type="button" class="about-link" @click="openAbout">
        {{ $t('about.openLink') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import FilterChips from '../components/ui/FilterChips.vue';
import DatabaseView from './DatabaseView.vue';
import DefaultsView from './DefaultsView.vue';
import LinkRulesView from './LinkRulesView.vue';
import GazetteersView from './GazetteersView.vue';

const { t } = useI18n();

const VALID_TABS = ['database', 'defaults', 'link-rules', 'gazetteers'] as const;
type Tab = typeof VALID_TABS[number];
const route = useRoute();
const router = useRouter();
function tabFromRoute(): Tab {
  const q = route.query.tab;
  return (typeof q === 'string' && (VALID_TABS as readonly string[]).includes(q)) ? q as Tab : 'database';
}
const activeTab = ref<Tab>(tabFromRoute());
watch(() => route.query.tab, () => { activeTab.value = tabFromRoute(); });
watch(activeTab, (t) => {
  if (route.query.tab !== t) router.replace({ query: { ...route.query, tab: t } });
});

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
