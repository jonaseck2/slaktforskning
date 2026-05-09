<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

interface DbStats { persons: number; events: number; places: number; sources: number }
interface PersonRow {
  id: string;
  given_name: string | null;
  surname: string | null;
  sex: string;
}

const dbPath = ref('/Users/jonasahnstedt/git/slaktforskning/export-import/bengt.db');
const dbOpen = ref(false);
const stats = ref<DbStats | null>(null);
const persons = ref<PersonRow[]>([]);
const offset = ref(0);
const pageSize = 100;
const error = ref<string>('');
const tickStart = ref(0);
const lastQueryMs = ref(0);

async function openDb() {
  error.value = '';
  try {
    await invoke('db_open', { path: dbPath.value });
    dbOpen.value = true;
    stats.value = await invoke<DbStats>('db_stats');
    // Spike: auto-load all rows for max-load measurement.
    await loadAll();
  } catch (e) {
    error.value = String(e);
  }
}

async function loadPage() {
  tickStart.value = performance.now();
  try {
    persons.value = await invoke<PersonRow[]>('persons_list', {
      limit: pageSize,
      offset: offset.value,
    });
    lastQueryMs.value = Math.round(performance.now() - tickStart.value);
  } catch (e) {
    error.value = String(e);
  }
}

async function nextPage() {
  if (!stats.value) return;
  if (offset.value + pageSize >= stats.value.persons) return;
  offset.value += pageSize;
  await loadPage();
}

async function prevPage() {
  if (offset.value === 0) return;
  offset.value = Math.max(0, offset.value - pageSize);
  await loadPage();
}

async function loadAll() {
  if (!stats.value) return;
  tickStart.value = performance.now();
  try {
    const all: PersonRow[] = await invoke('persons_list', {
      limit: stats.value.persons,
      offset: 0,
    });
    persons.value = all;
    lastQueryMs.value = Math.round(performance.now() - tickStart.value);
  } catch (e) {
    error.value = String(e);
  }
}

onMounted(() => { openDb(); });
</script>

<template>
  <main class="container">
    <h1>Slaktforskning Tauri spike</h1>
    <div class="controls">
      <input v-model="dbPath" placeholder="path to .db" style="width: 600px" />
      <button @click="openDb">Open DB</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="stats" class="stats">
      <div>Persons: <b>{{ stats.persons.toLocaleString() }}</b></div>
      <div>Events: <b>{{ stats.events.toLocaleString() }}</b></div>
      <div>Places: <b>{{ stats.places.toLocaleString() }}</b></div>
      <div>Sources: <b>{{ stats.sources.toLocaleString() }}</b></div>
      <div>Last query: <b>{{ lastQueryMs }} ms</b></div>
    </div>
    <div v-if="dbOpen" class="pager">
      <button @click="prevPage" :disabled="offset === 0">Prev</button>
      <span>rows {{ offset + 1 }} – {{ Math.min(offset + pageSize, stats?.persons || 0) }}</span>
      <button @click="nextPage" :disabled="!stats || offset + pageSize >= stats.persons">Next</button>
      <button @click="loadAll" :disabled="!stats">Load all (stress test)</button>
    </div>
    <table v-if="persons.length" class="grid">
      <thead><tr><th>Surname</th><th>Given</th><th>Sex</th><th>ID</th></tr></thead>
      <tbody>
        <tr v-for="p in persons" :key="p.id">
          <td>{{ p.surname || '—' }}</td>
          <td>{{ p.given_name || '—' }}</td>
          <td>{{ p.sex }}</td>
          <td class="id">{{ p.id.slice(0, 8) }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style>
:root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  color: #222;
  background: #f5f5f7;
}
* { box-sizing: border-box; }
body, html { margin: 0; padding: 0; }
.container { padding: 1rem 1.5rem; max-width: 1100px; }
h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
.controls { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.controls input {
  padding: 0.4rem 0.6rem; border: 1px solid #ccc; border-radius: 4px;
  font-family: monospace; font-size: 12px;
}
button {
  padding: 0.4rem 0.9rem; border: 1px solid #999; border-radius: 4px;
  background: #fff; cursor: pointer;
}
button:disabled { opacity: 0.4; cursor: not-allowed; }
.stats {
  display: flex; gap: 1.5rem; padding: 0.5rem 1rem;
  background: #fff; border: 1px solid #ddd; border-radius: 4px;
  margin-bottom: 1rem;
}
.pager { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; }
.error { color: #c00; padding: 0.5rem; background: #fee; border-radius: 4px; }
.grid {
  width: 100%; border-collapse: collapse; background: #fff;
  border: 1px solid #ddd; border-radius: 4px; overflow: hidden;
}
.grid th, .grid td {
  padding: 0.35rem 0.6rem; text-align: left; border-bottom: 1px solid #eee;
  font-size: 13px;
}
.grid th { background: #fafafa; font-weight: 600; }
.grid tr:hover td { background: #f8f8f8; }
.id { font-family: monospace; color: #888; font-size: 11px; }
</style>
