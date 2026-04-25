<template>
  <div class="section-empty">
    <span class="section-empty__text">{{ message }}</span>
    <button v-if="actionLabel" class="section-empty__action" @click="$emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  actionLabel?: string;
}>();

defineEmits<{ action: [] }>();
</script>

<style scoped>
.section-empty {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.section-empty__text {
  flex: 1;
}

.section-empty__action {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--accent);
  font-size: var(--font-sm);
  font-family: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  line-height: inherit;
}

.section-empty__action:hover {
  color: var(--accent-hover);
}
</style>
