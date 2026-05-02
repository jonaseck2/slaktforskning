<template>
  <div class="names-card">
    <div
      v-for="(row, idx) in sortedRows"
      :key="row.id"
      :class="['name-row', readonly ? '' : 'clickable-row']"
      :tabindex="readonly ? undefined : 0"
      :role="readonly ? undefined : 'button'"
      :aria-label="readonly ? undefined : $t('a11y.editItem', { item: ((row.given_name || '') + ' ' + (row.surname || '')).trim() })"
      @click="!readonly && $emit('edit', row)"
      @keydown.enter="!readonly && $emit('edit', row)"
      @keydown.space.prevent="!readonly && $emit('edit', row)"
    >
      <div class="name-content">
        <span class="name-full">
          <span v-if="row.name_prefix" class="name-prefix">{{ row.name_prefix }} </span>
          <strong><PersonName :given-name="row.given_name" :preferred-name="row.preferred_name ?? null" :nickname="row.nickname ?? null" /></strong>{{ ' ' }}<span class="name-surname">{{ row.surname }}</span>
          <span v-if="row.name_suffix" class="name-suffix"> {{ row.name_suffix }}</span>
          <span v-if="row.name_qualifier === 'patronymic'" class="name-qual-badge">pat.</span>
          <span v-if="row.name_qualifier === 'matronymic'" class="name-qual-badge">mat.</span>
        </span>
        <span class="name-meta-line">
          <span class="type-badge">{{ $t('nameTypes.' + row.name_type) }}</span>
          <span class="date-cell" :class="{ 'is-empty': !row.effective_date_from }">
            <span v-if="row.effective_date_from">{{ row.effective_date_from }}</span>
            <span v-else class="date-dash">—</span>
            <span v-if="row.is_birth_date_from_event" class="date-source-hint" :title="$t('names.dateFromBirthEvent')">●</span>
          </span>
        </span>
      </div>
      <div class="name-actions">
        <button
          v-if="!readonly"
          type="button"
          class="btn-order"
          :disabled="idx === 0"
          :aria-label="$t('media.moveUp')"
          :title="$t('media.moveUp')"
          @click.stop="moveUp(idx)"
        >&#9650;</button>
        <button
          v-if="!readonly"
          type="button"
          class="btn-order"
          :disabled="idx === sortedRows.length - 1"
          :aria-label="$t('media.moveDown')"
          :title="$t('media.moveDown')"
          @click.stop="moveDown(idx)"
        >&#9660;</button>
        <button
          v-if="!readonly"
          class="btn-sm btn-delete"
          :disabled="row.name_type === 'birth'"
          :aria-label="row.name_type === 'birth' ? $t('persons.birthNameNotDeletable') : $t('a11y.deleteItem', { item: ((row.given_name || '') + ' ' + (row.surname || '')).trim() })"
          :title="row.name_type === 'birth' ? $t('persons.birthNameNotDeletable') : $t('common.deleteTooltip')"
          @click.stop="row.name_type !== 'birth' && $emit('delete', row.id)"
        >
          <IconTrash :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonName from './PersonName.vue';
import IconTrash from './ui/IconTrash.vue';
import { useToast } from '../composables/useToast';

export interface NameRow {
  id: string;
  given_name: string | null;
  surname: string | null;
  name_type: string;
  sort_order: number;
  date_from?: string | null;
  date_to?: string | null;
  name_prefix?: string | null;
  name_suffix?: string | null;
  patronymic_base?: string | null;
  name_qualifier?: string | null;
  preferred_name?: string | null;
  nickname?: string | null;
}

interface DisplayRow extends NameRow {
  effective_date_from: string | null;
  is_birth_date_from_event: boolean;
}

const props = defineProps<{
  names: NameRow[];
  birthEventDate?: string | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  edit: [name: NameRow];
  delete: [nameId: string];
  reorder: [orderedIds: string[]];
}>();

const { t } = useI18n();
const toast = useToast();

/**
 * Effective date_from for ranking. Mirrors `displayedNameIdSql` in
 * src/api/persons.ts: birth names take their effective date from the
 * birth event when available; other names use their stored date_from.
 */
