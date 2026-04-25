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
        <td class="td-name">{{ g.name }}</td>
        <td v-if="showMembers">{{ g.memberCount }}</td>
        <td class="notes-cell">{{ g.notes }}</td>
        <td v-if="!readonly" class="actions-cell">
          <button class="btn-sm btn-delete" @click.stop="$emit('remove', g.id)">✕</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
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
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
.notes-cell {
  color: #777;
  font-size: var(--font-sm);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td-name { white-space: nowrap; }
.selected-row { background: color-mix(in srgb, var(--accent) 10%, transparent); }
</style>
