<template>
  <div class="app">
    <nav class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">{{ $t('app.title') }}</span>
      </div>
      <form class="sidebar-search" @submit.prevent="submitSearch">
        <input
          ref="searchInputRef"
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
      <router-link to="/media" class="nav-item">
        <span class="nav-icon">🖼️</span>
        <span class="nav-label">{{ $t('media.nav') }}</span>
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
      <button class="dark-mode-toggle" @click="toggleDarkMode" :title="darkMode ? 'Light mode' : 'Dark mode'">
        {{ darkMode ? '☀️' : '🌙' }}
      </button>
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
import { ref, onMounted, onUnmounted } from 'vue';
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
const searchInputRef = ref<HTMLInputElement | null>(null);
const currentDbName = ref('');
const qualityErrorCount = ref(0);
const openTaskCount = ref(0);
const darkMode = ref(localStorage.getItem('darkMode') === 'true');

function applyDarkMode() {
  document.documentElement.classList.toggle('dark', darkMode.value);
}

function toggleDarkMode() {
  darkMode.value = !darkMode.value;
  localStorage.setItem('darkMode', String(darkMode.value));
  applyDarkMode();
}

function handleGlobalKey(e: KeyboardEvent) {
  if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  }
}

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
  applyDarkMode();
  window.addEventListener('keydown', handleGlobalKey);
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

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey);
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

.dark-mode-toggle {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  padding: 5px 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.dark-mode-toggle:hover { background: rgba(255, 255, 255, 0.2); }

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

/* ── Dark mode ─────────────────────────────────────────────────────────────
   Scoped to @media screen so exports/prints always use light colors.
   `html.dark` prefix adds specificity 0,2,N which beats Vue's scoped
   attribute selector specificity 0,1,N+1, so no !important needed for
   most rules. Use it sparingly where the specificity race is tight.
   ─────────────────────────────────────────────────────────────────────── */
@media screen {
html.dark body { background: #111827; color: #e2e8f0; }
html.dark .content { background: #111827; }

/* Tables */
html.dark .data-table th { background: #1f2937; color: #9ca3af; border-bottom-color: #374151; }
html.dark .data-table td { border-bottom-color: #374151; color: #e2e8f0; }
html.dark .clickable-row:hover { background: #1e293b; }

/* Inputs, selects, textareas */
html.dark input[type='text'],
html.dark input[type='number'],
html.dark input[type='email'],
html.dark textarea,
html.dark select {
  background: #1f2937;
  color: #e2e8f0;
  border-color: #374151;
}
html.dark input::placeholder,
html.dark textarea::placeholder { color: #6b7280; }

/* Modals */
html.dark .modal { background: #1f2937; color: #e2e8f0; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
html.dark .modal-overlay { background: rgba(0,0,0,0.65); }
html.dark .modal h3, html.dark .modal h4 { color: #f3f4f6; }

/* Buttons */
html.dark .btn-add { background: #374151; color: #e2e8f0; }
html.dark .btn-add:hover { background: #4b5563; }
html.dark .btn-cancel { background: #374151; color: #d1d5db; }
html.dark .btn-delete { background: #450a0a; color: #fca5a5; }
html.dark .btn-delete:hover { background: #7f1d1d; }
html.dark .btn-sm { background: #374151; color: #d1d5db; }
html.dark .btn-view-tree { background: #374151; color: #93c5fd; border-color: #374151; }
html.dark .btn-back { background: #374151; color: #d1d5db; border-color: #374151; }

/* Chips and filter pills */
html.dark .chip { background: #1f2937; border-color: #374151; color: #9ca3af; }
html.dark .chip:hover { background: #374151; }
html.dark .chip.active { background: #2c3e50; color: white; border-color: #2c3e50; }

/* Badges */
html.dark .type-badge { background: #1e293b; color: #94a3b8; border-color: #334155; }
html.dark .status-chip { opacity: 0.85; }

/* Text and labels */
html.dark .count-label { color: #6b7280; }
html.dark .running-hint { color: #6b7280; }
html.dark .empty { color: #4b5563; }
html.dark .empty-hint { color: #4b5563; }
html.dark label { color: #9ca3af; }
html.dark h2, html.dark h3, html.dark h4 { color: #f3f4f6; }
html.dark .section-header h4 { color: #f3f4f6; }

/* Detail views */
html.dark .detail-section { border-color: #1f2937; }
html.dark .field-grid input,
html.dark .field-grid select,
html.dark .field-grid textarea { background: #1f2937; color: #e2e8f0; border-color: #374151; }

/* Person links */
html.dark .person-link { color: #60a5fa; }

/* Issues banner */
html.dark .issues-banner { background: #1e2a3a; border-color: #374151; color: #fbbf24; }
html.dark .banner-error { background: #2d1a1a; border-color: #7f1d1d; }

/* Group chips */
html.dark .group-chip { background: #1f2937; border-color: #374151; color: #93c5fd; }
html.dark .chip-remove { color: #9ca3af; }

/* Citation badge */
html.dark .citation-badge-sourced { background: #14532d; color: #86efac; }
html.dark .citation-badge-unsourced { background: #78350f; color: #fcd34d; }

/* Locale switcher in sidebar (already dark, but fix option dropdown) */
html.dark .locale-switcher option { background: #1f2937; color: #e2e8f0; }

/* Scrollbars */
html.dark ::-webkit-scrollbar { background: #1f2937; }
html.dark ::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
} /* end @media screen */
</style>
