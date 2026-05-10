<template>
  <div class="duplicates-view">
    <div class="header">
      <h2>{{ $t('duplicates.title') }}</h2>
      <p class="duplicates-hint">{{ $t('duplicates.hint') }}</p>
    </div>

    <FilterChips
      class="duplicates-tabs"
      :model-value="activeTab"
      :options="[
        { value: 'persons', label: $t('duplicates.tabs.persons') },
        { value: 'places',  label: $t('duplicates.tabs.places') },
        { value: 'sources', label: $t('duplicates.tabs.sources') },
        { value: 'media',   label: $t('duplicates.tabs.media') },
      ]"
      @update:model-value="setTab($event as TabName)"
    />

    <!-- Tab bodies. We use v-show to keep the tab state alive between
         switches (the persons → places → persons round-trip should not
         re-fetch persons). The first activation lazily mounts the tab via
         the `mounted[tab]` map.

         `preopenPair` is the [id1, id2] split of `?pair=...` from the URL,
         used by quality-check landings to pre-open the merge modal for the
         specific pair the user clicked. Each tab consumes it on its first
         load and clears it (via @consumed) so a manual tab-switch later
         doesn't re-open the modal. -->
    <div class="duplicates-tab-body">
      <PersonsTab v-if="mounted.persons" v-show="activeTab === 'persons'"
        :preopen-pair="activeTab === 'persons' ? preopenPair : null"
        @preopen-consumed="onPreopenConsumed" />
      <PlacesTab  v-if="mounted.places"  v-show="activeTab === 'places'"
        :preopen-pair="activeTab === 'places' ? preopenPair : null"
        @preopen-consumed="onPreopenConsumed" />
      <SourcesTab v-if="mounted.sources" v-show="activeTab === 'sources'"
        :preopen-pair="activeTab === 'sources' ? preopenPair : null"
        @preopen-consumed="onPreopenConsumed" />
      <MediaTab   v-if="mounted.media"   v-show="activeTab === 'media'"
        :preopen-pair="activeTab === 'media' ? preopenPair : null"
        @preopen-consumed="onPreopenConsumed" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FilterChips from '../components/ui/FilterChips.vue';
import PersonsTab from '../components/duplicates/PersonsTab.vue';
import PlacesTab from '../components/duplicates/PlacesTab.vue';
import SourcesTab from '../components/duplicates/SourcesTab.vue';
import MediaTab from '../components/duplicates/MediaTab.vue';

defineOptions({ name: 'DuplicatesView' });

type TabName = 'persons' | 'places' | 'sources' | 'media';

const VALID_TABS: TabName[] = ['persons', 'places', 'sources', 'media'];

const route = useRoute();
const router = useRouter();

function tabFromQuery(): TabName {
  const q = route.query.tab;
  if (typeof q === 'string' && (VALID_TABS as string[]).includes(q)) {
    return q as TabName;
  }
  return 'persons';
}

const activeTab = ref<TabName>(tabFromQuery());

// Quality-check deep links arrive as `?tab=<entity>&pair=<id1>:<id2>`.
// We hold the parsed pair in a local ref so we can clear it when a tab
// reports it has been consumed (modal opened, or pair not found and toast
// shown) — avoids re-opening the modal if the user switches tabs and back.
const preopenPair = ref<[string, string] | null>(parsePairFromQuery());

function parsePairFromQuery(): [string, string] | null {
  const q = route.query.pair;
  if (typeof q !== 'string') return null;
  const parts = q.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

function onPreopenConsumed() {
  preopenPair.value = null;
  // Strip the pair param from the URL so back/forward navigation doesn't
  // re-trigger the modal.
  if (route.query.pair !== undefined) {
    const nextQuery = { ...route.query };
    delete nextQuery.pair;
    router.replace({ query: nextQuery });
  }
}

// Keep preopenPair reactive to URL changes (e.g. quality-view click while
// already on /duplicates).
watch(() => route.query.pair, () => {
  preopenPair.value = parsePairFromQuery();
});

// Cache: only mount a tab once it has been visited; thereafter keep it
// alive (v-show) so switching back is instant and the page state persists.
const mounted = reactive<Record<TabName, boolean>>({
  persons: false,
  places: false,
  sources: false,
  media: false,
});
mounted[activeTab.value] = true;

function setTab(tab: TabName) {
  if (!VALID_TABS.includes(tab)) return;
  activeTab.value = tab;
  mounted[tab] = true;
  // Preserve other query params (e.g. the future `pair=` deep-link from Task 8).
  const nextQuery = { ...route.query, tab };
  if (route.query.tab !== tab) {
    router.replace({ query: nextQuery });
  }
}

// React to URL changes (back/forward, deep links).
watch(() => route.query.tab, () => {
  const next = tabFromQuery();
  if (next !== activeTab.value) {
    activeTab.value = next;
    mounted[next] = true;
  }
});

onMounted(() => {
  // Make sure the URL matches the resolved tab so deep-link round-trips work.
  if (route.query.tab !== activeTab.value) {
    router.replace({ query: { ...route.query, tab: activeTab.value } });
  }
});
</script>

<style scoped>
.duplicates-view {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.duplicates-hint {
  color: var(--text-muted);
  font-size: var(--font-sm);
  margin-top: var(--space-xs);
}
.duplicates-tabs {
  margin-top: var(--space-md);
  margin-bottom: var(--space-md);
}
.duplicates-tab-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
