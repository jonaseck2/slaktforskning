<template>
  <div v-if="createdAt || updatedAt" class="entity-timestamps">
    <span v-if="createdAt" :title="createdAt">
      {{ $t('panel.created') }} {{ formatDate(createdAt) }}
    </span>
    <span
      v-if="updatedAt && updatedAt !== createdAt"
      :title="updatedAt"
    > · {{ $t('panel.updated') }} {{ formatDate(updatedAt) }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  createdAt?: string | null;
  updatedAt?: string | null;
}>();

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}
</script>

<style scoped>
.entity-timestamps {
  font-size: var(--font-xs);
  color: var(--text-muted);
  padding: var(--space-sm) var(--space-md);
  margin-top: var(--space-md);
  border-top: 1px solid var(--surface-border-subtle);
}
</style>
