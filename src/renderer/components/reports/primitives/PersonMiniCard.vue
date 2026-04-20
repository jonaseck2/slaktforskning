<template>
  <div class="person-mini-card" :class="['sex-' + (sex || 'U')]">
    <div v-if="portraitUrl" class="portrait">
      <img :src="portraitUrl" :alt="fullName" />
    </div>
    <div v-else class="portrait portrait-placeholder" aria-hidden="true">
      {{ initials }}
    </div>
    <div class="identity">
      <div class="name">{{ fullName }}</div>
      <div v-if="yearsLabel" class="years">{{ yearsLabel }}</div>
      <div v-if="keyPlace" class="place">{{ keyPlace }}</div>
      <a v-if="ahnentafel && fanChartHref" :href="fanChartHref" class="ahnentafel ahnentafel-link">#{{ ahnentafel }}</a>
      <div v-else-if="ahnentafel" class="ahnentafel">#{{ ahnentafel }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  givenName?: string | null;
  surname?: string | null;
  sex?: 'M' | 'F' | 'U';
  birthYear?: number | null;
  deathYear?: number | null;
  keyPlace?: string | null;
  portraitUrl?: string | null;
  ahnentafel?: number | null;
  fanChartHref?: string | null;
}>();

const fullName = computed(() =>
  [props.givenName, props.surname].filter(Boolean).join(' ') || '—'
);

const initials = computed(() => {
  const parts = [props.givenName, props.surname].filter(Boolean) as string[];
  return parts.map(p => p.charAt(0).toUpperCase()).join('') || '?';
});

const yearsLabel = computed(() => {
  if (props.birthYear == null && props.deathYear == null) return null;
  return `${props.birthYear ?? '?'}–${props.deathYear ?? ''}`;
});
</script>

<style scoped>
.person-mini-card {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: var(--space-md);
  padding: var(--space-sm);
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-sm);
  break-inside: avoid;
}
.portrait {
  width: 64px; height: 64px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--surface-hover);
}
.portrait img { width: 100%; height: 100%; object-fit: cover; }
.portrait-placeholder {
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; color: var(--text-secondary);
}
.sex-M .portrait { background: var(--sex-m-bg); color: var(--sex-m-text); }
.sex-F .portrait { background: var(--sex-f-bg); color: var(--sex-f-text); }
.sex-U .portrait { background: var(--sex-u-bg); color: var(--sex-u-text); }
.name { font-weight: 600; }
.years, .place, .ahnentafel { font-size: var(--font-sm); color: var(--text-secondary); }
.ahnentafel-link {
  text-decoration: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s, color 0.15s;
}
.ahnentafel-link:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
</style>
