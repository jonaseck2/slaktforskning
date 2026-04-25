<template>
  <div class="reports-index-view">
    <h2>{{ $t('reports.nav') }}</h2>
    <p class="hint">{{ $t('website.reportsHint') }}</p>
    <div class="card-grid">
      <router-link
        v-for="report in reports"
        :key="report.slug"
        :to="`/reports/${report.slug}`"
        class="report-card"
      >
        <span class="report-icon">{{ report.icon }}</span>
        <div>
          <h3>{{ report.title }}</h3>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const reports = [
  { slug: 'a-life', title: t('reports.aLife'), icon: '📖' },
  { slug: 'your-ancestors', title: t('reports.yourAncestors'), icon: '🌳' },
  { slug: 'life-on-one-page', title: t('reports.lifeOnOnePage'), icon: '📄' },
  { slug: 'photo-album', title: t('reports.photoAlbum'), icon: '📷' },
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
