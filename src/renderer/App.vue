<template>
  <div class="app" :class="['app--' + navOrientation]">
    <AppSidebar v-if="navOrientation === 'vertical'" :sections="navSections" variant="renderer">
      <template #bottom>
        <router-link to="/import-export" class="nav-item nav-bottom-item" :aria-label="$t('nav.importExport')">
          <span class="nav-icon" aria-hidden="true">📦</span>
          <span class="nav-label">{{ $t('nav.importExport') }}</span>
        </router-link>
        <router-link to="/settings" class="nav-item nav-bottom-item" :aria-label="$t('nav.settings')">
          <span class="nav-icon" aria-hidden="true">⚙️</span>
          <span class="nav-label">{{ $t('nav.settings') }}</span>
        </router-link>
      </template>
    </AppSidebar>

    <!-- ── Horizontal top-bar layout ───────────────────────────────── -->
    <header v-else class="topbar" aria-label="App header">
      <nav class="topbar-row topbar-row--nav" aria-label="Main navigation" @click.stop>
        <span class="topbar-title">🌿 {{ $t('app.title') }}</span>
        <template v-for="sec in navSections" :key="sec.key">
          <!-- Flat section: items inline, no dropdown -->
          <div v-if="sec.flat" class="nav-flat-group">
            <span class="nav-flat-label">{{ $t(sec.labelKey) }}</span>
            <router-link
              v-for="item in sec.items"
              :key="item.to"
              :to="item.to"
              class="nav-item"
            >
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span class="nav-label">{{ $t(item.labelKey) }}</span>
              <span v-if="item.badge && item.badge.value > 0" class="error-badge">{{ item.badge.value }}</span>
            </router-link>
          </div>
          <!-- Dropdown section -->
          <div v-else class="nav-section">
            <button
              type="button"
              class="nav-section-toggle"
              :class="{ 'nav-section-toggle--active': isSectionActive(sec) || openSection === sec.key }"
              :aria-expanded="openSection === sec.key"
              @click="toggleSection(sec.key)"
            >
              <span>{{ $t(sec.labelKey) }}</span>
              <span class="nav-section-arrow">{{ openSection === sec.key ? '▴' : '▾' }}</span>
            </button>
            <div v-if="openSection === sec.key" class="nav-section-menu" role="menu">
              <router-link
                v-for="item in sec.items"
                :key="item.to"
                :to="item.to"
                class="nav-section-item"
                role="menuitem"
                @click="openSection = null"
              >
                <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
                <span>{{ $t(item.labelKey) }}</span>
                <span v-if="item.badge && item.badge.value > 0" class="error-badge">{{ item.badge.value }}</span>
              </router-link>
            </div>
          </div>
        </template>
        <span class="nav-spacer"></span>
        <router-link to="/import-export" class="nav-item nav-item--quiet">
          <span class="nav-icon" aria-hidden="true">📦</span>
          <span class="nav-label">{{ $t('nav.importExport') }}</span>
        </router-link>
        <router-link to="/settings" class="nav-item nav-item--quiet">
          <span class="nav-icon" aria-hidden="true">⚙️</span>
          <span class="nav-label">{{ $t('nav.settings') }}</span>
        </router-link>
        <div class="topbar-settings">
          <AppSettingsPanel variant="renderer" />
        </div>
      </nav>
    </header>

    <main
      id="main-content"
      :class="['content', { 'content-paneled': isPaneledView }]"
      :aria-label="mainAriaLabel"
      @click="openSection = null"
    >
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
    <AboutModal :visible="aboutVisible" @close="aboutVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDataVersionStore } from './stores/dataVersion';
import { usePersonNameOptions } from './stores/personNameOptions';
import { useLinkRulesStore } from './stores/linkRules';
import { useTTS } from './composables/useTTS';
import { useScreenReaderMode } from './composables/useScreenReaderMode';
import ToastNotification from './components/ToastNotification.vue';
import AboutModal from './components/AboutModal.vue';
import AppSettingsPanel from './components/AppSettingsPanel.vue';
import AppSidebar from './components/AppSidebar.vue';
import { useToast } from './composables/useToast';
import { useAppUpdater } from './composables/useAppUpdater';
import { STORAGE_KEYS } from './utils/storage-keys';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const dataVersionStore = useDataVersionStore();
const personNameOptions = usePersonNameOptions();
const linkRulesStore = useLinkRulesStore();
const tts = useTTS();
const screenReader = useScreenReaderMode();
const toast = useToast();
const updater = useAppUpdater();

