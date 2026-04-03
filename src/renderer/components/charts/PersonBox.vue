<template>
  <g class="person-box-inner" :class="{ focal: isFocal, deceased: !person.living }" role="button">
    <!-- Left color border -->
    <rect
      :x="0" :y="0"
      :width="4" :height="height"
      :fill="borderColor"
      rx="4"
    />
    <!-- Main box -->
    <rect
      :x="4" :y="0"
      :width="width - 4" :height="height"
      :fill="boxFill"
      :stroke="isFocal ? '#2c3e50' : '#ccc'"
      :stroke-width="isFocal ? 1.5 : 1"
      rx="3"
    />
    <!-- Name line 1 -->
    <text
      :x="12" :y="height / 2 - 5"
      :fill="isFocal ? 'white' : (person.living ? '#1a1a1a' : '#666')"
      font-size="12"
      font-weight="600"
      font-family="inherit"
      dominant-baseline="middle"
    >
      <tspan>{{ truncate(displayName, 20) }}</tspan>
    </text>
    <!-- Year line 2 -->
    <text
      :x="12" :y="height / 2 + 11"
      :fill="isFocal ? 'rgba(255,255,255,0.75)' : '#999'"
      font-size="11"
      font-family="inherit"
      dominant-baseline="middle"
    >{{ yearLabel }}</text>
    <!-- Hover overlay (transparent, for pointer events) -->
    <rect
      :x="0" :y="0"
      :width="width" :height="height"
      fill="transparent"
      rx="4"
      class="hover-rect"
    />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface PersonData {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  givenName: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
}

const props = defineProps<{
  person: PersonData;
  width: number;
  height: number;
  isFocal?: boolean;
}>();

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };

const borderColor = computed(() => SEX_COLORS[props.person.sex] ?? '#ccc');

const boxFill = computed(() => {
  if (props.isFocal) return '#2c3e50';
  if (!props.person.living) return '#f8f8f8';
  return 'white';
});

const displayName = computed(() => {
  const parts = [props.person.givenName, props.person.surname].filter(Boolean);
  return parts.join(' ') || '(okänd)';
});

const yearLabel = computed(() => {
  const b = props.person.birthYear;
  const d = props.person.deathYear;
  if (b && d) return `${b}–${d}`;
  if (b) return props.person.living ? `f. ${b}` : `${b}–`;
  return '';
});

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
</script>

<style scoped>
.person-box-inner { transition: opacity 0.1s; }
.person-box-inner:not(.focal):hover .hover-rect { fill: rgba(0,0,0,0.04); }
</style>
