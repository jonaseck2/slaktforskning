<template>
  <div>
    <SectionEmpty v-if="identifiers.length === 0" :message="$t('empty.identifiers')" />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="th-shrink">{{ $t('identifiers.type') }}</th>
          <th>{{ $t('identifiers.value') }}</th>
          <th v-if="!props.readonly" class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ident in identifiers" :key="ident.id">
          <td class="td-type"><span class="type-badge">{{ $t('identifiers.types.' + ident.identifier_type) }}</span></td>
          <td>{{ ident.identifier_value }}</td>
          <td v-if="!props.readonly" class="actions-cell">
            <button
              class="btn-sm btn-delete"
              :aria-label="$t('a11y.deleteItem', { item: $t('identifiers.types.' + ident.identifier_type) + ' ' + ident.identifier_value })"
              @click="remove(ident.id)"
            >✕</button>
          </td>
        </tr>
      </tbody>
    </table>

    <PersonIdentifierModal
      v-if="showAddForm && !props.readonly"
      :person-id="personId"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('identifiers.removeConfirmTitle')"
      :message="$t('identifiers.confirmDelete')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import PersonIdentifierModal from './modals/PersonIdentifierModal.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import ConfirmModal from './ConfirmModal.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useEntityData } from '../composables/useEntityData';

export interface IdentifierRow {
  id: string;
  identifier_type: string;
  identifier_value: string;
}

const props = defineProps<{ personId: string; readonly?: boolean }>();

const showAddForm = ref(false);

const idRef = computed(() => props.personId ?? null);
const { data, reload } = useEntityData<IdentifierRow[]>(idRef, async (id) => {
  return (await window.api.persons.getIdentifiers(id)) as IdentifierRow[];
});
const identifiers = computed(() => data.value ?? []);

defineExpose({ openAddForm: () => { showAddForm.value = true; }, count: computed(() => identifiers.value.length) });

function onSaved() {
  showAddForm.value = false;
  reload();
}

const del = useDeleteConfirm<string>(async (id) => {
  await window.api.persons.deleteIdentifier(id);
  await reload();
});
function remove(id: string) { del.ask(id); }
</script>

<style scoped>
.th-shrink, .td-type { width: 1%; white-space: nowrap; }
.type-badge {
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
}
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
</style>
