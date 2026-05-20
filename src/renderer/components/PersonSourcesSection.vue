<template>
  <div>
    <SectionEmpty
      v-if="citations.length === 0"
      purpose-key="onboarding.empty.personSources.purpose"
      :action-label-key="props.readonly ? undefined : 'onboarding.empty.personSources.cta'"
      @action="emit('addSource')"
    />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('citations.source') }}</th>
          <th>{{ $t('citations.pageLocation') }}</th>
          <th>{{ $t('citations.confidence') }}</th>
          <th v-if="!props.readonly"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="cit in citations"
          :key="cit.id"
          class="clickable-row"
          @click="emit('editCitation', cit)"
        >
          <td class="title-cell" :title="cit.sourceTitle || ''">{{ cit.sourceTitle || $t('common.unknown') }}</td>
          <td class="page-cell">{{ cit.page || $t('citations.noPage') }}</td>
          <td class="confidence-cell">
            <span :class="'confidence-badge confidence-' + cit.confidence">
              {{ $t('confidenceLevels.' + cit.confidence) }}
            </span>
          </td>
          <td v-if="!props.readonly" class="actions-cell">
            <AppButton
              variant="ghost"
              size="sm"
              :aria-label="$t('common.delete')"
              :title="$t('common.deleteTooltip')"
              @click.stop="del.ask(cit.id)"
            >
              <IconTrash :size="14" />
            </AppButton>
          </td>
        </tr>
      </tbody>
    </table>

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('citations.removeConfirmTitle')"
      :message="$t('personSources.confirmDelete')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import SectionEmpty from './ui/SectionEmpty.vue';
import ConfirmModal from './ConfirmModal.vue';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import { useEntityData } from '../composables/useEntityData';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useToast } from '../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

export interface CitationRow {
  id: string;
  source_id: string;
  page: string;
  confidence: number;
  transcription: string;
  notes: string;
  date_accessed: string;
  sourceTitle?: string;
}

const props = withDefaults(defineProps<{
  personId: string;
  readonly?: boolean;
}>(), { readonly: false });

const emit = defineEmits<{
  addSource: [];
  editCitation: [citation: CitationRow];
}>();

const { t } = useI18n();
const toast = useToast();

const idRef = toRef(props, 'personId');
const { data, reload } = useEntityData<CitationRow[]>(idRef, async (id) => {
  const raw = await window.api.citations.forPerson(id) as CitationRow[];
  // Hydrate source titles for display. Cheap N — usually 0-5 citations per person.
  return await Promise.all(raw.map(async (c) => {
    try {
      const src = await window.api.sources.get(c.source_id) as { title: string } | null;
      return { ...c, sourceTitle: src?.title ?? '' };
    } catch {
      return { ...c, sourceTitle: '' };
    }
  }));
});

const citations = computed(() => data.value ?? []);
const count = computed(() => citations.value.length);

const del = useDeleteConfirm<string>(async (id) => {
  try {
    await window.api.citations.delete(id);
    await reload();
  } catch (err) {
    console.error('[PersonSourcesSection] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});

defineExpose({ count, reload });
</script>

<style scoped>
.title-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.page-cell {
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
.confidence-cell {
  width: 1%;
  white-space: nowrap;
}
.confidence-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
}
.confidence-0 { background: var(--error-bg); color: var(--error-text); }
.confidence-1 { background: var(--warning-bg); color: var(--warning-text); }
.confidence-2 { background: var(--info-bg); color: var(--info-text); }
.confidence-3 { background: var(--success-bg); color: var(--success-text); }
.actions-cell {
  width: 1px;
  white-space: nowrap;
  text-align: right;
  vertical-align: middle;
}
</style>
