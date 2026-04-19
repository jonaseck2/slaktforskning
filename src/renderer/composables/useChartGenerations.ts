import { ref, watch, type Ref } from 'vue';

type ChartKey = 'pedigree' | 'hourglass' | 'descendant' | 'timeline' | 'fan';

const DEFAULTS: Record<ChartKey, number> = {
  pedigree: 4,
  hourglass: 3,
  descendant: 3,
  timeline: 1,
  fan: 6,
};

function load(k: ChartKey): number {
  const raw = localStorage.getItem(`chart-gens-${k}`);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULTS[k];
}

function persist(k: ChartKey, r: Ref<number>) {
  watch(r, (v) => localStorage.setItem(`chart-gens-${k}`, String(v)));
}

export const pedigreeGenerations = ref(load('pedigree'));
export const hourglassGenerations = ref(load('hourglass'));
export const descendantGenerations = ref(load('descendant'));
export const timelineGenerations = ref(load('timeline'));
export const fanGenerations = ref(load('fan'));

persist('pedigree', pedigreeGenerations);
persist('hourglass', hourglassGenerations);
persist('descendant', descendantGenerations);
persist('timeline', timelineGenerations);
persist('fan', fanGenerations);
