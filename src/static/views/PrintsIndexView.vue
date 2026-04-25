<template>
  <div class="reports-index-view">
    <h2>{{ $t('reports.groups.framablePrints') }}</h2>
    <p class="hint">{{ $t('website.printsHint') }}</p>
    <div class="card-grid">
      <router-link
        v-for="print in prints"
        :key="print.slug"
        :to="`/prints/${print.slug}`"
        class="report-card"
      >
        <span class="report-icon">{{ print.icon }}</span>
        <div>
          <h3>{{ print.title }}</h3>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const prints = [
  { slug: 'pedigree', title: t('reports.pedigreeChart'), icon: '🌲' },
  { slug: 'hourglass', title: t('reports.hourglassChart'), icon: '⏳' },
  { slug: 'descendant', title: t('reports.descendantChart'), icon: '👨‍👩‍👧‍👦' },
  { slug: 'fan', title: t('reports.fanChart'), icon: '🎴' },
  { slug: 'timeline', title: t('reports.timelineChart'), icon: '📅' },
  { slug: 'life-on-one-page', title: t('reports.lifeOnOnePage'), icon: '📄' },
];
</script>

<style scoped>
.reports-index-view {
  padding: var(--space-xl);
  flex: 1;
  overflow-y: auto;
}
.hint {
  color: var(--text-muted);
  margin-bottom: var(--space-xl);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
}
.report-card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-primary);
  transition: background 0.15s;
}
.report-card:hover {
  background: var(--surface-hover);
}
.report-icon {
  font-size: 1.5em;
}
</style>
