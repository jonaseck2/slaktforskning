<template>
  <div class="app">
    <nav class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">{{ $t('app.title') }}</span>
      </div>
      <form class="sidebar-search" @submit.prevent="submitSearch">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('app.search')"
          class="sidebar-search-input"
        />
      </form>
      <div v-if="focusStore.personId" class="focus-indicator">
        <span class="focus-label">{{ $t('nav.focusPerson') }}</span>
        <router-link :to="'/persons/' + focusStore.personId" class="focus-name">
          {{ focusStore.personName }}
        </router-link>
      </div>
      <div class="nav-section-label">NAVIGERA</div>
      <router-link to="/visualisering" class="nav-item">
        <span class="nav-icon">🌳</span>
        <span class="nav-label">{{ $t('nav.tree') }}</span>
      </router-link>
      <router-link to="/" class="nav-item">
        <span class="nav-icon">👥</span>
        <span class="nav-label">{{ $t('nav.persons') }}</span>
      </router-link>
      <router-link to="/relationships" class="nav-item">
        <span class="nav-icon">🔗</span>
        <span class="nav-label">{{ $t('nav.relationships') }}</span>
      </router-link>
      <router-link to="/places" class="nav-item">
        <span class="nav-icon">📍</span>
        <span class="nav-label">{{ $t('places.title') }}</span>
      </router-link>
      <router-link to="/sources" class="nav-item">
        <span class="nav-icon">📚</span>
        <span class="nav-label">{{ $t('nav.sources') }}</span>
      </router-link>
      <router-link to="/groups" class="nav-item">
        <span class="nav-icon">🏷️</span>
        <span class="nav-label">{{ $t('nav.groups') }}</span>
      </router-link>
      <router-link to="/research-tasks" class="nav-item">
        <span class="nav-icon">🔬</span>
        <span class="nav-label">{{ $t('researchTasks.nav') }}</span>
        <span v-if="openTaskCount > 0" class="error-badge">{{ openTaskCount }}</span>
      </router-link>
      <router-link to="/quality" class="nav-item">
        <span class="nav-icon">⚠️</span>
        <span class="nav-label">{{ $t('quality.nav') }}</span>
        <span v-if="qualityErrorCount > 0" class="error-badge">{{ qualityErrorCount }}</span>
      </router-link>
      <router-link to="/reports" class="nav-item">
        <span class="nav-icon">🖨️</span>
        <span class="nav-label">{{ $t('reports.nav') }}</span>
      </router-link>
      <div class="sidebar-spacer"></div>
      <router-link to="/database" class="nav-bottom">{{ $t('database.nav') }} {{ currentDbName }}</router-link>
      <router-link to="/import-export" class="nav-bottom">{{ $t('nav.importExport') }}</router-link>
      <select class="locale-switcher" :value="locale" @change="switchLocale($event)">
        <option value="sv">Svenska</option>
        <option value="en">English</option>
      </select>
    </nav>
    <main class="content">
      <router-view v-slot="{ Component, route }">
        <keep-alive :include="CACHED_VIEWS">
          <component
            :is="Component"
            :key="CACHED_VIEWS.includes(route.name as string) ? (route.name as string) : route.fullPath"
          />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { saveLocale } from './i18n';
import type { SupportedLocale } from './i18n';
import { useFocusStore } from './stores/focus';
import { useDataVersionStore } from './stores/dataVersion';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => unknown>>;
};

const router = useRouter();
const { locale } = useI18n();
const focusStore = useFocusStore();
const dataVersionStore = useDataVersionStore();
const CACHED_VIEWS = ['PersonsView', 'RelationshipsView', 'SourcesView', 'PlacesView', 'GroupsView'];
const searchQuery = ref('');
const currentDbName = ref('');
const qualityErrorCount = ref(0);
const openTaskCount = ref(0);

async function loadDbName() {
  const info = await (window.api.db.getCurrent() as Promise<{ path: string; name: string }>);
  currentDbName.value = info.name;
}

async function loadResearchBadge() {
  if (!window.api?.researchTasks) return;
  try {
    const tasks = (await (window.api.researchTasks as Record<string, (...args: unknown[]) => Promise<unknown>>).list()) as Array<{ status: string }>;
    openTaskCount.value = tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  } catch { /* ignore */ }
}

async function loadQualityBadge() {
  if (!window.api?.checks) return;
  try {
    const results = (await (window.api.checks as Record<string, (...args: unknown[]) => Promise<unknown>>).runAll()) as Array<{ severity: string }>;
    qualityErrorCount.value = results.filter(r => r.severity === 'error' || r.severity === 'warning').length;
  } catch { /* ignore */ }
}

onMounted(() => {
  loadDbName();
  loadQualityBadge();
  loadResearchBadge();
  (window.api.db as unknown as { onSwitched: (cb: () => void) => void }).onSwitched(() => {
    window.location.reload();
  });
  window.addEventListener('data-imported', () => {
    dataVersionStore.increment();
    loadQualityBadge();
    loadResearchBadge();
  });
  let qualityDebounce: ReturnType<typeof setTimeout> | null = null;
  let researchDebounce: ReturnType<typeof setTimeout> | null = null;
  (window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
    dataVersionStore.increment();
    if (qualityDebounce) clearTimeout(qualityDebounce);
    qualityDebounce = setTimeout(loadQualityBadge, 800);
    if (researchDebounce) clearTimeout(researchDebounce);
    researchDebounce = setTimeout(loadResearchBadge, 400);
  });
});

function submitSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  router.push({ path: '/search', query: { q } });
  searchQuery.value = '';
}

function switchLocale(e: Event) {
  const val = (e.target as HTMLSelectElement).value as SupportedLocale;
  locale.value = val;
  saveLocale(val);
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
}

.app {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 185px;
  background: #2c3e50;
  color: white;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 4px 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  margin-bottom: 8px;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.sidebar-search {
  margin-bottom: 10px;
}
.sidebar-search-input {
  width: 100%;
  padding: 6px 10px;
  border-radius: 4px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: white;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}
.sidebar-search-input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}
.sidebar-search-input:focus {
  background: rgba(255, 255, 255, 0.2);
}

.focus-indicator {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  margin-bottom: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  border-left: 3px solid rgba(100, 180, 255, 0.7);
}
.focus-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
}
.focus-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.focus-name:hover { color: white; text-decoration: underline; }

.nav-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.35);
  padding: 2px 10px 6px;
}

.sidebar a,
.nav-item {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  padding: 7px 10px;
  border-radius: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.sidebar a:hover,
.sidebar a.router-link-active,
.nav-item:hover,
.nav-item.router-link-active {
  background: rgba(255, 255, 255, 0.12);
  color: white;
}

.nav-icon { font-size: 14px; line-height: 1; flex-shrink: 0; }
.nav-label { font-size: 13px; flex: 1; }

.sidebar-spacer {
  flex: 1;
}

.nav-bottom {
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  padding-top: 10px !important;
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45) !important;
  flex-direction: row;
  gap: 6px;
}

.nav-bottom:hover,
.nav-bottom.router-link-active {
  color: rgba(255, 255, 255, 0.8) !important;
}

.locale-switcher {
  background: rgba(255, 255, 255, 0.12);
  color: white;
  border: none;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
}
.locale-switcher option {
  color: #333;
  background: white;
}

.error-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e53e3e;
  color: white;
  border-radius: 8px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

@media print {
  .sidebar { display: none !important; }
  .app { display: block; height: auto; }
  .content { padding: 0; height: auto; overflow: visible; }
}
</style>
