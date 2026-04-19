<template>
  <div>
    <div v-if="identifiers.length === 0" class="empty-hint">{{ $t('empty.identifiers') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="th-shrink">{{ $t('identifiers.type') }}</th>
          <th>{{ $t('identifiers.value') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ident in identifiers" :key="ident.id">
          <td class="td-type"><span class="type-badge">{{ $t('identifiers.types.' + ident.identifier_type) }}</span></td>
          <td>{{ ident.identifier_value }}</td>
          <td class="actions-cell">
            <button class="btn-sm btn-delete" @click="remove(ident.id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>

    <BaseModal v-if="showAddForm" @close="showAddForm = false" title-id="modal-title-identifier">
        <h3 id="modal-title-identifier">{{ $t('identifiers.addTitle') }}</h3>
        <form @submit.prevent="add">
          <label>
            {{ $t('identifiers.type') }}
            <select v-model="form.identifier_type">
              <option value="familysearch">FamilySearch</option>
              <option value="ancestry">Ancestry</option>
              <option value="riksarkivet">Riksarkivet</option>
              <option value="personnummer">Personnummer</option>
              <option value="refn">{{ $t('identifiers.types.refn') }}</option>
              <option value="rin">RIN</option>
              <option value="other">{{ $t('identifiers.types.other') }}</option>
            </select>
          </label>
          <label>
            {{ $t('identifiers.value') }}
            <input v-model="form.identifier_value" type="text" required autofocus />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showAddForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import BaseModal from './BaseModal.vue';

export interface IdentifierRow {
  id: string;
  identifier_type: string;
  identifier_value: string;
}

const props = defineProps<{ personId: string }>();

const identifiers = ref<IdentifierRow[]>([]);
const showAddForm = ref(false);
const form = reactive({ identifier_type: 'familysearch', identifier_value: '' });

defineExpose({ openAddForm: () => { showAddForm.value = true; }, count: computed(() => identifiers.value.length) });

async function load() {
  identifiers.value = (await window.api.persons.getIdentifiers(props.personId)) as IdentifierRow[];
}

async function add() {
  if (!form.identifier_value.trim()) return;
  await window.api.persons.addIdentifier(props.personId, {
    identifier_type: form.identifier_type,
    identifier_value: form.identifier_value,
  });
  form.identifier_value = '';
  showAddForm.value = false;
  await load();
}

async function remove(id: string) {
  await window.api.persons.deleteIdentifier(id);
  await load();
}

watch(() => props.personId, load, { immediate: true });
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
