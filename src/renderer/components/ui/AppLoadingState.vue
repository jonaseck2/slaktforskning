<template>
  <div class="loading-state">
    <div
      v-for="i in rows"
      :key="i"
      class="skeleton-bar"
      :style="{ width: i % 3 === 1 ? '100%' : i % 3 === 2 ? '75%' : '60%' }"
    />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  rows?: number;
}>(), {
  rows: 3,
});
</script>

<style scoped>
.loading-state {
  padding: var(--space-sm) 0;
}

.skeleton-bar {
  height: 16px;
  border-radius: var(--radius-sm);
  background: var(--surface-border-subtle);
  margin-bottom: var(--space-sm);
  animation: shimmer 1.5s infinite ease-in-out;
}

@keyframes shimmer {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 0.8; }
}
</style>
