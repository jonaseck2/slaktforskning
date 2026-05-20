<!--
  SourceRepositoriesSection — shows the structured Repository records linked
  to a given source via source_repositories. Hosted inside SourcePanel.

  Purpose: let the user see which archives/libraries hold this source, link
  existing repositories to it (or create a new one), and unlink without
  destroying either side.
-->
<!--
  Empty-state coaching N/A: this section's empty state is a single short
  "no repositories linked" line followed immediately by the parent panel's
  `+ Repository` CTA in the SectionHeader. The picker UI handles the
  authoring affordance — adding a SectionEmpty here would duplicate the
  CTA that already lives one DOM level up.
-->
<template>
  <div>
    <p v-if="linkedRepositories.length === 0 && !showPicker" class="muted small">
      {{ $t('repositories.noRepositories') }}
    </p>
    <ul v-else-if="linkedRepositories.length > 0" class="repo-list">
      <li v-for="repo in linkedRepositories" :key="repo.id" class="repo-row">
        <a class="repo-link" href="#" @click.prevent="goToRepository(repo.id)">
          {{ repo.name }}<span v-if="repo.city || repo.country" class="repo-loc">
            — {{ [repo.city, repo.country].filter(Boolean).join(', ') }}
          </span>
        </a>
        <AppButton
          variant="ghost"
          size="sm"
          :aria-label="$t('repositories.unlinkFromSource')"
          :title="$t('repositories.unlinkFromSource')"
          @click="askUnlink(repo.id)"
        >
          <IconTrash :size="14" />
        </AppButton>
      </li>
    </ul>

    <div v-if="showPicker" class="picker-row">
      <select v-model="pendingRepoId" class="compact-control">
        <option value="">{{ $t('sourcePanel.selectRepository') }}</option>
        <option
          v-for="repo in unlinkedRepositories"
          :key="repo.id"
          :value="repo.id"
        >
          {{ repo.name }}{{ repo.city ? ' — ' + repo.city : '' }}
        </option>
      </select>
      <AppButton variant="soft" size="sm" :disabled="!pendingRepoId" @click="doLink">
        {{ $t('common.add') }}
      </AppButton>
      <AppButton variant="ghost" size="sm" @click="cancelPicker">
        {{ $t('common.cancel') }}
      </AppButton>
      <AppButton variant="ghost" size="sm" @click="showAddModal = true">
        + {{ $t('repositories.singular') }}
      </AppButton>
    </div>

    <RepositoryModal
      v-if="showAddModal"
      mode="standalone"
      @cancel="showAddModal = false"
      @close="showAddModal = false"
      @saved="onNewRepoSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('repositories.unlinkConfirmTitle')"
      :message="$t('repositories.confirmUnlink')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.remove')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import ConfirmModal from './ConfirmModal.vue';
import RepositoryModal from './modals/RepositoryModal.vue';
import { useEntityData } from '../composables/useEntityData';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useToast } from '../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RepositoryRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

const props = defineProps<{
  sourceId: string;
  showPicker: boolean;
}>();
const emit = defineEmits<{
  'cancel-picker': [];
}>();

const { t } = useI18n();
const toast = useToast();
const router = useRouter();

const pendingRepoId = ref('');
const showAddModal = ref(false);

interface PanelData {
  linked: RepositoryRow[];
  all: RepositoryRow[];
}

const idRef = toRef(props, 'sourceId');
const { data, reload } = useEntityData<PanelData>(idRef, async (id) => {
  try {
    const [linked, all] = await Promise.all([
      window.api.repositories.forSource(id) as Promise<RepositoryRow[]>,
      window.api.repositories.list() as Promise<RepositoryRow[]>,
    ]);
    return { linked, all };
  } catch (err) {
    console.error('[SourceRepositoriesSection] load failed:', err);
    toast.error(t('errors.loadFailed'));
    return { linked: [], all: [] };
  }
});

const linkedRepositories = computed(() => data.value?.linked ?? []);
const unlinkedRepositories = computed(() => {
  const linkedIds = new Set(linkedRepositories.value.map(r => r.id));
  return (data.value?.all ?? []).filter(r => !linkedIds.has(r.id));
});

async function doLink() {
  if (!pendingRepoId.value) return;
  try {
    await window.api.repositories.linkSource(props.sourceId, pendingRepoId.value);
    pendingRepoId.value = '';
    emit('cancel-picker');
    await reload();
  } catch (err) {
    console.error('[SourceRepositoriesSection] link failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

function cancelPicker() {
  pendingRepoId.value = '';
  emit('cancel-picker');
}

async function onNewRepoSaved(repo: { id: string }) {
  showAddModal.value = false;
  try {
    await window.api.repositories.linkSource(props.sourceId, repo.id);
    await reload();
    emit('cancel-picker');
  } catch (err) {
    console.error('[SourceRepositoriesSection] post-create link failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

const del = useDeleteConfirm<string>(async (repoId) => {
  try {
    await window.api.repositories.unlinkSource(props.sourceId, repoId);
    await reload();
  } catch (err) {
    console.error('[SourceRepositoriesSection] unlink failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function askUnlink(repoId: string) { del.ask(repoId); }

function goToRepository(id: string) {
  router.push('/repositories/' + id);
}
</script>

<style scoped>
.muted { color: var(--text-muted); }
.small { font-size: var(--font-sm); }
.repo-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.repo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
}
.repo-row:last-child { border-bottom: none; }
.repo-link {
  color: var(--color-link);
  text-decoration: none;
  font-size: var(--font-sm);
}
.repo-link:hover { text-decoration: underline; }
.repo-loc { color: var(--text-muted); }
.picker-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;
  flex-wrap: wrap;
}
.compact-control {
  flex: 1;
  min-width: 160px;
  font-size: var(--font-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  font-family: inherit;
}
</style>