// About dialog — opened from the macOS app menu's "About Släktforskning" item
// (Rust: src-tauri/src/lib.rs `build_menu` → 'menu:item' event → main.ts
// dispatches the 'app:openAbout' window event we listen for below).
const aboutVisible = ref(false);

declare const window: Window & {
  api: {
    app?: {
      onOpenAbout: (cb: () => void) => void;
    };
  };
};
if (typeof window !== 'undefined' && window.api?.app?.onOpenAbout) {
  window.api.app.onOpenAbout(() => { aboutVisible.value = true; });
}
// In-renderer entry points (e.g. SettingsView's About link) dispatch a
// CustomEvent on the window so we open the same modal without round-
// tripping through the main process. Registered in onMounted / removed in
// onUnmounted alongside the other window listeners.
const onOpenAboutEvent = () => { aboutVisible.value = true; };

// Nav orientation: vertical (left sidebar) or horizontal (top-bar with section
// dropdowns). Owned by <AppSettingsPanel>; we mirror it locally so the
// template can reactively switch layouts. The component dispatches
// `app-settings-changed` on every write; we sync on receipt.
type NavOrientation = 'vertical' | 'horizontal';
const navOrientation = ref<NavOrientation>(
  (localStorage.getItem(STORAGE_KEYS.navOrientation) as NavOrientation) || 'vertical'
);

// Add-family-member button style — controls whether the badge in each
// chart person-box is a round + or a tilted leaf. Owned by
// <AppSettingsPanel>; mirrored here so charts can inject the ref reactively
// through `appearance-store`.
type AddBtnStyle = 'plus' | 'leaf';
const addBtnStyle = ref<AddBtnStyle>(
  (localStorage.getItem(STORAGE_KEYS.addBtnStyle) as AddBtnStyle) || 'plus'
);

function onAppSettingsChanged(e: Event) {
  const ev = e as CustomEvent<{ key: string; value: string }>;
  const detail = ev.detail;
  if (!detail) return;
  if (detail.key === 'navOrientation') navOrientation.value = detail.value as NavOrientation;
  else if (detail.key === 'addBtnStyle') addBtnStyle.value = detail.value as AddBtnStyle;
}

provide('ttsEnabled', screenReader.isTtsEnabled);
provide('tts', tts);
provide('screenReader', screenReader);
// Appearance state shared with SettingsView's Utseende tab so both the
// sidebar/topbar popover and /settings stay in sync without duplicating refs.
// Setters live in <AppSettingsPanel>; consumers (chart components) only need
// to *read* these refs, which mirror localStorage via the
// `app-settings-changed` window event bridged in onMounted.
provide('appearance-store', {
  navOrientation,
  addBtnStyle,
});

// Updater toast: fires once when `available` flips from null → an update.
// The toast is awareness only — install happens from the About modal.
watch(() => updater.available.value, (next, prev) => {
  if (next && !prev) {
    toast.info(t('updater.toastAvailable', { version: next.version }));
  }
});

watch(() => route.path, () => {
  if (screenReader.isScreenReader.value) {
    const routeMap: Record<string, string> = {
      '/': 'persons',
      '/persons': 'persons',
      '/sources': 'sources',
      '/places': 'places',
      '/map': 'map',
      '/research-tasks': 'tasks',
      '/groups': 'groups',
      '/media': 'media',
      '/reports': 'reports',
      '/prints': 'framablePrints',
      '/website': 'website',
      '/quality': 'quality',
      '/database': 'database',
      '/import-export': 'importExport',
      '/search': 'search',
      '/link-rules': 'linkRules',
      '/gazetteers': 'gazetteers',
      '/settings': 'settings',
    };
    const name = routeMap[route.path]
      ?? Object.entries(routeMap).find(([prefix]) => prefix !== '/' && route.path.startsWith(prefix + '/'))?.[1]
      ?? route.path;
    screenReader.announceRoute(name);
  }
});
const CACHED_VIEWS = ['PersonsView', 'SourcesView', 'PlacesView', 'GroupsView', 'ResearchTasksView'];
const PANELED_ROUTES = ['/persons', '/media', '/places', '/reports', '/prints', '/sources', '/groups', '/research-tasks', '/website'];
const isPaneledView = computed(() => PANELED_ROUTES.some(r => route.path.startsWith(r)));

