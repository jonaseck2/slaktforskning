<template>
  <div class="side-panel">
    <div v-if="!entity" class="panel-empty">
      <slot name="empty">{{ $t('panel.selectToView') }}</slot>
    </div>
    <template v-else>
      <button
        class="panel-collapse-btn"
        :aria-label="$t('common.close')"
        :title="$t('common.close')"
        data-testid="entity-close"
        @click="$emit('close')"
      >▶</button>
      <h3 class="panel-role-label">{{ label }}</h3>
      <div class="panel-header">
        <div class="panel-header-content">
          <slot name="header">
            <div class="panel-name-row">
              <div class="panel-name">{{ entity?.id ?? '' }}</div>
            </div>
          </slot>
        </div>
      </div>
      <button
        v-if="editable"
        class="btn-add"
        data-testid="entity-edit"
        @click="$emit('edit')"
      >{{ $t('common.edit') }}</button>
      <div class="panel-body">
        <slot />
      </div>
      <EntityTimestamps :created-at="createdAt" :updated-at="updatedAt" />
    </template>
  </div>
</template>

<script setup lang="ts">
import EntityTimestamps from './ui/EntityTimestamps.vue';

defineProps<{
  entityType: 'person' | 'place' | 'source' | 'relationship' | 'group' | 'task' | 'media' | 'report' | 'website';
  entity: { id: string; created_at?: string | null; updated_at?: string | null } | null;
  label: string;
  editable?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}>();
defineEmits<{ close: []; edit: [] }>();
</script>

<style scoped>
/* Layout, surface, and 28px left padding for the collapse tab come from
   `.side-panel` in shared.css. */

/* Collapse arrow on the panel's left edge — mirrors the
   `list-collapse-btn` / `list-open-btn` pattern on entity lists. */
.panel-collapse-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.panel-collapse-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-xl);
  text-align: center;
}

/* Role label above the entity header (states what the panel does). Sits as
   non-scrolling chrome above the scrollable .panel-body. */
.panel-role-label {
  margin: 0;
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  padding: var(--space-md) var(--space-lg) var(--space-sm);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  border-bottom: 1px solid var(--surface-border-subtle);
  background: var(--surface);
}

/* Scrollable region holding the panel's <slot/> content. The role label,
   entity header, and (optional) Edit button stay outside this region as
   non-scrolling chrome — that keeps the absolute-positioned collapse tab
   anchored visually while the user scrolls deep panel content. */
.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.panel-role-label + .panel-header {
  border-radius: 0;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.panel-header-content {
  padding: var(--space-md) var(--space-lg);
  flex: 1;
  min-width: 0;
}
</style>
