<template>
  <div>
    <div class="header">
      <h2>{{ $t('groups.title') }}</h2>
      <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('groups.addGroup') }}</AppButton>
    </div>
    <p v-if="groups.length > 0" class="count-label">{{ groups.length }} {{ $t('groups.title').toLowerCase() }}</p>
    <AppEmptyState v-if="groups.length === 0" icon="🏷️" :title="$t('groups.emptyState')" />
    <GroupsTable v-else :groups="groups" :show-members="true" @remove="deleteGroup" />

    <!-- Add Group Modal -->
    <BaseModal v-if="showAddForm" @close="showAddForm = false" title-id="modal-title-add-group">
        <h3 id="modal-title-add-group">{{ $t('groups.addGroup') }}</h3>
        <form @submit.prevent="addGroup">
          <label>
            {{ $t('groups.name') }} *
            <input v-model="form.name" type="text" required autofocus />
          </label>
          <label>
            {{ $t('groups.notes') }}
            <textarea v-model="form.notes" rows="2" />
          </label>
          <div class="modal-actions">
            <AppButton variant="secondary" @click="showAddForm = false">{{ $t('common.cancel') }}</AppButton>
            <AppButton variant="primary" type="submit">{{ $t('common.save') }}</AppButton>
          </div>
        </form>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../components/BaseModal.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import { useDataVersionStore } from '../stores/dataVersion';
import GroupsTable from '../components/GroupsTable.vue';
const dataVersionStore = useDataVersionStore();
let loadedVersion = -1;

interface GroupRow {
  id: string;
  name: string;
  notes: string;
  memberCount: number;
}

const { t } = useI18n();
const groups = ref<GroupRow[]>([]);
const showAddForm = ref(false);
const form = reactive({ name: '', notes: '' });

async function load() {
  if (!window.api) return;
  const raw = (await window.api.groups.list()) as Array<{ id: string; name: string; notes: string }>;
  const enriched: GroupRow[] = [];
  for (const g of raw) {
    const members = (await window.api.groups.getMembers(g.id)) as unknown[];
    enriched.push({ ...g, memberCount: members.length });
  }
  groups.value = enriched;
}

async function addGroup() {
  if (!window.api || !form.name.trim()) return;
  await window.api.groups.create({ name: form.name.trim(), notes: form.notes.trim() });
  showAddForm.value = false;
  form.name = '';
  form.notes = '';
  await load();
}

async function deleteGroup(id: string) {
  if (!confirm(t('groups.confirmDelete'))) return;
  await window.api.groups.delete(id);
  await load();
}

onMounted(async () => {
  await load();
  loadedVersion = dataVersionStore.version;
});

onActivated(async () => {
  if (dataVersionStore.version !== loadedVersion) {
    await load();
    loadedVersion = dataVersionStore.version;
  }
});
</script>

