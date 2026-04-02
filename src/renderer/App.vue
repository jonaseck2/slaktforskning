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
      <router-link to="/">{{ $t('nav.persons') }}</router-link>
      <router-link to="/relationships">{{ $t('nav.relationships') }}</router-link>
      <router-link to="/sources">{{ $t('nav.sources') }}</router-link>
      <div class="sidebar-spacer"></div>
      <select class="locale-switcher" :value="locale" @change="switchLocale($event)">
        <option value="sv">Svenska</option>
        <option value="en">English</option>
      </select>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { saveLocale } from './i18n';
import type { SupportedLocale } from './i18n';

const router = useRouter();
const { locale } = useI18n();
const searchQuery = ref('');

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
  width: 200px;
  background: #2c3e50;
  color: white;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar h1 {
  font-size: 16px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
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

.sidebar a {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 4px;
}

.sidebar a:hover,
.sidebar a.router-link-active {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.sidebar-spacer {
  flex: 1;
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

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
</style>