// Accessible name for the <main> landmark, derived from the active route. A
// screen-reader user navigating by landmark (D in NVDA, VO+U in VoiceOver)
// hears this as the region's name. Falls back to the app title for routes
// without an explicit i18n entry (e.g. /search subroutes), which is still
// better than an unnamed landmark.
const ROUTE_TITLE_KEYS: Array<{ prefix: string; key: string }> = [
  { prefix: '/persons', key: 'nav.people' },
  { prefix: '/places', key: 'places.title' },
  { prefix: '/media', key: 'media.nav' },
  { prefix: '/search', key: 'nav.search' },
  { prefix: '/groups', key: 'nav.groups' },
  { prefix: '/research-tasks', key: 'nav.researchTasks' },
  { prefix: '/sources', key: 'nav.sources' },
  { prefix: '/quality', key: 'nav.quality' },
  { prefix: '/duplicates', key: 'nav.duplicates' },
  { prefix: '/reports', key: 'reports.nav' },
  { prefix: '/prints', key: 'nav.framablePrints' },
  { prefix: '/website', key: 'nav.website' },
  { prefix: '/import-export', key: 'nav.importExport' },
  { prefix: '/settings', key: 'nav.settings' },
];
const mainAriaLabel = computed(() => {
  const path = route.path;
  if (path === '/') return t('nav.people');
  // Longest-prefix match so '/research-tasks/123' wins over '/' and '/persons/abc' over '/'
  let best: { prefix: string; key: string } | null = null;
  for (const entry of ROUTE_TITLE_KEYS) {
    if (path === entry.prefix || path.startsWith(entry.prefix + '/')) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best ? t(best.key) : t('app.title');
});
const qualityErrorCount = ref(0);
const openTaskCount = ref(0);
const duplicateCount = ref(0);

// Section dropdowns (horizontal mode). The same items as the vertical
// sidebar's section labels, just grouped behind toggle buttons.
type NavSectionKey = 'research' | 'organize' | 'review' | 'present';
interface NavItemDef { to: string; icon: string; labelKey: string; badge?: { value: number } }
interface NavSectionDef { key: NavSectionKey; labelKey: string; items: NavItemDef[]; flat?: boolean }
const navSections = computed<NavSectionDef[]>(() => [
  {
    key: 'research',
    labelKey: 'nav.research',
    items: [
      { to: '/', icon: '👤', labelKey: 'nav.people' },
      { to: '/places', icon: '📍', labelKey: 'places.title' },
      { to: '/media', icon: '📷', labelKey: 'media.nav' },
      { to: '/search', icon: '🔍', labelKey: 'nav.search' },
    ],
  },
  {
    key: 'organize',
    labelKey: 'nav.organize',
    items: [
      { to: '/groups', icon: '🏷️', labelKey: 'nav.groups' },
      { to: '/research-tasks', icon: '🔬', labelKey: 'nav.researchTasks', badge: openTaskCount },
    ],
  },
  {
    key: 'review',
    labelKey: 'nav.review',
    items: [
      { to: '/sources', icon: '📚', labelKey: 'nav.sources' },
      { to: '/repositories', icon: '🏛️', labelKey: 'repositories.nav' },
      { to: '/quality', icon: '⚠️', labelKey: 'nav.quality', badge: qualityErrorCount },
      { to: '/duplicates', icon: '👥', labelKey: 'nav.duplicates', badge: duplicateCount },
    ],
  },
  {
    key: 'present',
    labelKey: 'nav.present',
    items: [
      { to: '/reports', icon: '🖨️', labelKey: 'reports.nav' },
      { to: '/prints', icon: '🖼️', labelKey: 'nav.framablePrints' },
      { to: '/website', icon: '🌐', labelKey: 'nav.website' },
    ],
  },
]);
const openSection = ref<NavSectionKey | null>(null);
function toggleSection(key: NavSectionKey) {
  openSection.value = openSection.value === key ? null : key;
}
function isSectionActive(sec: NavSectionDef): boolean {
  return sec.items.some(it => {
    if (it.to === '/') return route.path === '/' || route.path.startsWith('/persons');
    return route.path.startsWith(it.to);
  });
}
function handleDocClick() { openSection.value = null; }

function handleGlobalKey(e: KeyboardEvent) {
  if (e.key === 'Escape') openSection.value = null;
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
    const results = await window.api.checks.runAll() as Array<{ severity: string; personIds?: string[] }> | null;
    if (results === null) return;
    qualityErrorCount.value = results.filter(r => r.severity === 'error' || r.severity === 'warning').length;
    // Persons-list "Kvalitet" column reads from a cache table that we
    // refresh from the same runAll output. See plan
    // 2026-05-09-persons-list-aggregate-columns.
    if (window.api.persons?.refreshQualityIssueCounts) {
      const counts: Record<string, number> = {};
      for (const r of results) {
        if (!r.personIds) continue;
        for (const id of r.personIds) counts[id] = (counts[id] ?? 0) + 1;
      }
      try {
        await window.api.persons.refreshQualityIssueCounts(counts);
      } catch { /* cache refresh is best-effort */ }
    }
  } catch { /* ignore */ }
}

