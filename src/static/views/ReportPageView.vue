<template>
  <div class="report-page-view">
    <div class="report-toolbar">
      <router-link to="/reports" class="back-link">← {{ $t('reports.nav') }}</router-link>
      <a :href="`./reports/${slug}.pdf`" download class="download-btn">
        &#x2B07; {{ $t('website.downloadPdf') }}
      </a>
    </div>
    <iframe
      :src="`./reports/${slug}.html`"
      class="report-frame"
      :title="slug"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const slug = computed(() => route.params.slug as string);
</script>

<style scoped>
.report-page-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
.report-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface);
}
.back-link,
.download-btn {
  color: var(--accent);
  text-decoration: none;
  font-size: var(--font-sm);
}
.report-frame {
  flex: 1;
  width: 100%;
  border: 0;
}
</style>
