<template>
  <div
    v-if="visible"
    class="chart-tooltip"
    :style="{ left: x + 'px', top: y + 'px' }"
    role="tooltip"
  >
    <div class="tooltip-name">{{ name }}</div>
    <div v-if="birth" class="tooltip-date">* {{ birth }}</div>
    <div v-if="death" class="tooltip-date">{{ deathSymbol }} {{ death }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

export interface TooltipPerson {
  givenName?: string | null;
  surname?: string | null;
  preferredName?: string | null;
  nickname?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  birthPlace?: string | null;
  deathPlace?: string | null;
}

const visible = ref(false);
const x = ref(0);
const y = ref(0);
const name = ref('');
const birth = ref('');
const death = ref('');
const deathSymbol = '\u2020';

let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function show(person: TooltipPerson, clientX: number, clientY: number) {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
  const given = person.preferredName ?? person.givenName ?? '';
  const sur = person.surname ?? '';
  name.value = [given, sur].filter(Boolean).join(' ') || '?';
  const birthParts = [person.birthDate, person.birthPlace].filter(Boolean);
  birth.value = birthParts.join(' ');
  const deathParts = [person.deathDate, person.deathPlace].filter(Boolean);
  death.value = deathParts.join(' ');
  x.value = clientX + 12;
  y.value = clientY + 12;
  visible.value = true;
}

function hide() {
  hideTimeout = setTimeout(() => { visible.value = false; }, 80);
}

function move(clientX: number, clientY: number) {
  if (!visible.value) return;
  x.value = clientX + 12;
  y.value = clientY + 12;
}

defineExpose({ show, hide, move });
</script>

<style scoped>
.chart-tooltip {
  position: fixed;
  z-index: 9999;
  background: var(--color-bg, white);
  border: 1px solid var(--color-border, #ccc);
  border-radius: 6px;
  padding: 6px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  white-space: nowrap;
  max-width: 300px;
}
.tooltip-name {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text, #333);
}
.tooltip-date {
  font-size: var(--font-xs);
  color: var(--color-text-muted, #888);
}
</style>