async function loadDuplicatesBadge() {
  if (!window.api?.duplicates?.count) return;
  try {
    duplicateCount.value = await window.api.duplicates.count();
  } catch { /* ignore */ }
}

let qualityDebounce: ReturnType<typeof setTimeout> | null = null;
let researchDebounce: ReturnType<typeof setTimeout> | null = null;
let duplicatesDebounce: ReturnType<typeof setTimeout> | null = null;

function onDataImported() {
  dataVersionStore.increment();
  // Debounce heavy checks so navigation/data loading IPC isn't blocked
  if (qualityDebounce) clearTimeout(qualityDebounce);
  qualityDebounce = setTimeout(loadQualityBadge, 2000);
  if (researchDebounce) clearTimeout(researchDebounce);
  researchDebounce = setTimeout(loadResearchBadge, 400);
  if (duplicatesDebounce) clearTimeout(duplicatesDebounce);
  duplicatesDebounce = setTimeout(loadDuplicatesBadge, 2000);
}

onMounted(() => {
  screenReader.init();
  window.addEventListener('keydown', handleGlobalKey);
  window.addEventListener('click', handleDocClick);
  window.addEventListener('app-settings-changed', onAppSettingsChanged);
  loadDefaultPerson();
  personNameOptions.init();
  linkRulesStore.init();
  // Delay heavy quality checks so initial navigation/data loading isn't blocked
  setTimeout(loadQualityBadge, 5000);
  setTimeout(loadDuplicatesBadge, 5000);
  setTimeout(loadResearchBadge, 1000);
  // Tauri-only: schedule a one-shot updater check 5s after mount. The
  // watcher on `updater.available` below fires the toast when a new
  // version is found; AboutModal exposes the install button.
  updater.checkOnBoot();
  window.api?.db?.onSwitched?.(() => {
    // `personNameOptions` is per-DB; the page reload re-runs onMounted,
    // which re-invokes init() against the newly-active DB.
    window.location.reload();
  });
  // Undo/redo: show toast and refresh data
  window.api?.undo?.onPerformed?.((data: { type: string; label: string }) => {
    const actionLabel = t(data.label);
    const msg = data.type === 'undo' ? t('undo.undone', { action: actionLabel }) : t('undo.redone', { action: actionLabel });
    toast.info(msg);
  });
  window.api?.undo?.onChanged?.(() => {
    dataVersionStore.increment();
    if (qualityDebounce) clearTimeout(qualityDebounce);
    qualityDebounce = setTimeout(loadQualityBadge, 800);
    if (researchDebounce) clearTimeout(researchDebounce);
    researchDebounce = setTimeout(loadResearchBadge, 400);
    if (duplicatesDebounce) clearTimeout(duplicatesDebounce);
    duplicatesDebounce = setTimeout(loadDuplicatesBadge, 800);
  });
  window.addEventListener('data-imported', onDataImported);
  window.addEventListener('app:openAbout', onOpenAboutEvent);
  window.api?.onDataChanged?.(() => {
    dataVersionStore.increment();
    if (qualityDebounce) clearTimeout(qualityDebounce);
    qualityDebounce = setTimeout(loadQualityBadge, 800);
    if (researchDebounce) clearTimeout(researchDebounce);
    researchDebounce = setTimeout(loadResearchBadge, 400);
    if (duplicatesDebounce) clearTimeout(duplicatesDebounce);
    duplicatesDebounce = setTimeout(loadDuplicatesBadge, 800);
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey);
  window.removeEventListener('click', handleDocClick);
  window.removeEventListener('app-settings-changed', onAppSettingsChanged);
  window.removeEventListener('data-imported', onDataImported);
  window.removeEventListener('app:openAbout', onOpenAboutEvent);
});

</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--surface-bg);
  color: var(--text-primary);
}

