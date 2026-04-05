<template>
  <div class="ancestor-chart-report">
    <div v-if="loading" class="loading">Laddar…</div>
    <div v-else-if="!tree" class="empty">Välj en person.</div>
    <template v-else>
      <h1 class="report-title">Stamtavla för {{ focalName }}</h1>
      <p class="report-meta">{{ props.generations }} generationer · {{ new Date().toLocaleDateString('sv-SE') }}</p>

      <div v-for="gen in generationRows" :key="gen.level" class="gen-section">
        <h3 class="gen-heading">{{ generationLabel(gen.level) }}</h3>
        <div v-for="entry in gen.entries" :key="entry.ahnNum" class="person-entry">
          <span class="ahn-num">{{ entry.ahnNum }}.</span>
          <span class="person-name">{{ entry.name || '(okänd)' }}</span>
          <span class="person-years">{{ entry.years }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { fetchPedigreeTree } from '../../utils/chartData';

interface PersonNode {
  id: string;
  givenName: string | null;
  surname: string | null;
  preferredName: string | null;
  birthYear: number | null;
  deathYear: number | null;
}

interface PedigreeTree {
  nodes: Map<number, PersonNode>;
  generations: number;
}

const props = defineProps<{ rootPersonId: string; generations: number }>();

const loading = ref(false);
const tree = ref<PedigreeTree | null>(null);

const focalName = computed(() => {
  if (!tree.value) return '';
  const focal = tree.value.nodes.get(1);
  if (!focal) return '';
  const first = focal.preferredName ?? focal.givenName?.split(' ')[0] ?? '';
  return [first, focal.surname].filter(Boolean).join(' ');
});

interface EntryRow { ahnNum: number; name: string; years: string; }
interface GenRow { level: number; entries: EntryRow[]; }

const generationRows = computed<GenRow[]>(() => {
  if (!tree.value) return [];
  const rows: GenRow[] = [];
  for (let gen = 1; gen <= props.generations; gen++) {
    const start = 1 << (gen - 1); // 1, 2, 4, 8, 16, …
    const entries: EntryRow[] = [];
    for (let n = start; n < start * 2; n++) {
      const p = tree.value.nodes.get(n);
      if (!p) continue;
      const first = p.preferredName ?? p.givenName?.split(' ')[0] ?? '';
      const name = [first, p.surname].filter(Boolean).join(' ');
      const birthStr = p.birthYear != null ? String(p.birthYear) : '?';
      const deathStr = p.deathYear != null ? String(p.deathYear) : '';
      const years = deathStr ? `${birthStr}–${deathStr}` : birthStr !== '?' ? `f. ${birthStr}` : '';
      entries.push({ ahnNum: n, name, years });
    }
    if (entries.length > 0) rows.push({ level: gen, entries });
  }
  return rows;
});

function generationLabel(gen: number): string {
  const labels: Record<number, string> = {
    1: 'Utgångsperson',
    2: 'Föräldrar',
    3: 'Mor-/farföräldrar',
    4: 'Mor-/farmorföräldrar',
    5: 'Ur-mor-/farföräldrar',
    6: 'Generation 6',
  };
  return labels[gen] ?? `Generation ${gen}`;
}

async function load() {
  if (!props.rootPersonId) return;
  loading.value = true;
  tree.value = null;
  try {
    tree.value = (await fetchPedigreeTree(props.rootPersonId, props.generations)) as PedigreeTree;
  } catch (err) {
    console.error('[AncestorChartReport] load failed:', err);
  } finally {
    loading.value = false;
  }
}

watch(() => [props.rootPersonId, props.generations] as const, load, { immediate: true });
</script>

<style scoped>
.ancestor-chart-report {
  font-family: Georgia, serif;
  max-width: 700px;
}
.loading,
.empty {
  color: #888;
  font-size: 13px;
  padding: 16px 0;
}
.report-title {
  font-size: 22px;
  margin: 0 0 4px;
}
.report-meta {
  font-size: 12px;
  color: #666;
  margin: 0 0 20px;
}
.gen-section {
  margin-bottom: 18px;
  break-inside: avoid;
}
.gen-heading {
  font-size: 13px;
  font-weight: 700;
  color: #444;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #ccc;
  padding-bottom: 4px;
  margin: 0 0 8px;
}
.person-entry {
  display: flex;
  gap: 8px;
  font-size: 13px;
  padding: 2px 0;
  line-height: 1.5;
}
.ahn-num {
  color: #aaa;
  min-width: 28px;
  flex-shrink: 0;
}
.person-name {
  flex: 1;
}
.person-years {
  color: #666;
  font-size: 12px;
  flex-shrink: 0;
}
@media print {
  .report-title {
    font-size: 18px;
  }
  .person-entry {
    font-size: 11px;
  }
}
</style>
