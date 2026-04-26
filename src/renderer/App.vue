<template>
  <div class="app" :class="['app--' + navOrientation]">
    <a href="#main-content" class="skip-link">{{ $t('a11y.skipToMain') }}</a>
    <nav v-if="navOrientation === 'vertical'" class="sidebar" aria-label="Main navigation">
      <div class="sidebar-header">
        <span class="sidebar-title">🌿 {{ $t('app.title') }}</span>
      </div>
      <div class="sidebar-search">
        <PersonPicker
          ref="searchPickerRef"
          :model-value="null"
          :placeholder="$t('app.search')"
          @select="onSidebarPersonSelected"
        />
      </div>
      <h2 class="nav-section-label">{{ $t('nav.research') }}</h2>
      <router-link to="/" class="nav-item" :aria-label="$t('nav.people')">
        <span class="nav-icon" aria-hidden="true">👤</span>
        <span class="nav-label">{{ $t('nav.people') }}</span>
      </router-link>
      <router-link to="/places" class="nav-item" :aria-label="$t('places.title')">
        <span class="nav-icon" aria-hidden="true">📍</span>
        <span class="nav-label">{{ $t('places.title') }}</span>
      </router-link>
      <router-link to="/media" class="nav-item" :aria-label="$t('media.nav')">
        <span class="nav-icon" aria-hidden="true">📷</span>
        <span class="nav-label">{{ $t('media.nav') }}</span>
      </router-link>
      <h2 class="nav-section-label">{{ $t('nav.organize') }}</h2>
      <router-link to="/groups" class="nav-item" :aria-label="$t('nav.groups')">
        <span class="nav-icon" aria-hidden="true">🏷️</span>
        <span class="nav-label">{{ $t('nav.groups') }}</span>
      </router-link>
      <router-link to="/research-tasks" class="nav-item" :aria-label="openTaskCount > 0 ? $t('nav.researchTasks') + ', ' + openTaskCount + ' ' + $t('a11y.openTasks', { count: openTaskCount }) : $t('nav.researchTasks')">
        <span class="nav-icon" aria-hidden="true">🔬</span>
        <span class="nav-label">{{ $t('nav.researchTasks') }}</span>
        <span v-if="openTaskCount > 0" class="error-badge">{{ openTaskCount }}</span>
      </router-link>
      <h2 class="nav-section-label">{{ $t('nav.review') }}</h2>
      <router-link to="/sources" class="nav-item" :aria-label="$t('nav.sources')">
        <span class="nav-icon" aria-hidden="true">📚</span>
        <span class="nav-label">{{ $t('nav.sources') }}</span>
      </router-link>
      <router-link to="/relationships" class="nav-item" :aria-label="$t('nav.relationships')">
        <span class="nav-icon" aria-hidden="true">🔗</span>
        <span class="nav-label">{{ $t('nav.relationships') }}</span>
      </router-link>
      <router-link to="/quality" class="nav-item" :aria-label="qualityErrorCount > 0 ? $t('nav.quality') + ', ' + qualityErrorCount + ' ' + $t('a11y.qualityIssues', { count: qualityErrorCount }) : $t('nav.quality')">
        <span class="nav-icon" aria-hidden="true">⚠️</span>
        <span class="nav-label">{{ $t('nav.quality') }}</span>
        <span v-if="qualityErrorCount > 0" class="error-badge">{{ qualityErrorCount }}</span>
      </router-link>
      <router-link to="/duplicates" class="nav-item" :aria-label="$t('nav.duplicates')">
        <span class="nav-icon" aria-hidden="true">👥</span>
        <span class="nav-label">{{ $t('nav.duplicates') }}</span>
      </router-link>
      <h2 class="nav-section-label">{{ $t('nav.present') }}</h2>
      <router-link to="/reports" class="nav-item" :aria-label="$t('reports.nav')">
        <span class="nav-icon" aria-hidden="true">🖨️</span>
        <span class="nav-label">{{ $t('reports.nav') }}</span>
      </router-link>
      <router-link to="/prints" class="nav-item" :aria-label="$t('nav.framablePrints')">
        <span class="nav-icon" aria-hidden="true">🖼️</span>
        <span class="nav-label">{{ $t('nav.framablePrints') }}</span>
      </router-link>
      <router-link to="/website" class="nav-item" :aria-label="$t('nav.website')">
        <span class="nav-icon" aria-hidden="true">🌐</span>
        <span class="nav-label">{{ $t('nav.website') }}</span>
      </router-link>
      <div class="sidebar-spacer"></div>
      <router-link to="/import-export" class="nav-item nav-bottom-item" :aria-label="$t('nav.importExport')">
        <span class="nav-icon" aria-hidden="true">📦</span>
        <span class="nav-label">{{ $t('nav.importExport') }}</span>
      </router-link>
      <router-link to="/settings" class="nav-item nav-bottom-item" :aria-label="$t('nav.settings')">
        <span class="nav-icon" aria-hidden="true">⚙️</span>
        <span class="nav-label">{{ $t('nav.settings') }}</span>
      </router-link>
      <div class="settings-section">
        <button class="settings-toggle" :aria-expanded="isSettingsOpen" :aria-label="$t('a11y.settings')" @click="isSettingsOpen = !isSettingsOpen">
          <span class="nav-icon" aria-hidden="true">🎨</span>
          <span class="nav-label">{{ $t('settings.appearance') }}</span>
          <span class="settings-arrow">{{ isSettingsOpen ? '▴' : '▾' }}</span>
        </button>
        <div v-if="isSettingsOpen" class="settings-panel">
          <div class="settings-group-label">{{ $t('settings.menuLayout') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.menuLayout')">
            <button :class="['settings-option', { active: navOrientation === 'vertical' }]" role="radio" :aria-checked="String(navOrientation === 'vertical')" @click="setNavOrientation('vertical')">{{ $t('settings.menuVertical') }}</button>
            <button :class="['settings-option', { active: navOrientation === 'horizontal' }]" role="radio" :aria-checked="String(navOrientation === 'horizontal')" @click="setNavOrientation('horizontal')">{{ $t('settings.menuHorizontal') }}</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.appearance') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.appearance')">
            <button :class="['settings-option', { active: appearance === 'light' }]" role="radio" :aria-checked="String(appearance === 'light')" @click="setAppearance('light')">☀</button>
            <button :class="['settings-option', { active: appearance === 'dark' }]" role="radio" :aria-checked="String(appearance === 'dark')" @click="setAppearance('dark')">🌙</button>
            <button :class="['settings-option', { active: appearance === 'contrast' }]" role="radio" :aria-checked="String(appearance === 'contrast')" @click="setAppearance('contrast')">👁</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.theme') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.theme')">
            <button :class="['settings-option', { active: currentTheme === 'forest' }]" role="radio" :aria-checked="String(currentTheme === 'forest')" @click="setTheme('forest')">🌲</button>
            <button :class="['settings-option', { active: currentTheme === 'nordic' }]" role="radio" :aria-checked="String(currentTheme === 'nordic')" @click="setTheme('nordic')">❄️</button>
            <button :class="['settings-option', { active: currentTheme === 'twilight' }]" role="radio" :aria-checked="String(currentTheme === 'twilight')" @click="setTheme('twilight')">🌅</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.addBtnStyle') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.addBtnStyle')">
            <button :class="['settings-option', { active: addBtnStyle === 'plus' }]" role="radio" :aria-checked="String(addBtnStyle === 'plus')" :title="$t('settings.addBtnPlus')" @click="setAddBtnStyle('plus')">＋</button>
            <button :class="['settings-option', { active: addBtnStyle === 'leaf' }]" role="radio" :aria-checked="String(addBtnStyle === 'leaf')" :title="$t('settings.addBtnLeaf')" @click="setAddBtnStyle('leaf')">🍃</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.textSize') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.textSize')">
            <button :class="['settings-option', { active: textSize === 'small' }]" role="radio" :aria-checked="String(textSize === 'small')" @click="setTextSize('small')">S</button>
            <button :class="['settings-option', { active: textSize === 'medium' }]" role="radio" :aria-checked="String(textSize === 'medium')" @click="setTextSize('medium')">M</button>
            <button :class="['settings-option', { active: textSize === 'large' }]" role="radio" :aria-checked="String(textSize === 'large')" @click="setTextSize('large')">L</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.readAloud') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.readAloud')">
            <button :class="['settings-option', { active: screenReader.mode.value === 'off' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'off')" :aria-label="$t('settings.off')" @click="screenReader.setMode('off')">🔇</button>
            <button :class="['settings-option', { active: screenReader.mode.value === 'narrate' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'narrate')" :aria-label="$t('settings.narrate')" @click="screenReader.setMode('narrate')">🔊</button>
            <button :class="['settings-option', { active: screenReader.mode.value === 'screenReader' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'screenReader')" :aria-label="$t('settings.screenReaderMode')" @click="screenReader.setMode('screenReader')">♿</button>
          </div>
          <div class="settings-group-label">{{ $t('settings.language') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.language')">
            <button :class="['settings-option', { active: locale === 'sv' }]" role="radio" :aria-checked="String(locale === 'sv')" @click="setLocale('sv')">Sv</button>
            <button :class="['settings-option', { active: locale === 'en' }]" role="radio" :aria-checked="String(locale === 'en')" @click="setLocale('en')">En</button>
          </div>
        </div>
      </div>
    </nav>

    <!-- ── Horizontal top-bar layout ───────────────────────────────── -->
    <header v-else class="topbar" aria-label="App header">
      <div class="topbar-row topbar-row--meta">
        <span class="topbar-title">🌿 {{ $t('app.title') }}</span>
        <form class="topbar-search" @submit.prevent="submitSearch">
          <input
            ref="searchInputRefH"
            v-model="searchQuery"
            type="text"
            :placeholder="$t('app.search')"
            class="topbar-search-input"
          />
        </form>
        <div class="topbar-focus-spacer"></div>
      </div>
      <nav class="topbar-row topbar-row--nav" aria-label="Main navigation" @click.stop>
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
          <button
            class="topbar-settings-toggle"
            :aria-expanded="isSettingsOpen"
            :aria-label="$t('a11y.settings')"
            @click.stop="isSettingsOpen = !isSettingsOpen"
          >
            <span aria-hidden="true">🎨</span>
            <span class="nav-label">{{ $t('settings.appearance') }}</span>
          </button>
          <div v-if="isSettingsOpen" class="settings-panel topbar-settings-panel">
            <div class="settings-group-label">{{ $t('settings.menuLayout') }}</div>
            <div class="settings-row" role="radiogroup" :aria-label="$t('settings.menuLayout')">
              <button :class="['settings-option', { active: navOrientation === 'vertical' }]" role="radio" :aria-checked="String(navOrientation === 'vertical')" @click="setNavOrientation('vertical')">{{ $t('settings.menuVertical') }}</button>
              <button :class="['settings-option', { active: navOrientation === 'horizontal' }]" role="radio" :aria-checked="String(navOrientation === 'horizontal')" @click="setNavOrientation('horizontal')">{{ $t('settings.menuHorizontal') }}</button>
            </div>
            <div class="settings-group-label">{{ $t('settings.appearance') }}</div>
            <div class="settings-row" role="radiogroup" :aria-label="$t('settings.appearance')">
              <button :class="['settings-option', { active: appearance === 'light' }]" role="radio" :aria-checked="String(appearance === 'light')" @click="setAppearance('light')">☀</button>
              <button :class="['settings-option', { active: appearance === 'dark' }]" role="radio" :aria-checked="String(appearance === 'dark')" @click="setAppearance('dark')">🌙</button>
              <button :class="['settings-option', { active: appearance === 'contrast' }]" role="radio" :aria-checked="String(appearance === 'contrast')" @click="setAppearance('contrast')">👁</button>
            </div>
            <div class="settings-group-label">{{ $t('settings.theme') }}</div>
            <div class="settings-row" role="radiogroup" :aria-label="$t('settings.theme')">
              <button :class="['settings-option', { active: currentTheme === 'forest' }]" role="radio" :aria-checked="String(currentTheme === 'forest')" @click="setTheme('forest')">🌲</button>
              <button :class="['settings-option', { active: currentTheme === 'nordic' }]" role="radio" :aria-checked="String(currentTheme === 'nordic')" @click="setTheme('nordic')">❄️</button>
              <button :class="['settings-option', { active: currentTheme === 'twilight' }]" role="radio" :aria-checked="String(currentTheme === 'twilight')" @click="setTheme('twilight')">🌅</button>
            </div>
            <div class="settings-group-label">{{ $t('settings.addBtnStyle') }}</div>
            <div class="settings-row" role="radiogroup" :aria-label="$t('settings.addBtnStyle')">
              <button :class="['settings-option', { active: addBtnStyle === 'plus' }]" role="radio" :aria-checked="String(addBtnStyle === 'plus')" :title="$t('settings.addBtnPlus')" @click="setAddBtnStyle('plus')">＋</button>
              <button :class="['settings-option', { active: addBtnStyle === 'leaf' }]" role="radio" :aria-checked="String(addBtnStyle === 'leaf')" :title="$t('settings.addBtnLeaf')" @click="setAddBtnStyle('leaf')">🍃</button>
            </div>
            <div class="settings-group-label">{{ $t('settings.textSize') }}</div>
            <div class="settings-row" role="radiogroup" :aria-label="$t('settings.textSize')">
              <button :class="['settings-option', { active: textSize === 'small' }]" role="radio" :aria-checked="String(textSize === 'small')" @click="setTextSize('small')">S</button>
              <button :class="['settings-option', { active: textSize === 'medium' }]" role="radio" :aria-checked="String(textSize === 'medium')" @click="setTextSize('medium')">M</button>
              <button :class="['settings-option', { active: textSize === 'large' }]" role="radio" :aria-checked="String(textSize === 'large')" @click="setTextSize('large')">L</button>
            </div>
            <div class="settings-group-label">{{ $t('settings.readAloud') }}</div>
            <div class="settings-row" role="radiogroup" :aria-label="$t('settings.readAloud')">
              <button :class="['settings-option', { active: screenReader.mode.value === 'off' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'off')" :aria-label="$t('settings.off')" @click="screenReader.setMode('off')">🔇</button>
              <button :class="['settings-option', { active: screenReader.mode.value === 'narrate' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'narrate')" :aria-label="$t('settings.narrate')" @click="screenReader.setMode('narrate')">🔊</button>
              <button :class="['settings-option', { active: screenReader.mode.value === 'screenReader' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'screenReader')" :aria-label="$t('settings.screenReaderMode')" @click="screenReader.setMode('screenReader')">♿</button>
            </div>
            <div class="settings-group-label">{{ $t('settings.language') }}</div>
            <div class="settings-row" role="radiogroup" :aria-label="$t('settings.language')">
              <button :class="['settings-option', { active: locale === 'sv' }]" role="radio" :aria-checked="String(locale === 'sv')" @click="setLocale('sv')">Sv</button>
              <button :class="['settings-option', { active: locale === 'en' }]" role="radio" :aria-checked="String(locale === 'en')" @click="setLocale('en')">En</button>
            </div>
          </div>
        </div>
      </nav>
    </header>

    <main id="main-content" :class="['content', { 'content-paneled': isPaneledView }]" @click="openSection = null">
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
import { ref, computed, onMounted, onUnmounted, provide, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { saveLocale } from './i18n';
import type { SupportedLocale } from './i18n';
import { useSelectedPersonStore } from './stores/selectedPerson';
import { useDataVersionStore } from './stores/dataVersion';
import PersonPicker from './components/PersonPicker.vue';
import { useTTS } from './composables/useTTS';
import { useScreenReaderMode } from './composables/useScreenReaderMode';
import ToastNotification from './components/ToastNotification.vue';
import { useToast } from './composables/useToast';

const router = useRouter();
const route = useRoute();
const { locale, t } = useI18n();
const selectedStore = useSelectedPersonStore();
const dataVersionStore = useDataVersionStore();
const tts = useTTS();
const screenReader = useScreenReaderMode();
const toast = useToast();

type Appearance = 'light' | 'dark' | 'contrast';
const appearance = ref<Appearance>(
  (localStorage.getItem('slaktforskning-appearance') as Appearance) ||
  (localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light')
);

const THEME_CLASSES = ['theme-forest', 'theme-nordic', 'theme-twilight'] as const;
type Theme = 'forest' | 'nordic' | 'twilight';
const currentTheme = ref<Theme>(
  (localStorage.getItem('slaktforskning-theme') as Theme) || 'forest'
);

function setTheme(theme: Theme) {
  currentTheme.value = theme;
  document.documentElement.classList.remove(...THEME_CLASSES);
  document.documentElement.classList.add(`theme-${theme}`);
  localStorage.setItem('slaktforskning-theme', theme);
}

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

// --- Sidebar / topbar appearance panel ---
const isSettingsOpen = ref(false);

// Nav orientation: vertical (left sidebar) or horizontal (top-bar with section
// dropdowns). Persisted in localStorage; UI preference, not db_settings.
type NavOrientation = 'vertical' | 'horizontal';
const navOrientation = ref<NavOrientation>(
  (localStorage.getItem('slaktforskning-nav-orientation') as NavOrientation) || 'vertical'
);
function setNavOrientation(value: NavOrientation) {
  navOrientation.value = value;
  localStorage.setItem('slaktforskning-nav-orientation', value);
}

// Add-family-member button style — controls whether the badge in each
// chart person-box is a round + or a tilted leaf. Persisted in
// localStorage; provided through `appearance-store` so charts read it
// reactively.
type AddBtnStyle = 'plus' | 'leaf';
const addBtnStyle = ref<AddBtnStyle>(
  (localStorage.getItem('slaktforskning-add-btn-style') as AddBtnStyle) || 'plus'
);
function setAddBtnStyle(value: AddBtnStyle) {
  addBtnStyle.value = value;
  localStorage.setItem('slaktforskning-add-btn-style', value);
}

provide('ttsEnabled', screenReader.isTtsEnabled);
provide('tts', tts);
provide('screenReader', screenReader);
// Appearance state shared with SettingsView's Utseende tab so both the
// sidebar/topbar popover and /settings stay in sync without duplicating refs.
provide('appearance-store', {
  navOrientation,
  setNavOrientation,
  addBtnStyle,
  setAddBtnStyle,
});

watch(() => route.path, () => {
  if (screenReader.isScreenReader.value) {
    const routeMap: Record<string, string> = {
      '/': 'persons',
      '/persons': 'persons',
      '/relationships': 'relationships',
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
const CACHED_VIEWS = ['PersonsView', 'RelationshipsView', 'SourcesView', 'PlacesView', 'GroupsView', 'ResearchTasksView'];
const PANELED_ROUTES = ['/persons', '/media', '/places', '/reports', '/prints', '/sources', '/relationships', '/groups', '/research-tasks'];
const isPaneledView = computed(() => PANELED_ROUTES.some(r => route.path.startsWith(r)));
const searchQuery = ref('');
const searchInputRefH = ref<HTMLInputElement | null>(null);
const searchPickerRef = ref<{ focus?: () => void; $el?: HTMLElement } | null>(null);
const qualityErrorCount = ref(0);
const openTaskCount = ref(0);

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
      { to: '/relationships', icon: '🔗', labelKey: 'nav.relationships' },
      { to: '/quality', icon: '⚠️', labelKey: 'nav.quality', badge: qualityErrorCount },
      { to: '/duplicates', icon: '👥', labelKey: 'nav.duplicates' },
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
    const el = navOrientation.value === 'vertical'
      ? (searchPickerRef.value?.$el?.querySelector?.('input') as HTMLInputElement | null)
      : searchInputRefH.value;
    el?.focus();
    el?.select();
  }
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
    const results = await window.api.checks.runAll() as Array<{ severity: string }> | null;
    if (results === null) return;
    qualityErrorCount.value = results.filter(r => r.severity === 'error' || r.severity === 'warning').length;
  } catch { /* ignore */ }
}

onMounted(() => {
  setTheme(currentTheme.value);
  setAppearance(appearance.value);
  applyTextSize();
  screenReader.init();
  window.addEventListener('keydown', handleGlobalKey);
  window.addEventListener('click', handleDocClick);
  loadDefaultPerson();
  // Delay heavy quality checks so initial navigation/data loading isn't blocked
  setTimeout(loadQualityBadge, 5000);
  setTimeout(loadResearchBadge, 1000);
  window.api.db.onSwitched(() => {
    window.location.reload();
  });
  let qualityDebounce: ReturnType<typeof setTimeout> | null = null;
  let researchDebounce: ReturnType<typeof setTimeout> | null = null;
  // Undo/redo: show toast and refresh data
  window.api.undo.onPerformed((data: { type: string; label: string }) => {
    const actionLabel = t(data.label);
    const msg = data.type === 'undo' ? t('undo.undone', { action: actionLabel }) : t('undo.redone', { action: actionLabel });
    toast.info(msg);
  });
  window.api.undo.onChanged(() => {
    dataVersionStore.increment();
    if (qualityDebounce) clearTimeout(qualityDebounce);
    qualityDebounce = setTimeout(loadQualityBadge, 800);
    if (researchDebounce) clearTimeout(researchDebounce);
    researchDebounce = setTimeout(loadResearchBadge, 400);
  });
  window.addEventListener('data-imported', () => {
    dataVersionStore.increment();
    // Debounce heavy checks so navigation/data loading IPC isn't blocked
    if (qualityDebounce) clearTimeout(qualityDebounce);
    qualityDebounce = setTimeout(loadQualityBadge, 2000);
    if (researchDebounce) clearTimeout(researchDebounce);
    researchDebounce = setTimeout(loadResearchBadge, 400);
  });
  window.api.onDataChanged(() => {
    dataVersionStore.increment();
    if (qualityDebounce) clearTimeout(qualityDebounce);
    qualityDebounce = setTimeout(loadQualityBadge, 800);
    if (researchDebounce) clearTimeout(researchDebounce);
    researchDebounce = setTimeout(loadResearchBadge, 400);
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey);
  window.removeEventListener('click', handleDocClick);
});

function submitSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  router.push({ path: '/search', query: { q } });
  searchQuery.value = '';
}

async function onSidebarPersonSelected(person: { id: string }) {
  // Set as the selected person (panel target) without changing the tree
  // subject. If the user is on /persons the panel reacts via the store;
  // if not, route there so the panel becomes visible. Use the saved
  // default person as the tree subject when present, otherwise the
  // clicked person becomes both subject and selected.
  selectedStore.set(person.id);
  if (!route.path.startsWith('/persons')) {
    let subjectId: string | null = null;
    try {
      subjectId = await window.api.db.getSetting('default_person_id') as string | null;
    } catch { /* ignore */ }
    await router.push('/persons/' + (subjectId ?? person.id));
  }
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
.topbar-row--meta { border-bottom: 1px solid var(--sidebar-border); }
.topbar-row--nav { flex-wrap: wrap; gap: 8px; padding: 4px 12px; }
.topbar-title {
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--sidebar-active-text);
  flex-shrink: 0;
}
.topbar-search { flex: 1; max-width: 420px; }
.topbar-search-input {
  width: 100%;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--sidebar-border);
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  font-size: var(--font-sm);
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}
.topbar-search-input::placeholder { color: var(--sidebar-text-muted); }
.topbar-focus-spacer { flex: 1; }

.topbar-settings { position: relative; flex-shrink: 0; }
.topbar-settings-toggle {
  background: none;
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-active-text);
  padding: 5px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-sm);
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
}
.topbar-settings-toggle:hover { background: var(--sidebar-active-bg); }
.topbar-settings-panel {
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

.sidebar {
  width: 220px;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  overflow-y: auto;
  border-radius: var(--radius-lg);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 10px;
  border-bottom: 1px solid var(--sidebar-border);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--sidebar-active-text);
}

.sidebar-search {
  margin-bottom: 10px;
  flex-shrink: 0;
}
.sidebar-search .person-picker input {
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--sidebar-border);
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  font-size: var(--font-sm);
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}
.sidebar-search .person-picker input::placeholder {
  color: var(--sidebar-text-muted);
}
.sidebar-search .person-picker input:focus {
  background: var(--sidebar-border);
}

.nav-section-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--sidebar-text-muted);
  padding: 2px 10px 6px;
  flex-shrink: 0;
}