.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--surface-bg);
  padding: var(--space-md);
  gap: var(--space-md);
  box-sizing: border-box;
}
.app--horizontal { flex-direction: column; }

/* ── Top bar (horizontal nav orientation) ──────────────────────── */
.topbar {
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  border-radius: var(--radius-lg);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 50;
}
.topbar-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 8px 16px;
}
.topbar-row--nav { flex-wrap: wrap; gap: 8px; padding: 4px 12px; }
.topbar-title {
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--sidebar-active-text);
  flex-shrink: 0;
  margin-right: var(--space-md);
}

.topbar-settings { position: relative; flex-shrink: 0; }
.topbar-settings .settings-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: var(--sidebar-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  padding: 12px;
  min-width: 220px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
}

.nav-spacer { flex: 1; min-width: 0; }

/* Flat sections (e.g. Organisera) — inline items in the top bar with a small
   uppercase label tag instead of a dropdown button. */
.nav-flat-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.nav-flat-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sidebar-text-muted);
  padding: 0 6px 0 8px;
  margin-left: 4px;
  border-left: 1px solid var(--sidebar-border);
}
.nav-section { position: relative; flex-shrink: 0; }
.nav-section-toggle {
  background: none;
  border: none;
  color: var(--sidebar-text);
  padding: 7px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-sm);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.nav-section-toggle:hover { background: var(--sidebar-active-bg); color: var(--sidebar-active-text); }
.nav-section-toggle--active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  box-shadow: inset 0 -2px 0 var(--accent);
}
.nav-section-arrow { font-size: var(--font-xs); color: var(--sidebar-text-muted); }
.nav-section-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  background: var(--sidebar-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  padding: 4px;
  min-width: 180px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
}
.nav-section-item {
  color: var(--sidebar-text);
  text-decoration: none;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-sm);
  white-space: nowrap;
}
.nav-section-item:hover { background: var(--sidebar-active-bg); color: var(--sidebar-active-text); }
.nav-section-item.router-link-active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  box-shadow: inset 2px 0 0 var(--accent);
}
.topbar-row--nav .nav-item { padding: 6px 12px; }
.nav-item--quiet { opacity: 0.85; }

.nav-section-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--sidebar-text-muted);
  padding: 2px 10px 6px;
  flex-shrink: 0;
}

.nav-item {
  color: var(--sidebar-text);
  text-decoration: none;
  padding: 7px 10px;
  border-radius: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.nav-item:hover,
.nav-item.router-link-active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
}

.nav-icon { font-size: var(--font-base); line-height: 1; flex-shrink: 0; }
.nav-label { font-size: var(--font-sm); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.nav-bottom-item {
  margin-top: 2px;
}

.error-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--error-bg);
  color: var(--error-text);
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
  min-width: 0;
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  will-change: scroll-position;
  background: var(--surface);
  border-radius: var(--radius-lg);
}
.content-paneled {
  padding: 0;
  background: transparent;
  border-radius: 0;
  overflow: hidden;
}

@media print {
  .topbar { display: none !important; }
  .app { display: block; height: auto; padding: 0; gap: 0; background: none; }
  .content, .content-paneled { padding: 0; height: auto; overflow: visible !important; background: none; border-radius: 0; }
  body { background: none; }
}


</style>
