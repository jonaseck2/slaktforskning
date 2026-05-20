<!--
  Self-loading panel section for `source_coverage_events` rows (T24 — GEDCOM
  SOUR/DATA/EVEN). Describes which event types / date ranges / places a
  source covers as a whole. Distinct from citations, which attach a source
  to one specific authored event.
-->
<template>
  <div>
    <SectionEmpty
      v-if="rows.length === 0"
      :message="$t('sourceCoverage.empty')"
    />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('sourceCoverage.eventType') }}</th>
          <th>{{ $t('sourceCoverage.dateFrom') }} – {{ $t('sourceCoverage.dateTo') }}</th>
          <th>{{ $t('sourceCoverage.place') }}</th>
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
          <td class="type-cell">
            <span class="event-type-badge">{{ $t('eventTypes.' + row.event_type) }}</span>
          </td>
          <td class="date-cell">
            <span v-if="row.date_value_from || row.date_value_to" class="date-range">
              {{ row.date_value_from || '—' }}<span class="date-sep">–</span>{{ row.date_value_to || '—' }}
            </span>
            <span v-else class="muted">—</span>
          </td>
          <td class="place-cell">
            <router-link
              v-if="row.place_id && row.placeName"
              :to="'/places/' + row.place_id"
              class="person-link"
              @click.stop
            >
              {{ row.placeName }}
            </router-link>
            <span v-else class="muted">—</span>
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

    <SourceCoverageModal
      v-if="!props.readonly && showModal"
      :source-id="props.sourceId"
      :editing="editing"
      @cancel="closeModal"
      @close="closeModal"
      @saved="onSaved"
    />

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('sourceCoverage.deleteConfirm')"
      :message="$t('sourceCoverage.deleteConfirm')"
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
import SourceCoverageModal from './modals/SourceCoverageModal.vue';
import { useEntityData } from '../composables/useEntityData';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useToast } from '../composables/useToast';
import type { SourceCoverageEvent } from '../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface CoverageRow extends SourceCoverageEvent {
  placeName?: string;
}

const props = withDefaults(defineProps<{
  sourceId: string;
  readonly?: boolean;
}>(), { readonly: false });

const { t } = useI18n();
const toast = useToast();

const idRef = toRef(props, 'sourceId');
const { data, reload } = useEntityData<CoverageRow[]>(idRef, async (id) => {
  if (!id || !window.api?.sourceCoverage) return [];
  const raw = (await window.api.sourceCoverage.forSource(id)) as SourceCoverageEvent[];
  // Hydrate place names for display. Usually 0-3 coverage rows per source.
  return await Promise.all(raw.map(async (r) => {
    if (!r.place_id) return r as CoverageRow;
    try {
      const place = (await window.api.places.get(r.place_id)) as { name: string } | null;
      return { ...r, placeName: place?.name ?? '' };
    } catch {
      return { ...r, placeName: '' };
    }
  }));
});

const rows = computed(() => data.value ?? []);
const count = computed(() => rows.value.length);

// ── Modal state ────────────────────────────────────────────────────────────
const showModal = ref(false);
const editing = ref<SourceCoverageEvent | null>(null);

function openAddForm() {
  editing.value = null;
  showModal.value = true;
}

function openEdit(row: SourceCoverageEvent) {
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
const del = useDeleteConfirm<SourceCoverageEvent>(async (row) => {
  try {
    await window.api.sourceCoverage.delete(row.id);
    await reload();
  } catch (err) {
    console.error('[SourceCoverageSection] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});

defineExpose({ count, reload, openAddForm });
</script>

<style scoped>
.type-cell {
  width: 1%;
  white-space: nowrap;
}
.event-type-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-size: var(--font-xs);
}
.date-cell {
  font-size: var(--font-sm);
  white-space: nowrap;
}
.date-range { color: var(--text-primary); }
.date-sep { margin: 0 4px; color: var(--text-muted); }
.place-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.actions-cell {
  width: 1px;
  white-space: nowrap;
  text-align: right;
}
.muted { color: var(--text-muted); }
</style>
