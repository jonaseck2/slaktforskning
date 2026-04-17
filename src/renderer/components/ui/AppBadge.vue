<template>
  <span :class="['app-badge', `app-badge--${variant}`]">
    <slot />
  </span>
</template>

<script setup lang="ts">
defineProps<{
  variant: 'sex-f' | 'sex-m' | 'sex-u' | 'severity-high' | 'severity-medium' | 'severity-low' | 'status' | 'count' | 'event';
}>();
</script>

<style scoped>
.app-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  line-height: 1.4;
}

.app-badge--sex-f {
  background: var(--sex-f-bg);
  color: var(--sex-f-text);
}
.app-badge--sex-m {
  background: var(--sex-m-bg);
  color: var(--sex-m-text);
}
.app-badge--sex-u {
  background: var(--sex-u-bg);
  color: var(--sex-u-text);
}
.app-badge--severity-high {
  background: var(--error-bg);
  color: var(--error-text);
}
.app-badge--severity-medium {
  background: var(--warning-bg);
  color: var(--warning-text);
}
.app-badge--severity-low {
  background: var(--success-bg);
  color: var(--success-text);
}
.app-badge--status {
  background: var(--surface-hover);
  color: var(--text-secondary);
}
.app-badge--count {
  background: var(--accent);
  color: var(--accent-text);
}
.app-badge--event {
  background: var(--surface-hover);
  color: var(--accent);
}
</style>
