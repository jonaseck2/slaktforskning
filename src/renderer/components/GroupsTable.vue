<template>
  <table class="data-table">
    <thead>
      <tr>
        <th>{{ $t('groups.name') }}</th>
        <th v-if="showMembers">{{ $t('groups.members') }}</th>
        <th>{{ $t('groups.notes') }}</th>
        <th v-if="!readonly" class="actions-cell">{{ $t('common.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="g in groups"
        :key="g.id"
        class="clickable-row"
        :class="{ 'selected-row': selectedId === g.id }"
        tabindex="0"
        role="button"
        :aria-label="$t('a11y.editItem', { item: g.name })"
        @click="$emit('select', g.id)"
        @keydown.enter="$emit('select', g.id)"
        @keydown.space.prevent="$emit('select', g.id)"
      >
        <td class="td-name" :title="g.name">{{ g.name }}</td>
        <td v-if="showMembers" class="td-count">{{ g.memberCount }}</td>
        <td class="notes-cell" :title="g.notes || ''">{{ g.notes }}</td>
        <td v-if="!readonly" class="actions-cell">
          <button
            class="btn-sm btn-delete"
            :aria-label="$t('a11y.unlinkItem', { item: g.name })"
            :title="$t('common.unlinkTooltip')"
            @click.stop="$emit('remove', g.id)"
          >
            <IconUnlink :size="14" />
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import IconUnlink from './ui/IconUnlink.vue';

export interface GroupRow {
  id: string;
  name: string;
  notes?: string | null;
  memberCount?: number;
}

const { readonly = false } = defineProps<{
  groups: GroupRow[];
  showMembers?: boolean;
  selectedId?: string | null;
  readonly?: boolean;
}>();

defineEmits<{ remove: [id: string]; select: [id: string] }>();
</script>

<style scoped>
.actions-cell { width: 1px; max-width: none; text-align: right; white-space: nowrap; vertical-align: middle; }
.notes-cell {
  color: var(--text-muted);
  font-size: var(--font-sm);
  /* In panel-section context, max-width: 0 + nowrap + ellipsis come
     from shared.css. In wider list-view context (GroupsView), keep a
     readable cap so the column doesn't dominate the table. */
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.td-count { width: 1px; max-width: none; white-space: nowrap; }
.selected-row { background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
