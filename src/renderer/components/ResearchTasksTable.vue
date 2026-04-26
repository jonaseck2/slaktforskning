<template>
  <table class="data-table">
    <thead>
      <tr>
        <th class="th-shrink">{{ $t('researchTasks.priority') }}</th>
        <th class="th-shrink">{{ $t('researchTasks.status') }}</th>
        <th>{{ $t('researchTasks.task') }}</th>
        <th v-if="!props.readonly" class="actions-cell">{{ $t('common.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="task in tasks"
        :key="task.id"
        v-narrate="() => narrateTaskRow({
          priority: task.priority,
          status: task.status,
          task: task.task,
        }, t)"
        class="clickable-row"
        :class="{ 'selected-row': props.selectedId === task.id }"
        tabindex="0"
        role="button"
        :aria-label="$t('a11y.editItem', { item: task.task })"
        @click="$emit('select', task.id)"
        @keydown.enter="$emit('select', task.id)"
        @keydown.space.prevent="$emit('select', task.id)"
        @keydown.down.prevent="focusNextRow($event)"
        @keydown.up.prevent="focusPrevRow($event)"
      >
        <td><span :class="['priority-badge', 'priority-' + task.priority]">{{ task.priority }}</span></td>
        <td>
          <span
            :class="['status-chip', 'status-' + task.status, { 'status-readonly': props.readonly }]"
            @click.stop="!props.readonly && cycleStatus(task)"
            :title="$t('researchTasks.status')"
          >{{ $t('researchTasks.statuses.' + task.status) }}</span>
        </td>
        <td class="task-text">{{ task.task }}</td>
        <td v-if="!props.readonly" class="actions-cell">
          <button
            class="btn-sm btn-delete"
            :aria-label="$t('a11y.deleteItem', { item: task.task })"
            @click.stop="handleDelete(task.id)"
          >✕</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { narrateTaskRow } from '../utils/screenReaderNarration';

export interface ResearchTaskRow {
  id: string;
  task: string;
  notes?: string;
  result?: string;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
}

const props = withDefaults(defineProps<{
  tasks: ResearchTaskRow[];
  selectedId?: string | null;
  readonly?: boolean;
}>(), {
  selectedId: null,
  readonly: false,
});

const emit = defineEmits<{ updated: []; select: [id: string] }>();

const { t } = useI18n();

function focusNextRow(e: KeyboardEvent): void {
  let el = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  while (el && !el.matches('tr[tabindex]')) el = el.nextElementSibling as HTMLElement | null;
  if (el) el.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  let el = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  while (el && !el.matches('tr[tabindex]')) el = el.previousElementSibling as HTMLElement | null;
  if (el) el.focus();
}

const STATUS_CYCLE: Array<'open' | 'in_progress' | 'done' | 'stopped'> = ['open', 'in_progress', 'done', 'stopped'];

async function cycleStatus(task: ResearchTaskRow) {
  const idx = STATUS_CYCLE.indexOf(task.status);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  await window.api.researchTasks.update(task.id, { status: next });
  task.status = next;
  emit('updated');
}

async function handleDelete(id: string) {
  if (!confirm(t('researchTasks.confirmDelete'))) return;
  await window.api.researchTasks.delete(id);
  emit('updated');
}
</script>

<style scoped>
.th-shrink { width: 1%; white-space: nowrap; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
.priority-badge {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  text-align: center;
  line-height: 24px;
  font-size: var(--font-xs);
  font-weight: 700;
  color: white;
}
.priority-0 { background: #9ca3af; }
.priority-1 { background: #60a5fa; }
.priority-2 { background: #f59e0b; }
.priority-3 { background: #ef4444; }
.status-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: var(--font-xs);
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.status-chip:hover { opacity: 0.8; }
.status-readonly { cursor: default; pointer-events: none; }
.status-open { background: #dbeafe; color: #1d4ed8; }
.status-in_progress { background: #fef3c7; color: #92400e; }
.status-done { background: #d1fae5; color: #065f46; }
.status-stopped { background: #f3f4f6; color: #6b7280; }
.task-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 380px;
}
.selected-row { background: var(--surface-hover); }
</style>
