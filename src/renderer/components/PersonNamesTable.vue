<template>
  <div class="names-card">
    <div
      v-for="name in names"
      :key="name.id"
      class="name-row clickable-row"
      tabindex="0"
      role="button"
      :aria-label="$t('a11y.editItem', { item: ((name.given_name || '') + ' ' + (name.surname || '')).trim() })"
      @click="$emit('edit', name)"
      @keydown.enter="$emit('edit', name)"
      @keydown.space.prevent="$emit('edit', name)"
    >
      <div class="name-content">
        <span class="name-full">
          <span v-if="name.name_prefix" class="name-prefix">{{ name.name_prefix }} </span>
          <strong><PersonName :given-name="name.given_name" :preferred-name="name.preferred_name ?? null" :nickname="name.nickname ?? null" /></strong>
          <span class="name-surname"> {{ name.surname }}</span>
          <span v-if="name.name_suffix" class="name-suffix"> {{ name.name_suffix }}</span>
          <span v-if="name.name_qualifier === 'patronymic'" class="name-qual-badge">pat.</span>
          <span v-if="name.name_qualifier === 'matronymic'" class="name-qual-badge">mat.</span>
        </span>
      </div>
      <div class="name-meta">
        <span class="type-badge">{{ $t('nameTypes.' + name.name_type) }}</span>
        <span v-if="name.sort_order === 0" class="primary-star" title="Primary name">★</span>
        <button
          v-if="name.sort_order !== 0"
          class="btn-sm btn-delete"
          :aria-label="$t('a11y.deleteItem', { item: ((name.given_name || '') + ' ' + (name.surname || '')).trim() })"
          @click.stop="$emit('delete', name.id)"
        >✕</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PersonName from './PersonName.vue';

export interface NameRow {
  id: string;
  given_name: string | null;
  surname: string | null;
  name_type: string;
  sort_order: number;
  name_prefix?: string | null;
  name_suffix?: string | null;
  patronymic_base?: string | null;
  name_qualifier?: string | null;
  preferred_name?: string | null;
  nickname?: string | null;
}

defineProps<{ names: NameRow[] }>();
defineEmits<{
  edit: [name: NameRow];
  delete: [nameId: string];
}>();
</script>

<style scoped>
.names-card {
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
  cursor: pointer;
}
.name-row:not(:last-child) {
  border-bottom: 1px solid var(--surface-border-subtle);
}
.name-row:hover {
  background: var(--surface-hover);
}
.name-content {
  flex: 1;
  min-width: 0;
}
.name-full {
  font-size: var(--font-base);
  color: var(--text-primary);
}
.name-surname {
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}
.name-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.type-badge {
  color: var(--text-muted);
  font-size: var(--font-xs);
}
.preferred-hint {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-style: italic;
}
.primary-star {
  font-size: var(--font-xs);
  color: #f0a500;
}
.name-prefix,
.name-suffix {
  color: var(--text-muted);
  font-style: italic;
}
.name-qual-badge {
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  padding: 1px 5px;
  border-radius: 8px;
  font-size: var(--font-xs);
  margin-left: 4px;
}
</style>
