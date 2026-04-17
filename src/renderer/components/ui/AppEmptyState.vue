<template>
  <div class="empty-state">
    <span class="empty-state__icon" aria-hidden="true">{{ icon }}</span>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <AppButton v-if="actionLabel" variant="primary" @click="$emit('action')">
      {{ actionLabel }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import AppButton from './AppButton.vue';

withDefaults(defineProps<{
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
}>(), {
  icon: '📭',
  description: '',
  actionLabel: '',
});

defineEmits<{ action: [] }>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-2xl) 0;
  min-height: 200px;
  text-align: center;
}

.empty-state__icon {
  font-size: 48px;
  line-height: 1;
}

.empty-state__title {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.empty-state__description {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
}
</style>
