<template>
  <div class="section-header-bar" @click="$emit('toggle')">
    <button type="button" class="chevron-btn" :aria-expanded="!collapsed" aria-label="Toggle section">
      {{ collapsed ? '►' : '▼' }}
    </button>
    <span class="section-title">{{ title }}</span>
    <span v-if="count !== undefined" class="section-count">({{ count }})</span>
    <span class="spacer" />
    <AppButton
      v-if="actionLabel"
      variant="ghost"
      size="sm"
      @click.stop="$emit('action')"
    >
      {{ actionLabel }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import AppButton from './AppButton.vue';

withDefaults(defineProps<{
  title: string;
  count?: number;
  collapsed?: boolean;
  actionLabel?: string;
}>(), {
  collapsed: false,
  actionLabel: '',
});

defineEmits<{ toggle: []; action: [] }>();
</script>

<style scoped>
.section-header-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  cursor: pointer;
  user-select: none;
}

.chevron-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-sm);
  width: 16px;
  text-align: center;
  line-height: 1;
  font-family: inherit;
}

.section-title {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-base);
  color: var(--text-primary);
}

.section-count {
  font-weight: var(--font-weight-normal);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.spacer {
  flex: 1;
}
</style>
