<template>
  <table class="data-table">
    <thead>
      <tr>
        <th>{{ $t('persons.givenName') }}</th>
        <th>{{ $t('persons.surname') }}</th>
        <th class="th-shrink">{{ $t('common.type') }}</th>
        <th class="th-actions th-shrink">{{ $t('common.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="name in names" :key="name.id" class="clickable-row" @click="$emit('edit', name)">
        <td>
          <span v-if="name.name_prefix" class="name-prefix">{{ name.name_prefix }} </span>
          <PersonName :given-name="name.given_name" :preferred-name="name.preferred_name ?? null" :nickname="name.nickname ?? null" />
        </td>
        <td>
          {{ name.surname }}{{ name.name_suffix ? ' ' : '' }}<span v-if="name.name_suffix" class="name-suffix">{{ name.name_suffix }}</span><span v-if="name.name_qualifier === 'patronymic'" class="name-qual-badge">pat.</span><span v-if="name.name_qualifier === 'matronymic'" class="name-qual-badge">mat.</span>
        </td>
        <td class="td-type"><span class="type-badge">{{ $t('nameTypes.' + name.name_type) }}</span></td>
        <td class="actions-cell">
          <span v-if="name.sort_order === 0" class="primary-star" title="Primary name">★</span>
          <button
            v-else
            class="btn-sm btn-delete"
            @click.stop="$emit('delete', name.id)"
          >✕</button>
        </td>
      </tr>
    </tbody>
  </table>
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
.th-shrink,
.td-type {
  width: 1%;
  white-space: nowrap;
}
.actions-cell {
  width: 1%;
  white-space: nowrap;
  vertical-align: middle;
}
.type-badge {
  background: #f0fdf4;
  color: #166534;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.primary-star {
  font-size: 12px;
  color: #f0a500;
}
.name-prefix,
.name-suffix {
  color: #6b7280;
  font-style: italic;
}
.name-qual-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 11px;
  margin-left: 4px;
}
</style>
