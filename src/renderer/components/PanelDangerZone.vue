<!--
  PanelDangerZone — single source of truth for the entity-deletion UX
  rendered at the bottom of every paneled entity (Person, Place, Source,
  Media, Group, ResearchTask).

  Owns: trash button markup, the ConfirmModal cascade dialog, the
  showDeleteConfirm + deleting state, and the entityType → window.api.*.delete
  dispatcher. Parent panels supply cascadeSummary as already-formatted
  strings (counts, etc.) — domain knowledge stays in the panel.

  If the project decides to change the deletion UX (e.g. add a
  "type the name to confirm" gate, switch to a different cascade-summary
  shape, change the confirm dialog), it changes here — not in six places.
-->
<template>
  <div v-if="!readonly" class="panel-danger-zone">
    <AppButton variant="secondary" size="sm" @click="showConfirm = true">
      <IconTrash class="trash-icon" :size="16" />
      <span>{{ t('confirmModal.deleteEntity.action', { entity: entityName }) }}</span>
    </AppButton>

    <ConfirmModal
      :visible="showConfirm"
      :title="t('confirmModal.deleteEntity.title', { entity: entityName })"
      :message="bodyMessage"
      :messages="cascadeSummary && cascadeSummary.length > 0 ? cascadeSummary : undefined"
      tone="danger"
      icon="⚠️"
      :confirm-label="t('confirmModal.deleteEntity.confirm')"
      @cancel="showConfirm = false"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import ConfirmModal from './ConfirmModal.vue';

export type PanelDangerZoneEntityType =
  | 'person'
  | 'place'
  | 'source'
  | 'media'
  | 'group'
  | 'research-task';

const props = defineProps<{
  entityType: PanelDangerZoneEntityType;
  entityId: string;
  /** Display label for the entity (e.g. person's full name, place name). Shown in the dialog body. */
  entityLabel: string;
  /**
   * Already-formatted summary lines describing what will cascade-delete
   * (e.g. ["3 events will be removed", "2 citations will be removed"]).
   * Empty array hides the cascade list and shows only the generic body.
   */
  cascadeSummary?: string[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  deleted: [];
}>();

const { t } = useI18n();
const showConfirm = ref(false);
const deleting = ref(false);

const entityName = computed(() => t(`entities.${props.entityType}`));
const bodyMessage = computed(() =>
  t('confirmModal.deleteEntity.body', { entity: props.entityLabel }),
);

function deleteApi(): (id: string) => Promise<unknown> {
  // The entityType → API dispatcher. Single switch ensures a typo in
  // entityType is a TS error, not a silent no-op.
  const api = (window as { api?: Record<string, { delete: (id: string) => Promise<unknown> }> }).api;
  if (!api) {
    throw new Error('[PanelDangerZone] window.api unavailable');
  }
  switch (props.entityType) {
    case 'person': return api.persons.delete;
    case 'place': return api.places.delete;
    case 'source': return api.sources.delete;
    case 'media': return api.media.delete;
    case 'group': return api.groups.delete;
    case 'research-task': return api.researchTasks.delete;
  }
}

async function confirmDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await deleteApi()(props.entityId);
    showConfirm.value = false;
    emit('deleted');
  } catch (err) {
    console.error(
      `[PanelDangerZone] delete failed for ${props.entityType}/${props.entityId}:`,
      err,
    );
    // Surfacing to user via toast is the parent's responsibility — the
    // panel knows the right toast string for its entity. The error is
    // logged here for diagnostics. (Future work: emit('error', err) so
    // parents can route to their own toast.)
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.trash-icon {
  margin-right: var(--space-xs);
}
</style>
