<template>
  <div class="app">
    <AppSidebar :sections="navSections" variant="static" />
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
import { computed, onMounted, provide } from 'vue';
import { useRoute } from 'vue-router';
import { useTTS } from '../renderer/composables/useTTS';
import { useScreenReaderMode } from '../renderer/composables/useScreenReaderMode';
import AppSidebar from '../renderer/components/AppSidebar.vue';
import type { NavSectionDef } from '../renderer/components/AppSidebarTypes';

const route = useRoute();
const tts = useTTS();
const screenReader = useScreenReaderMode();

provide('ttsEnabled', screenReader.isTtsEnabled);
provide('tts', tts);
provide('screenReader', screenReader);

const CACHED_VIEWS = ['PersonsListView', 'PlacesListView'];
const PANELED_ROUTES = ['/persons', '/places', '/media'];
const isPaneledView = computed(() => PANELED_ROUTES.some(r => route.path.startsWith(r)));

const navSections: NavSectionDef[] = [{
  key: 'main',
  items: [
    { to: '/', icon: '👤', labelKey: 'nav.people' },
    { to: '/places', icon: '📍', labelKey: 'places.title' },
    { to: '/media', icon: '📷', labelKey: 'media.nav' },
    { to: '/search', icon: '🔍', labelKey: 'nav.search' },
  ],
}];

onMounted(() => {
  screenReader.init();
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
  .app { display: block; height: auto; padding: 0; gap: 0; background: none; }
  .content, .content-paneled { padding: 0; height: auto; overflow: visible !important; background: none; border-radius: 0; }
  body { background: none; }
}
</style>
