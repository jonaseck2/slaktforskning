<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';

interface DbStats { persons: number; events: number; places: number; sources: number }
interface PersonRow {
  id: string;
  given_name: string | null;
  surname: string | null;
  sex: string;
}
interface AncestorNode {
  id: string;
  generation: number;
  position: number;
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
const lastQueryMs = ref(0);
const tab = ref<'list' | 'chart'>('chart');

// chart state
const focusId = ref('00034a36-0050-4e66-b6f5-9a93653fdadf');
const ancestors = ref<AncestorNode[]>([]);
const chartDepth = ref(4);
const chartQueryMs = ref(0);

async function openDb() {
  error.value = '';
  try {
    await invoke('db_open', { path: dbPath.value });
    dbOpen.value = true;
    stats.value = await invoke<DbStats>('db_stats');
    await loadPage();
    await loadChart();
  } catch (e) {
    error.value = String(e);
  }
}

async function loadPage() {
  const t0 = performance.now();
  try {
    persons.value = await invoke<PersonRow[]>('persons_list', { limit: pageSize, offset: offset.value });
    lastQueryMs.value = Math.round(performance.now() - t0);
  } catch (e) { error.value = String(e); }
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

async function loadChart() {
  const t0 = performance.now();
  try {
    ancestors.value = await invoke<AncestorNode[]>('get_ancestor_tree', {
      focusId: focusId.value,
      maxDepth: chartDepth.value,
    });
    chartQueryMs.value = Math.round(performance.now() - t0);
  } catch (e) { error.value = String(e); }
}

function printChart() {
  // OS-native print pipeline. On macOS WebKit this opens NSPrintInfo
  // dialog with a "Save as PDF" affordance. On Windows WebView2 it
  // opens the Chromium-based print dialog. On Linux WebKitGTK it uses
  // GTK print. Matches Tauri 2's recommended print path; in the full
  // port the Electron app's webContents.printToPDF would route through
  // this same surface (or via a Rust command that wraps WKWebView's
  // createPDF API for headless / programmatic save).
  window.print();
}

function openChart() {
  tab.value = 'chart';
  if (ancestors.value.length === 0) loadChart();
}

// chart layout — pedigree: focus on left, ancestors fan out to right.
// generation g has 2^g slots; vertical positions evenly spaced.
const BOX_W = 160;
const BOX_H = 50;
const COL_GAP = 40;
const ROW_GAP = 8;

const chartLayout = computed(() => {
  const maxGen = ancestors.value.reduce((m, n) => Math.max(m, n.generation), 0);
  const slotsAtMax = 2 ** maxGen;
  const totalH = slotsAtMax * (BOX_H + ROW_GAP);
  const placed = ancestors.value.map(n => {
    const slotsHere = 2 ** n.generation;
    const slotH = totalH / slotsHere;
    const y = n.position * slotH + (slotH - BOX_H) / 2;
    const x = n.generation * (BOX_W + COL_GAP);
    return { ...n, x, y };
  });
  // edges from each non-focus to its child
  const byKey = new Map(placed.map(p => [`${p.generation}-${p.position}`, p]));
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const p of placed) {
    if (p.generation === 0) continue;
    const childKey = `${p.generation - 1}-${Math.floor(p.position / 2)}`;
    const child = byKey.get(childKey);
    if (!child) continue;
    edges.push({
      x1: child.x + BOX_W,
      y1: child.y + BOX_H / 2,
      x2: p.x,
      y2: p.y + BOX_H / 2,
    });
  }
  const width = (maxGen + 1) * (BOX_W + COL_GAP);
  return { placed, edges, width, height: totalH };
});

onMounted(() => { openDb(); });
</script>

<template>
  <main class="container">
    <h1>Slaktforskning Tauri spike</h1>
    <div class="tabs">
      <button :class="{ active: tab === 'list' }" @click="tab = 'list'">Persons list</button>
      <button :class="{ active: tab === 'chart' }" @click="openChart">Pedigree chart</button>
    </div>

    <div class="controls">
      <input v-model="dbPath" placeholder="path to .db" style="width: 600px" />
      <button @click="openDb">Re-open DB</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="stats" class="stats">
      <div>Persons: <b>{{ stats.persons.toLocaleString() }}</b></div>
      <div>Events: <b>{{ stats.events.toLocaleString() }}</b></div>
      <div>Places: <b>{{ stats.places.toLocaleString() }}</b></div>
      <div>Sources: <b>{{ stats.sources.toLocaleString() }}</b></div>
      <div v-if="tab === 'list'">List query: <b>{{ lastQueryMs }} ms</b></div>
      <div v-if="tab === 'chart'">Chart query: <b>{{ chartQueryMs }} ms</b></div>
    </div>