.sidebar a,
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

.sidebar a:hover,
.sidebar a.router-link-active,
.nav-item:hover,
.nav-item.router-link-active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
}

.nav-icon { font-size: var(--font-base); line-height: 1; flex-shrink: 0; }
.nav-label { font-size: var(--font-sm); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sidebar-spacer {
  flex: 1;
}

.nav-bottom-item {
  margin-top: 2px;
}

.settings-section {
  margin-top: 4px;
  border-top: 1px solid var(--sidebar-border);
  padding-top: 6px;
}
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  color: var(--sidebar-text);
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-sm);
  font-family: inherit;
  text-align: left;
}
.settings-toggle:hover {
  background: var(--sidebar-active-bg);
}
.settings-arrow {
  margin-left: auto;
  font-size: var(--font-xs);
  color: var(--sidebar-text-muted);
}
.settings-panel {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.settings-group-label {
  font-size: var(--font-xs);
  color: var(--sidebar-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}
.settings-row {
  display: flex;
  gap: 3px;
}
.settings-option {
  flex: 1;
  background: var(--sidebar-active-bg);
  border: none;
  color: var(--sidebar-text);
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-xs);
  font-family: inherit;
  text-align: center;
  transition: all 0.15s;
}
.settings-option:hover {
  color: var(--sidebar-active-text);
}
.settings-option.active {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
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
  .sidebar, .topbar { display: none !important; }
  .app { display: block; height: auto; padding: 0; gap: 0; background: none; }
  .content, .content-paneled { padding: 0; height: auto; overflow: visible !important; background: none; border-radius: 0; }
  body { background: none; }
}


</style>
