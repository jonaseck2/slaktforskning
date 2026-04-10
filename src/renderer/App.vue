<template>
  <div class="app">
    <a href="#main-content" class="skip-link">{{ $t('a11y.skipToMain') }}</a>
    <nav class="sidebar" aria-label="Main navigation">
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
      <h2 class="nav-section-label">{{ $t('nav.navigate') }}</h2>
      <router-link to="/visualisering" class="nav-item" :aria-label="$t('nav.visualization')">
        <span class="nav-icon" aria-hidden="true">🌳</span>
        <span class="nav-label">{{ $t('nav.visualization') }}</span>
      </router-link>
      <router-link to="/" class="nav-item" :aria-label="$t('nav.persons')">
        <span class="nav-icon" aria-hidden="true">👥</span>
        <span class="nav-label">{{ $t('nav.persons') }}</span>
      </router-link>
      <router-link to="/relationships" class="nav-item" :aria-label="$t('nav.relationships')">
        <span class="nav-icon" aria-hidden="true">🔗</span>
        <span class="nav-label">{{ $t('nav.relationships') }}</span>
      </router-link>
      <router-link to="/places" class="nav-item" :aria-label="$t('places.title')">
        <span class="nav-icon" aria-hidden="true">📍</span>
        <span class="nav-label">{{ $t('places.title') }}</span>
      </router-link>
      <router-link to="/sources" class="nav-item" :aria-label="$t('nav.sources')">
        <span class="nav-icon" aria-hidden="true">📚</span>
        <span class="nav-label">{{ $t('nav.sources') }}</span>
      </router-link>
      <router-link to="/groups" class="nav-item" :aria-label="$t('nav.groups')">
        <span class="nav-icon" aria-hidden="true">🏷️</span>
        <span class="nav-label">{{ $t('nav.groups') }}</span>
      </router-link>
      <router-link to="/media" class="nav-item" :aria-label="$t('media.nav')">
        <span class="nav-icon" aria-hidden="true">🖼️</span>
        <span class="nav-label">{{ $t('media.nav') }}</span>
      </router-link>
      <router-link to="/research-tasks" class="nav-item" :aria-label="openTaskCount > 0 ? $t('researchTasks.nav') + ', ' + openTaskCount + ' ' + $t('a11y.openTasks', { count: openTaskCount }) : $t('researchTasks.nav')">
        <span class="nav-icon" aria-hidden="true">🔬</span>
        <span class="nav-label">{{ $t('researchTasks.nav') }}</span>
        <span v-if="openTaskCount > 0" class="error-badge">{{ openTaskCount }}</span>
      </router-link>
      <router-link to="/quality" class="nav-item" :aria-label="qualityErrorCount > 0 ? $t('quality.nav') + ', ' + qualityErrorCount + ' ' + $t('a11y.qualityIssues', { count: qualityErrorCount }) : $t('quality.nav')">
        <span class="nav-icon" aria-hidden="true">⚠️</span>
        <span class="nav-label">{{ $t('quality.nav') }}</span>
        <span v-if="qualityErrorCount > 0" class="error-badge">{{ qualityErrorCount }}</span>
      </router-link>
      <router-link to="/reports" class="nav-item" :aria-label="$t('reports.nav')">
        <span class="nav-icon" aria-hidden="true">🖨️</span>
        <span class="nav-label">{{ $t('reports.nav') }}</span>
      </router-link>
      <div class="sidebar-spacer"></div>
      <router-link to="/database" class="nav-bottom">{{ $t('database.nav') }} {{ currentDbName }}</router-link>
      <router-link to="/import-export" class="nav-bottom">{{ $t('nav.importExport') }}</router-link>
      <div class="settings-section">
        <button class="settings-toggle" :aria-expanded="isSettingsOpen" :aria-label="$t('a11y.settings')" @click="toggleSettings()">
          <span class="nav-icon" aria-hidden="true">⚙️</span>
          <span class="nav-label">{{ $t('nav.settings') }}</span>
          <span class="settings-arrow">{{ isSettingsOpen ? '▴' : '▾' }}</span>
        </button>
        <div v-if="isSettingsOpen" ref="settingsPanelRef" class="settings-panel">
          <div class="settings-group-label">{{ $t('settings.appearance') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.appearance')">
            <button :class="['settings-option', { active: appearance === 'light' }]" role="radio" :aria-checked="String(appearance === 'light')" @click="setAppearance('light')">☀ {{ $t('settings.light') }}</button>
            <button :class="['settings-option', { active: appearance === 'dark' }]" role="radio" :aria-checked="String(appearance === 'dark')" @click="setAppearance('dark')">🌙 {{ $t('settings.dark') }}</button>
            <button :class="['settings-option', { active: appearance === 'contrast' }]" role="radio" :aria-checked="String(appearance === 'contrast')" @click="setAppearance('contrast')">👁 {{ $t('settings.contrast') }}</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.textSize') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.textSize')">
            <button :class="['settings-option', { active: textSize === 'small' }]" role="radio" :aria-checked="String(textSize === 'small')" @click="setTextSize('small')">S</button>
            <button :class="['settings-option', { active: textSize === 'medium' }]" role="radio" :aria-checked="String(textSize === 'medium')" @click="setTextSize('medium')">M</button>
            <button :class="['settings-option', { active: textSize === 'large' }]" role="radio" :aria-checked="String(textSize === 'large')" @click="setTextSize('large')">L</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.language') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.language')">
            <button :class="['settings-option', { active: locale === 'sv' }]" role="radio" :aria-checked="String(locale === 'sv')" @click="setLocale('sv')">Svenska</button>
            <button :class="['settings-option', { active: locale === 'en' }]" role="radio" :aria-checked="String(locale === 'en')" @click="setLocale('en')">English</button>
          </div>
          <div class="settings-group-label">{{ $t('a11y.readAloud') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('a11y.readAloud')">
            <button :class="['settings-option', { active: screenReader.mode.value === 'off' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'off')" @click="screenReader.setMode('off')">{{ $t('settings.off') }}</button>
            <button :class="['settings-option', { active: screenReader.mode.value === 'narrate' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'narrate')" @click="screenReader.setMode('narrate')">{{ $t('settings.narrate') }}</button>
            <button :class="['settings-option', { active: screenReader.mode.value === 'screenReader' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'screenReader')" @click="screenReader.setMode('screenReader')">{{ $t('settings.screenReaderMode') }}</button>
          </div>
        </div>
      </div>
    </nav>
    <main id="main-content" class="content">
      <router-view v-slot="{ Component, route }">
        <keep-alive :include="CACHED_VIEWS">
          <component
            :is="Component"
            :key="CACHED_VIEWS.includes(route.name as string) ? (route.name as string) : route.fullPath"
          />
        </keep-alive>
      </router-view>
    </main>
    <ToastNotification />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, provide, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { saveLocale } from './i18n';
import type { SupportedLocale } from './i18n';
import { useFocusStore } from './stores/focus';
import { useDataVersionStore } from './stores/dataVersion';
import { useTTS } from './composables/useTTS';
import { useScreenReaderMode } from './composables/useScreenReaderMode';
import ToastNotification from './components/ToastNotification.vue';

const router = useRouter();
const route = useRoute();
const { locale, t } = useI18n();
const focusStore = useFocusStore();
const dataVersionStore = useDataVersionStore();
const tts = useTTS();
const screenReader = useScreenReaderMode();

type Appearance = 'light' | 'dark' | 'contrast';
const appearance = ref<Appearance>(
  (localStorage.getItem('slaktforskning-appearance') as Appearance) ||
  (localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light')
);

const APPEARANCE_I18N = { light: 'settings.lightMode', dark: 'settings.darkMode', contrast: 'settings.contrastMode' } as const;

function setAppearance(value: Appearance) {
  appearance.value = value;
  localStorage.setItem('slaktforskning-appearance', value);
  document.documentElement.classList.remove('dark', 'high-contrast');
  if (value === 'dark') document.documentElement.classList.add('dark');
  if (value === 'contrast') document.documentElement.classList.add('high-contrast');
  if (screenReader.isTtsEnabled.value) {
    tts.speak(t(APPEARANCE_I18N[value]), locale.value);
  }
}

provide('ttsEnabled', screenReader.isTtsEnabled);
provide('tts', tts);
provide('screenReader', screenReader);

watch(() => route.path, () => {
  if (screenReader.isScreenReader.value) {
    const routeMap: Record<string, string> = {
      '/': 'persons',
      '/relationships': 'relationships',
      '/sources': 'sources',
      '/places': 'places',
      '/research-tasks': 'tasks',
      '/visualisering': 'visualization',
      '/groups': 'groups',
      '/media': 'media',
      '/reports': 'reports',
      '/quality': 'quality',
      '/database': 'database',
      '/import-export': 'importExport',
      '/search': 'search',
    };
    const name = routeMap[route.path] ?? route.path;
    screenReader.announceRoute(name);
  }
});
const CACHED_VIEWS = ['PersonsView', 'RelationshipsView', 'SourcesView', 'PlacesView', 'GroupsView'];
const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const currentDbName = ref('');
const qualityErrorCount = ref(0);
const openTaskCount = ref(0);
const isSettingsOpen = ref(false);
const settingsPanelRef = ref<HTMLElement | null>(null);

function toggleSettings() {
  isSettingsOpen.value = !isSettingsOpen.value;
  if (isSettingsOpen.value) {
    nextTick(() => settingsPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }
}

const RAW_TEXT_SIZE = localStorage.getItem('textSize');
const textSize = ref<'small' | 'medium' | 'large'>(
  (RAW_TEXT_SIZE === 'medium' || RAW_TEXT_SIZE === 'large') ? RAW_TEXT_SIZE : 'small'
);

function applyTextSize() {
  document.documentElement.classList.remove('text-medium', 'text-large');
  if (textSize.value === 'medium') document.documentElement.classList.add('text-medium');
  if (textSize.value === 'large') document.documentElement.classList.add('text-large');
}

const TEXT_SIZE_I18N = { small: 'settings.textSizeSmall', medium: 'settings.textSizeMedium', large: 'settings.textSizeLarge' } as const;

function setTextSize(size: 'small' | 'medium' | 'large') {
  textSize.value = size;
  localStorage.setItem('textSize', size);
  applyTextSize();
  if (screenReader.isTtsEnabled.value) {
    tts.speak(t(TEXT_SIZE_I18N[size]), locale.value);
  }
}

function setLocale(val: SupportedLocale) {
  locale.value = val;
  saveLocale(val);
}

function handleGlobalKey(e: KeyboardEvent) {
  if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  }
}

async function loadDbName() {
  const info = await window.api.db.getCurrent();
  currentDbName.value = info.name;
}

async function autoSetFocusPerson() {
  if (focusStore.personId) return;
  try {
    const persons = await window.api.persons.list();
    if (persons.length > 0) {
      const p = persons[0];
      const name = [p.given_name, p.surname].filter(Boolean).join(' ') || '—';
      focusStore.set(p.id, name);
    }
  } catch { /* ignore */ }
}

async function loadDefaultPerson() {
  if (!window.api?.db?.getSetting) return;
  try {
    const defaultId = await window.api.db.getSetting('default_person_id') as string | null;
    if (defaultId && router.currentRoute.value.path === '/') {
      router.push('/persons/' + defaultId);
    }
  } catch { /* ignore */ }
}

async function loadResearchBadge() {
  if (!window.api?.researchTasks) return;
  try {
    const tasks = await window.api.researchTasks.list();
    openTaskCount.value = tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  } catch { /* ignore */ }
}

async function loadQualityBadge() {
  if (!window.api?.checks) return;
  try {
    const results = await window.api.checks.runAll();
    qualityErrorCount.value = results.filter(r => r.severity === 'error' || r.severity === 'warning').length;
  } catch { /* ignore */ }
}

onMounted(() => {
  setAppearance(appearance.value);
  applyTextSize();
  screenReader.init();
  window.addEventListener('keydown', handleGlobalKey);
  loadDbName();
  loadQualityBadge();
  loadResearchBadge();
  autoSetFocusPerson();
  loadDefaultPerson();
  window.api.db.onSwitched(() => {
    window.location.reload();
  });
  window.addEventListener('data-imported', () => {
    dataVersionStore.increment();
    loadQualityBadge();
    loadResearchBadge();
  });
  let qualityDebounce: ReturnType<typeof setTimeout> | null = null;
  let researchDebounce: ReturnType<typeof setTimeout> | null = null;
  window.api.onDataChanged(() => {
    dataVersionStore.increment();
    if (!focusStore.personId) autoSetFocusPerson();
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
  overflow: hidden;
}

.sidebar {
  width: 220px;
  background: var(--color-primary);
  color: white;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  overflow-y: auto;
}

.sidebar-header {
  padding: 4px 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.sidebar-search {
  margin-bottom: 10px;
  flex-shrink: 0;
}
.sidebar-search-input {
  width: 100%;
  padding: 6px 10px;
  border-radius: 4px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: white;
  font-size: var(--font-sm);
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
  flex-shrink: 0;
}
.focus-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
}
.focus-name {
  font-size: var(--font-xs);
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.focus-name:hover { color: white; text-decoration: underline; }

.nav-section-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.35);
  padding: 2px 10px 6px;
  flex-shrink: 0;
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
  flex-shrink: 0;
}

.sidebar a:hover,
.sidebar a.router-link-active,
.nav-item:hover,
.nav-item.router-link-active {
  background: rgba(255, 255, 255, 0.12);
  color: white;
}

.nav-icon { font-size: var(--font-base); line-height: 1; flex-shrink: 0; }
.nav-label { font-size: var(--font-sm); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sidebar-spacer {
  flex: 1;
}

.nav-bottom {
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  padding-top: 10px !important;
  margin-top: 4px;
  font-size: var(--font-xs) !important;
  color: rgba(255, 255, 255, 0.45) !important;
  flex-direction: row;
  gap: 6px;
  flex-shrink: 0;
}

.nav-bottom:hover,
.nav-bottom.router-link-active {
  color: rgba(255, 255, 255, 0.8) !important;
}

.error-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e53e3e;
  color: white;
  border-radius: 8px;
  padding: 1px 5px;
  font-size: var(--font-xs);
  font-weight: 700;
  min-width: 1.4em;
  height: 1.4em;
  line-height: 1.4em;
  flex-shrink: 0;
}

.content {
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  will-change: scroll-position;
}

@media print {
  .sidebar { display: none !important; }
  .app { display: block; height: auto; }
  .content { padding: 0; height: auto; overflow: visible; }
}

.settings-section {
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  margin-top: 4px;
  padding-top: 4px;
  flex-shrink: 0;
}
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-sm);
  text-align: left;
}
.settings-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
  color: white;
}
.settings-arrow { margin-left: auto; font-size: var(--font-xs); }
.settings-panel {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 10px;
  margin: 2px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.settings-group-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  margin-top: 4px;
}
.settings-group-label:first-child { margin-top: 0; }
.settings-row { display: flex; gap: 4px; }
.settings-option {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-xs);
  font-family: inherit;
  text-align: center;
}
.settings-option:hover {
  background: rgba(255, 255, 255, 0.18);
  color: white;
}
.settings-option.active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  border-color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
}

</style>
