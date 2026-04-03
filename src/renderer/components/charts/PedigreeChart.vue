<template>
  <div class="chart-wrap">
    <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
    <svg
      v-else
      :viewBox="`0 0 ${layout.svgWidth} ${layout.svgHeight}`"
      width="100%"
      :style="{ maxWidth: layout.svgWidth + 'px' }"
      data-testid="pedigree-svg"
    >
      <line
        v-for="(ln, i) in layout.lines"
        :key="'l' + i"
        :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2"
        stroke="#ccc" stroke-width="1.5" vector-effect="non-scaling-stroke"
      />
      <g
        v-for="box in layout.boxes"
        :key="box.person.id"
        :data-testid="'person-box-' + box.person.id"
        :class="['person-box', { clickable: !box.isFocal }]"
        @click="!box.isFocal && $emit('navigate', box.person.id)"
      >
        <rect
          :x="box.x" :y="box.y" :width="box.w" :height="box.h"
          rx="4"
          :fill="boxFill(box)"
          :stroke="box.isFocal ? '#1a2a3a' : '#ddd'"
          stroke-width="1"
        />
        <rect
          :x="box.x" :y="box.y"
          width="4" :height="box.h"
          rx="2"
          :fill="sexColor(box.person.sex)"
        />
        <text
          :x="box.x + 12" :y="box.y + 17"
          font-size="12" font-weight="600"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          :fill="box.isFocal ? 'white' : '#333'"
        >{{ truncate(personName(box.person), 20) }}</text>
        <text
          :x="box.x + 12" :y="box.y + 32"
          font-size="10"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          :fill="box.isFocal ? 'rgba(255,255,255,0.65)' : '#888'"
        >{{ personDates(box.person) }}</text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computePedigreeLayout } from '../../utils/chartLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import type { ChartLayout, BoxLayout, PersonNode } from '../../utils/chartLayout';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const layout = ref<ChartLayout>({ boxes: [], lines: [], svgWidth: 585, svgHeight: 256 });

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
function sexColor(sex: string): string { return SEX_COLORS[sex] ?? '#ccc'; }

function boxFill(box: BoxLayout): string {
  if (box.isFocal) return '#2c3e50';
  if (!box.person.living) return '#f8f8f8';
  return 'white';
}

function personName(p: PersonNode): string {
  return [p.givenName, p.surname].filter(Boolean).join(' ') || '(okänd)';
}

function personDates(p: PersonNode): string {
  const b = p.birthYear;
  const d = p.deathYear;
  if (b && d) return `${b}–${d}`;
  if (b) return p.living ? `f. ${b}` : `${b}–`;
  return '';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    const tree = await fetchPedigreeTree(props.personId);
    layout.value = computePedigreeLayout(tree);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
onMounted(load);
</script>

<style scoped>
.chart-wrap { width: 100%; }
.chart-loading { color: #999; padding: 40px; text-align: center; }
.person-box.clickable { cursor: pointer; }
.person-box.clickable:hover rect:first-child { opacity: 0.9; }
</style>
