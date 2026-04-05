<template>
  <div class="app">
    <nav class="sidebar">
      <h1>{{ $t('app.title') }}</h1>
      <form class="sidebar-search" @submit.prevent="submitSearch">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('app.search')"
          class="sidebar-search-input"
        />
      </form>
      <router-link to="/visualisering" class="nav-item">
        <span class="nav-icon">🌳</span>
        <span class="nav-label">{{ $t('nav.tree') }}</span>
      </router-link>
      <router-link to="/" class="nav-item">
        <span class="nav-icon">👤</span>
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
      <router-link to="/research-tasks" class="nav-item">
        <span class="nav-icon">🔬</span>
        <span class="nav-label">
          {{ $t('researchTasks.nav') }}
          <span v-if="openTaskCount > 0" class="error-badge">{{ openTaskCount }}</span>
        </span>
      </router-link>
      <router-link to="/quality" class="nav-item">
        <span class="nav-icon">🔍</span>
        <span class="nav-label">
          {{ $t('quality.nav') }}
          <span v-if="qualityErrorCount > 0" class="error-badge">{{ qualityErrorCount }}</span>
        </span>
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
      <router-view :key="$route.fullPath" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { saveLocale } from './i18n';
import type { SupportedLocale } from './i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => unknown>>;
};

const router = useRouter();
const { locale } = useI18n();
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
    loadQualityBadge();
    loadResearchBadge();
  });
  let qualityDebounce: ReturnType<typeof setTimeout> | null = null;
  let researchDebounce: ReturnType<typeof setTimeout> | null = null;
  (window.api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged(() => {
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
  width: 110px;
  background: #2c3e50;
  color: white;
  padding: 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar h1 {
  font-size: 13px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  text-align: center;
}

.sidebar-search {
  margin-bottom: 8px;
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

.sidebar a,
.nav-item {
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  padding: 8px 6px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.sidebar a:hover,
.sidebar a.router-link-active,
.nav-item:hover,
.nav-item.router-link-active {
  background: rgba(255, 255, 255, 0.12);
  color: white;
}

.nav-icon { font-size: 18px; line-height: 1; }
.nav-label { font-size: 10px; text-align: center; }

.sidebar-spacer {
  flex: 1;
}

.nav-bottom {
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  padding-top: 12px !important;
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5) !important;
}

.nav-bottom:hover,
.nav-bottom.router-link-active {
  color: white !important;
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
  display: inline-block;
  background: #e53e3e;
  color: white;
  border-radius: 8px;
  padding: 0px 5px;
  font-size: 10px;
  font-weight: 700;
  margin-left: 4px;
  vertical-align: middle;
  line-height: 16px;
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
</style>
