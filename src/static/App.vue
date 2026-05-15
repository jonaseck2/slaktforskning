<template>
  <div class="app">
    <a href="#main-content" class="skip-link">{{ $t('a11y.skipToMain') }}</a>
    <nav class="sidebar" aria-label="Main navigation">
      <div class="sidebar-header">
        <span class="sidebar-title">🌿 {{ $t('app.title') }}</span>
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
      <div class="sidebar-spacer"></div>
      <AppSettingsPanel variant="static" />
    </nav>
    <main id="main-content" :class="['content', { 'content-paneled': isPaneledView }]">
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
import { ref, computed, onMounted, onUnmounted, provide } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useTTS } from '../renderer/composables/useTTS';
import { useScreenReaderMode } from '../renderer/composables/useScreenReaderMode';
import AppSettingsPanel from '../renderer/components/AppSettingsPanel.vue';

const router = useRouter();
const route = useRoute();
const tts = useTTS();
const screenReader = useScreenReaderMode();

provide('ttsEnabled', screenReader.isTtsEnabled);
provide('tts', tts);
provide('screenReader', screenReader);

const CACHED_VIEWS = ['PersonsListView', 'PlacesListView'];
const PANELED_ROUTES = ['/persons', '/places', '/media'];
const isPaneledView = computed(() => PANELED_ROUTES.some(r => route.path.startsWith(r)));

const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);

function handleGlobalKey(e: KeyboardEvent) {
  if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  }
}

onMounted(() => {
  screenReader.init();
  window.addEventListener('keydown', handleGlobalKey);
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
.sidebar-search-input {
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
.sidebar-search-input::placeholder {
  color: var(--sidebar-text-muted);
}
.sidebar-search-input:focus {
  background: var(--sidebar-border);
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
  .sidebar { display: none !important; }
  .app { display: block; height: auto; padding: 0; gap: 0; background: none; }
  .content, .content-paneled { padding: 0; height: auto; overflow: visible !important; background: none; border-radius: 0; }
  body { background: none; }
}
</style>
