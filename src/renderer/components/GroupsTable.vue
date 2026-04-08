<template>
  <table class="data-table">
    <thead>
      <tr>
        <th>{{ $t('groups.name') }}</th>
        <th v-if="showMembers">{{ $t('groups.members') }}</th>
        <th>{{ $t('groups.notes') }}</th>
        <th class="actions-cell">{{ $t('common.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="g in groups"
        :key="g.id"
        class="clickable-row"
        @click="router.push('/groups/' + g.id)"
      >
        <td class="td-name">{{ g.name }}</td>
        <td v-if="showMembers">{{ g.memberCount }}</td>
        <td class="notes-cell">{{ g.notes }}</td>
        <td class="actions-cell">
          <button class="btn-sm btn-delete" @click.stop="$emit('remove', g.id)">✕</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

export interface GroupRow {
  id: string;
  name: string;
  notes?: string | null;
  memberCount?: number;
}

withDefaults(defineProps<{
  groups: GroupRow[];
  showMembers?: boolean;
}>(), {
  showMembers: false,
});

defineEmits<{ remove: [id: string] }>();

const router = useRouter();
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
</style>
