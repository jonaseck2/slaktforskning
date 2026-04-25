<template>
  <div>
    <div class="header">
      <h2>{{ $t('groups.title') }}</h2>
      <AppButton variant="soft" @click="showAddForm = true">+ {{ $t('groups.addGroup') }}</AppButton>
    </div>
    <p v-if="groups.length > 0" class="count-label">{{ groups.length }} {{ $t('groups.title').toLowerCase() }}</p>
    <AppEmptyState v-if="groups.length === 0" icon="🏷️" :title="$t('empty.groups')" :description="$t('empty.groupsDesc')" :action-label="$t('empty.addGroup')" @action="showAddForm = true" />
    <GroupsTable v-else :groups="groups" :show-members="true" @remove="deleteGroup" />

    <GroupModal
      v-if="showAddForm"
      mode="standalone"
      @cancel="showAddForm = false"
      @close="showAddForm = false"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '../components/ui/AppButton.vue';
import AppEmptyState from '../components/ui/AppEmptyState.vue';
import { useDataVersionStore } from '../stores/dataVersion';
import GroupsTable from '../components/GroupsTable.vue';
import GroupModal from '../components/modals/GroupModal.vue';

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

function onSaved() {
  showAddForm.value = false;
  load();
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

