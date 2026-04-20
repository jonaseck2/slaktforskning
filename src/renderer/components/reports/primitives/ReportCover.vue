<template>
  <div class="report-cover" role="banner">
    <div class="cover-accent" aria-hidden="true"></div>
    <div v-if="heroImageUrl" class="cover-hero">
      <img :src="heroImageUrl" :alt="heroAlt || title" />
    </div>
    <h1 class="cover-title">{{ title }}</h1>
    <p v-if="subtitle" class="cover-subtitle">{{ subtitle }}</p>
    <p class="cover-attribution">
      <template v-if="researcherName">
        {{ $t('reports.common.compiledBy', { name: researcherName }) }}
      </template>
      <template v-else>
        {{ $t('reports.common.compiledByAnonymous', { date: formattedDate }) }}
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  title: string;
  subtitle?: string;
  heroImageUrl?: string | null;
  heroAlt?: string;
  researcherName?: string | null;
  date?: Date;
}>();

const { locale } = useI18n();
const formattedDate = computed(() => {
  const d = props.date || new Date();
  return d.toLocaleDateString(locale.value === 'sv' ? 'sv-SE' : 'en-GB');
});
</script>

<style scoped>
.report-cover {
  padding: var(--space-2xl);
  text-align: center;
  font-family: var(--report-serif-stack);
  page-break-after: always;
}
.cover-accent {
  height: var(--report-cover-accent-height);
  width: 120px;
  background: var(--accent);
  margin: 0 auto var(--space-xl);
}
.cover-hero img {
  max-width: 60%;
  max-height: 400px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-xl);
}
.cover-title { font-size: 2.5rem; margin: var(--space-lg) 0 var(--space-sm); }
.cover-subtitle { font-size: 1.25rem; color: var(--text-secondary); margin: 0 0 var(--space-2xl); }
.cover-attribution { font-size: var(--font-sm); color: var(--text-muted); margin-top: var(--space-2xl); }
</style>