function effectiveDateFromOf(name: NameRow): { value: string | null; fromBirthEvent: boolean } {
  if (name.name_type === 'birth') {
    if (props.birthEventDate) return { value: props.birthEventDate, fromBirthEvent: true };
    return { value: name.date_from ?? null, fromBirthEvent: false };
  }
  return { value: name.date_from ?? null, fromBirthEvent: false };
}

const sortedRows = computed<DisplayRow[]>(() => {
  const decorated: DisplayRow[] = props.names.map(n => {
    const eff = effectiveDateFromOf(n);
    return { ...n, effective_date_from: eff.value, is_birth_date_from_event: eff.fromBirthEvent };
  });
  decorated.sort((a, b) => {
    if (a.effective_date_from && b.effective_date_from) {
      if (a.effective_date_from !== b.effective_date_from) {
        return b.effective_date_from.localeCompare(a.effective_date_from); // DESC
      }
    } else if (a.effective_date_from && !b.effective_date_from) {
      return -1;
    } else if (!a.effective_date_from && b.effective_date_from) {
      return 1;
    }
    if (a.sort_order !== b.sort_order) return b.sort_order - a.sort_order;
    return a.id.localeCompare(b.id);
  });
  return decorated;
});

/**
 * Block reorders that would create a younger-before-older inversion among
 * dated rows. Returns true when the proposed swap is allowed.
 */
function canSwap(a: DisplayRow, b: DisplayRow): boolean {
  // Allow when at least one row is undated — manual ordering only matters for ties.
  if (!a.effective_date_from || !b.effective_date_from) return true;
  // Both dated: only allow if they share the same date. Otherwise the
  // rule (table sorted DESC by date) would re-sort them back.
  return a.effective_date_from === b.effective_date_from;
}

function moveUp(idx: number) {
  if (idx === 0) return;
  const above = sortedRows.value[idx - 1];
  const target = sortedRows.value[idx];
  if (!canSwap(above, target)) {
    toast.error(t('names.reorderInversionBlocked'));
    return;
  }
  const newOrder = [...sortedRows.value];
  [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
  emit('reorder', newOrder.map(r => r.id));
}

function moveDown(idx: number) {
  if (idx === sortedRows.value.length - 1) return;
  const below = sortedRows.value[idx + 1];
  const target = sortedRows.value[idx];
  if (!canSwap(target, below)) {
    toast.error(t('names.reorderInversionBlocked'));
    return;
  }
  const newOrder = [...sortedRows.value];
  [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
  emit('reorder', newOrder.map(r => r.id));
}
</script>

<style scoped>
.names-card {
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
  cursor: pointer;
}
.name-row:not(:last-child) {
  border-bottom: 1px solid var(--surface-border-subtle);
}
.name-row:hover {
  background: var(--surface-hover);
}
.name-content {
  flex: 1;
  min-width: 0;
}
.name-full {
  font-size: var(--font-base);
  color: var(--text-primary);
  display: block;
}
.name-surname {
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}
.name-meta-line {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: 2px;
}
.type-badge {
  color: var(--text-muted);
  font-size: var(--font-xs);
}
.date-cell {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.date-cell.is-empty .date-dash {
  color: var(--text-muted);
}
.date-source-hint {
  color: var(--accent);
  font-size: 8px;
  line-height: 1;
}
.name-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.btn-order {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 5px;
  font-size: var(--font-xs);
  color: var(--text-muted);
  line-height: 1.6;
}
.btn-order:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--surface-border);
}
.btn-order:disabled {
  opacity: 0.3;
  cursor: default;
}
.btn-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-delete:disabled:hover {
  background: transparent;
  color: inherit;
}
.name-prefix,
.name-suffix {
  color: var(--text-muted);
  font-style: italic;
}
.name-qual-badge {
  background: var(--surface-bg);
  color: var(--text-muted);
  padding: 1px 5px;
  border-radius: 8px;
  font-size: var(--font-xs);
  margin-left: 4px;
}
</style>
