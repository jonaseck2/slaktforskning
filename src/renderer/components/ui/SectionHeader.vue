<template>
  <div class="section-header-bar" :class="{ 'not-collapsible': !collapsible }" @click="collapsible && $emit('toggle')">
    <button v-if="collapsible" type="button" class="chevron-btn" :aria-expanded="!collapsed" aria-label="Toggle section">
      {{ collapsed ? '►' : '▼' }}
    </button>
    <span class="section-title">{{ title }}</span>
    <span v-if="count !== undefined" class="section-count">({{ count }})</span>
    <span class="spacer" />
    <AppButton
      v-if="actionLabel"
      variant="soft"
      size="sm"
      @click.stop="onAction"
    >
      {{ actionLabel }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import AppButton from './AppButton.vue';

const props = withDefaults(defineProps<{
  title: string;
  count?: number;
  collapsed?: boolean;
  collapsible?: boolean;
  actionLabel?: string;
}>(), {
  collapsed: false,
  collapsible: true,
  actionLabel: '',
});

const emit = defineEmits<{ toggle: []; action: [] }>();

// When the user clicks the action while the section is collapsed, expand the
// section first so the action's result (a new row, an opened picker, the
// updated count) is visible. Without this, handlers that depend on a child
// component being mounted (e.g. mediaSectionRef?.attach()) silently no-op
// because the v-if-guarded section body hasn't rendered yet. Awaiting nextTick
// after toggle gives Vue a chance to mount the body before the parent's
// @action handler runs.
async function onAction() {
  if (props.collapsed) {
    emit('toggle');
    await nextTick();
  }
  emit('action');
}
</script>

<style scoped>
.section-header-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--surface-hover);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
}

.section-header-bar.not-collapsible {
  cursor: default;
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
