<template>
  <BaseSubPanel
    entity-type="person"
    :title="$t('persons.columnPicker.title')"
    mode="standalone"
    :save-label="$t('common.done')"
    @cancel="$emit('close')"
    @save="$emit('close')"
    @close="$emit('close')"
  >
    <p class="cp-help">{{ $t('persons.columnPicker.help') }}</p>
    <div class="cp-list">
      <label
        v-for="col in columns"
        :key="col.key"
        class="cp-row"
        :class="{ 'cp-row-locked': col.locked }"
      >
        <input
          type="checkbox"
          :checked="visible.includes(col.key)"
          :disabled="col.locked"
          @change="toggle(col.key)"
        />
        <span class="cp-row-label">{{ $t(col.labelKey) }}</span>
        <span v-if="col.locked" class="cp-row-locked-hint">{{ $t('persons.columnPicker.alwaysVisible') }}</span>
      </label>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import BaseSubPanel from './BaseSubPanel.vue';
import type { PersonsColumnKey } from '../../utils/storage-keys';

defineProps<{
  visible: PersonsColumnKey[];
  columns: ReadonlyArray<{ key: PersonsColumnKey; labelKey: string; locked?: boolean }>;
}>();
const emit = defineEmits<{
  toggle: [key: PersonsColumnKey];
  close: [];
}>();

function toggle(key: PersonsColumnKey) {
  emit('toggle', key);
}
</script>

<style scoped>
.cp-help {
  margin: 0 0 var(--space-md) 0;
  color: var(--text-secondary);
  font-size: var(--font-sm);
}
.cp-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.cp-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
}
.cp-row:hover {
  background: var(--surface-hover);
}
.cp-row-locked {
  cursor: default;
  opacity: 0.7;
}
.cp-row-locked:hover {
  background: transparent;
}
.cp-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.cp-row-label {
  flex: 1;
  font-size: var(--font-base);
  color: var(--text-primary);
}
.cp-row-locked-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