    <!-- LIST -->
    <template v-if="tab === 'list'">
      <div v-if="dbOpen" class="pager">
        <button @click="prevPage" :disabled="offset === 0">Prev</button>
        <span>rows {{ offset + 1 }} – {{ Math.min(offset + pageSize, stats?.persons || 0) }}</span>
        <button @click="nextPage" :disabled="!stats || offset + pageSize >= stats.persons">Next</button>
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
    </template>

    <!-- CHART -->
    <template v-else>
      <div class="chart-controls no-print">
        <label>Focus ID: <input v-model="focusId" style="width: 320px" /></label>
        <label>Generations:
          <select v-model.number="chartDepth">
            <option :value="3">3</option>
            <option :value="4">4</option>
            <option :value="5">5</option>
            <option :value="6">6</option>
          </select>
        </label>
        <button @click="loadChart">Reload</button>
        <button @click="printChart">Print / Save PDF</button>
        <span>Boxes drawn: <b>{{ ancestors.length }}</b></span>
      </div>
      <div class="chart-scroll">
        <svg
          v-if="ancestors.length"
          :width="chartLayout.width"
          :height="chartLayout.height"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- edges first so boxes draw over them -->
          <g class="edges">
            <path
              v-for="(e, i) in chartLayout.edges"
              :key="`e-${i}`"
              :d="`M${e.x1},${e.y1} C${(e.x1+e.x2)/2},${e.y1} ${(e.x1+e.x2)/2},${e.y2} ${e.x2},${e.y2}`"
              fill="none" stroke="#999" stroke-width="1"
            />
          </g>
          <g class="boxes">
            <g v-for="p in chartLayout.placed" :key="p.id" :transform="`translate(${p.x},${p.y})`">
              <rect
                :width="BOX_W" :height="BOX_H" rx="4" ry="4"
                :fill="p.sex === 'F' ? '#fde7ed' : p.sex === 'M' ? '#e3eef9' : '#ecedef'"
                :stroke="p.generation === 0 ? '#1769aa' : '#bbb'"
                :stroke-width="p.generation === 0 ? 2 : 1"
              />
              <text x="8" y="20" class="given-text">{{ p.given_name || '—' }}</text>
              <text x="8" y="38" class="surname-text">{{ p.surname || '—' }}</text>
              <text :x="BOX_W - 8" y="14" text-anchor="end" class="gen-text">G{{ p.generation }}</text>
            </g>
          </g>
        </svg>
        <div v-else class="empty">No ancestors loaded.</div>
      </div>
    </template>
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
.container { padding: 1rem 1.5rem; max-width: 1400px; }
h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
.tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; }
.tabs button {
  padding: 0.4rem 1rem; border: 1px solid #999; background: #fff; cursor: pointer;
  border-radius: 4px;
}
.tabs button.active { background: #1769aa; color: #fff; border-color: #1769aa; }
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

.chart-controls {
  display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem;
  background: #fff; padding: 0.5rem 1rem; border: 1px solid #ddd; border-radius: 4px;
}
.chart-controls label { display: inline-flex; gap: 0.4rem; align-items: center; }
.chart-controls input { padding: 0.25rem 0.4rem; font-family: monospace; font-size: 12px; border: 1px solid #ccc; border-radius: 3px; }
.chart-scroll { overflow: auto; background: #fff; border: 1px solid #ddd; border-radius: 4px; }
.chart-scroll svg { display: block; }
.given-text { font-size: 13px; font-weight: 500; }
.surname-text { font-size: 13px; fill: #555; }
.gen-text { font-size: 10px; fill: #888; }
.empty { padding: 2rem; color: #888; text-align: center; }

/* Print path: hide UI chrome, let only the chart's SVG land on the page.
   This is the same shape as src/renderer/views/ReportsView.vue's
   @media print block in the Electron app — engine-independent CSS. */
@media print {
  body, html { background: #fff; }
  h1, .tabs, .controls, .stats, .chart-controls, .no-print { display: none !important; }
  .container { padding: 0; max-width: none; }
  .chart-scroll { overflow: visible !important; border: none !important; border-radius: 0 !important; }
  .chart-scroll svg { width: 100% !important; height: auto !important; }
  /* Force colors to print in WebKit (the same property the Electron app uses). */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
</style>
