<!--
  Self-loading panel section for `person_associations` rows (T21 — GEDCOM
  7.0 ASSO without event). Surfaces general person-to-person links that
  aren't tied to a specific event: friends, colleagues, godparents in
  general (distinct from baptism-event godparents), neighbours, enemies.
-->
<template>
  <div>
    <SectionEmpty
      v-if="rows.length === 0 && !props.readonly"
      :message="$t('personAssociations.empty')"
    />
    <div v-if="rows.length === 0 && props.readonly" class="empty-readonly">
      {{ $t('personAssociations.empty') }}
    </div>

    <table v-if="rows.length > 0" class="data-table">
      <thead>
        <tr>
          <th>{{ $t('personAssociations.relatedPerson') }}</th>
          <th>{{ $t('personAssociations.role') }}</th>
          <th v-if="!props.readonly"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          class="clickable-row"
          @click="openEdit(row)"
        >
          <td class="related-cell">
            <router-link
              v-if="row.relatedName"
              :to="'/persons/' + row.related_person_id"
              class="person-link"
              @click.stop
            >
              {{ row.relatedName }}
            </router-link>
            <span v-else class="muted">{{ row.related_person_id }}</span>
          </td>
          <td class="role-cell">
            <span class="role-badge">{{ $t('personAssociations.roles.' + row.role) }}</span>
          </td>
          <td v-if="!props.readonly" class="actions-cell">
            <AppButton
              variant="ghost"
              size="sm"
              :aria-label="$t('common.delete')"
              :title="$t('common.deleteTooltip')"
              @click.stop="del.ask(row)"
            >
              <IconTrash :size="14" />
            </AppButton>
          </td>
        </tr>
      </tbody>
    </table>

    <AssociationModal
      v-if="!props.readonly && showModal"
      :person-id="props.personId"
      :editing="editing"
      @cancel="closeModal"
      @close="closeModal"
      @saved="onSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('personAssociations.deleteConfirm')"
      :message="$t('personAssociations.deleteConfirm')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import SectionEmpty from './ui/SectionEmpty.vue';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import ConfirmModal from './ConfirmModal.vue';
import AssociationModal from './modals/AssociationModal.vue';
import { useEntityData } from '../composables/useEntityData';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useToast } from '../composables/useToast';
import { resolvePersonDisplayName } from '../utils/nameUtils';
import type { PersonAssociation } from '../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface AssociationRow extends PersonAssociation {
  relatedName?: string;
}

const props = withDefaults(defineProps<{
  personId: string;
  readonly?: boolean;
}>(), { readonly: false });

const { t } = useI18n();
const toast = useToast();

const idRef = toRef(props, 'personId');
const { data, reload } = useEntityData<AssociationRow[]>(idRef, async (id) => {
  if (!id || !window.api?.personAssociations) return [];
  const raw = (await window.api.personAssociations.forPerson(id)) as PersonAssociation[];
  // Hydrate related-person display names. Usually 0-5 per person.
  return await Promise.all(raw.map(async (r) => ({
    ...r,
    relatedName: await resolvePersonDisplayName(r.related_person_id, ''),
  })));
});

const rows = computed(() => data.value ?? []);
const count = computed(() => rows.value.length);

// ── Modal state ────────────────────────────────────────────────────────────
const showModal = ref(false);
const editing = ref<PersonAssociation | null>(null);

function openAddForm() {
  editing.value = null;
  showModal.value = true;
}

function openEdit(row: PersonAssociation) {
  if (props.readonly) return;
  editing.value = row;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editing.value = null;
}

async function onSaved() {
  closeModal();
  await reload();
}

// ── Delete ─────────────────────────────────────────────────────────────────
const del = useDeleteConfirm<PersonAssociation>(async (row) => {
  try {
    await window.api.personAssociations.delete(row.id);
    await reload();
  } catch (err) {
    console.error('[PersonAssociationsSection] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});

defineExpose({ count, reload, openAddForm });
</script>

<style scoped>
.related-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.role-cell {
  width: 1%;
  white-space: nowrap;
}
.role-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-size: var(--font-xs);
}
.actions-cell {
  width: 1px;
  white-space: nowrap;
  text-align: right;
}
.muted {
  color: var(--text-muted);
}
.empty-readonly {
  font-size: var(--font-sm);
  color: var(--text-muted);
  padding: var(--space-sm) 0;
}
</style>
