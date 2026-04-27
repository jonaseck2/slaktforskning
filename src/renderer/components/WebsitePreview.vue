<template>
  <div class="website-preview">
    <div v-if="error" class="preview-error">
      {{ error }}
    </div>

    <div v-else-if="loading && !ready" class="preview-empty">
      {{ $t('htmlSite.preview.loading') }}
    </div>

    <template v-else-if="ready">
      <div class="preview-stats">
        <span class="stat-pill">{{ $t('htmlSite.preview.persons', { count: snapshot!.totals.persons }) }}</span>
        <span class="stat-pill">{{ $t('htmlSite.preview.places', { count: snapshot!.totals.places }) }}</span>
        <span class="stat-pill">{{ $t('htmlSite.preview.media', { count: snapshot!.totals.media }) }}</span>
        <span v-if="snapshot!.totals.redacted > 0" class="stat-pill stat-pill-redacted">
          🔒 {{ $t('htmlSite.preview.redacted', { count: snapshot!.totals.redacted }) }}
        </span>
        <span v-if="loading" class="stat-pill stat-pill-loading">{{ $t('htmlSite.preview.refreshing') }}</span>
      </div>

      <div v-if="snapshot!.totals.persons === 0" class="preview-empty">
        {{ $t('htmlSite.preview.emptyScope') }}
      </div>

      <iframe
        v-else
        :key="iframeKey"
        :src="iframeSrc"
        class="preview-iframe"
        :title="$t('htmlSite.preview.iframeLabel')"
      />
    </template>

    <div v-else-if="!loading" class="preview-empty">
      {{ $t('htmlSite.preview.selectSubject') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface PreviewSnapshot {
  meta: { siteTitle: string };
  totals: {
    persons: number;
    places: number;
    media: number;
    redacted: number;
  };
}

const props = defineProps<{
  snapshot: PreviewSnapshot | null;
  loading: boolean;
  error?: string | null;
  iframeKey: number;
}>();

const ready = computed(() => props.snapshot !== null);
const iframeSrc = computed(() => `app-preview://host/index.html?v=${props.iframeKey}`);
</script>

<style scoped>
.website-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.preview-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  flex-shrink: 0;
}
.stat-pill {
  font-size: var(--font-xs);
  padding: 2px var(--space-sm);
  border-radius: var(--radius-full);
  background: var(--surface-hover);
  color: var(--text-secondary);
  border: 1px solid var(--surface-border-subtle);
}
.stat-pill-redacted {
  background: var(--warning-bg);
  color: var(--warning-text);
  border-color: transparent;
}
.stat-pill-loading {
  font-style: italic;
  color: var(--text-muted);
}
.preview-empty {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-style: italic;
  padding: var(--space-xl);
  text-align: center;
}
.preview-error {
  font-size: var(--font-sm);
  color: var(--error-text);
  background: var(--error-bg);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  white-space: pre-wrap;
}
.preview-iframe {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
</style>
