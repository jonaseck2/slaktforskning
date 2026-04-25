<template>
  <table class="data-table">
    <thead>
      <tr>
        <th class="th-shrink">{{ $t('researchTasks.priority') }}</th>
        <th class="th-shrink">{{ $t('researchTasks.status') }}</th>
        <th v-if="showPerson" class="th-person">{{ $t('persons.title') }}</th>
        <th>{{ $t('researchTasks.task') }}</th>
        <th class="actions-cell">{{ $t('common.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <template v-for="task in tasks" :key="task.id">
        <tr
          v-narrate="() => narrateTaskRow({
            priority: task.priority,
            status: task.status,
            task: task.task,
          }, t)"
          class="clickable-row"
          tabindex="0"
          role="button"
          :aria-expanded="expandedId === task.id"
          :aria-label="$t('a11y.expandRow', { item: task.task })"
          @click="toggleExpand(task)"
          @keydown.enter="toggleExpand(task)"
          @keydown.space.prevent="toggleExpand(task)"
          @keydown.down.prevent="focusNextRow($event)"
          @keydown.up.prevent="focusPrevRow($event)"
        >
          <td><span :class="['priority-badge', 'priority-' + task.priority]">{{ task.priority }}</span></td>
          <td>
            <span
              :class="['status-chip', 'status-' + task.status]"
              @click.stop="cycleStatus(task)"
              :title="$t('researchTasks.status')"
            >{{ $t('researchTasks.statuses.' + task.status) }}</span>
          </td>
          <td v-if="showPerson" class="person-cell">
            <router-link
              v-if="task.person_id && (task.person_given_name || task.person_surname)"
              :to="'/visualisering/' + task.person_id"
              class="person-link"
              @click.stop
            ><PersonName :given-name="task.person_given_name ?? null" :surname="task.person_surname ?? null" :preferred-name="task.person_preferred_name ?? null" :nickname="task.person_nickname ?? null" /></router-link>
            <span v-else>—</span>
          </td>
          <td class="task-text">{{ task.task }}</td>
          <td class="actions-cell">
            <button class="btn-sm btn-delete" @click.stop="handleDelete(task.id)">✕</button>
          </td>
        </tr>
        <!-- Expanded inline edit row -->
        <tr v-if="expandedId === task.id" class="expanded-row">
          <td :colspan="showPerson ? 5 : 4">
            <div class="expanded-content">
              <label>
                {{ $t('researchTasks.task') }} *
                <input v-model="editForm.task" type="text" required />
              </label>
              <label v-if="showPerson">
                {{ $t('persons.title') }}
                <div class="person-edit-row">
                  <PersonPicker v-model="editForm.person_id" :placeholder="$t('researchTasks.selectPersonOptional')" />
                  <router-link v-if="editForm.person_id" :to="'/visualisering/' + editForm.person_id" class="person-link person-link-btn" @click.stop>{{ $t('common.view') }} →</router-link>
                </div>
              </label>
              <label>
                {{ $t('researchTasks.notes') }}
                <textarea
                  ref="notesRef"
                  v-model="editForm.notes"
                  rows="2"
                  :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
                  @mouseup="persistNotesHeight"
                />
              </label>
              <label>
                {{ $t('researchTasks.result') }}
                <textarea
                  ref="resultRef"
                  v-model="editForm.result"
                  rows="2"
                  :style="resultStoredHeight ? { height: resultStoredHeight + 'px' } : undefined"
                  @mouseup="persistResultHeight"
                />
              </label>
              <div class="expanded-row-inline">
                <label>
                  {{ $t('researchTasks.status') }}
                  <select v-model="editForm.status">
                    <option value="open">{{ $t('researchTasks.statuses.open') }}</option>
                    <option value="in_progress">{{ $t('researchTasks.statuses.in_progress') }}</option>
                    <option value="done">{{ $t('researchTasks.statuses.done') }}</option>
                    <option value="stopped">{{ $t('researchTasks.statuses.stopped') }}</option>
                  </select>
                </label>
                <label>
                  {{ $t('researchTasks.priority') }}
                  <select v-model="editForm.priority">
                    <option :value="0">0</option>
                    <option :value="1">1</option>
                    <option :value="2">2</option>
                    <option :value="3">3</option>
                  </select>
                </label>
              </div>
              <div class="expanded-actions">
                <button class="btn-cancel" @click="expandedId = null">{{ $t('common.cancel') }}</button>
                <button class="btn-add" @click="saveEdit(task.id)">{{ $t('common.save') }}</button>
              </div>
            </div>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonName from './PersonName.vue';
import PersonPicker from './PersonPicker.vue';
import { narrateTaskRow } from '../utils/screenReaderNarration';
import { useTextareaHeight } from '../composables/useTextareaHeight';

const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('research-task-edit-notes');
const { textareaRef: resultRef, storedHeight: resultStoredHeight, persistHeight: persistResultHeight } = useTextareaHeight('research-task-edit-result');

export interface ResearchTaskRow {
  id: string;
  task: string;
  notes?: string;
  result?: string;
  person_id?: string;
  person_given_name?: string | null;
  person_surname?: string | null;
  person_preferred_name?: string | null;
  person_nickname?: string | null;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
}

withDefaults(defineProps<{
  tasks: ResearchTaskRow[];
  showPerson?: boolean;
}>(), {
  showPerson: false,
});

const emit = defineEmits<{ updated: [] }>();

const { t } = useI18n();

function focusNextRow(e: KeyboardEvent): void {
  // Skip expanded rows — find next sibling that is a main clickable row
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

const expandedId = ref<string | null>(null);
const editForm = reactive({
  task: '',
  notes: '',
  result: '',
  status: 'open' as 'open' | 'in_progress' | 'done' | 'stopped',
  priority: 1,
  person_id: null as string | null,
});

function toggleExpand(task: ResearchTaskRow) {
  if (expandedId.value === task.id) { expandedId.value = null; return; }
  editForm.task = task.task;
  editForm.notes = task.notes ?? '';
  editForm.result = task.result ?? '';
  editForm.status = task.status;
  editForm.priority = task.priority;
  editForm.person_id = task.person_id ?? null;
  expandedId.value = task.id;
}

async function cycleStatus(task: ResearchTaskRow) {
  const idx = STATUS_CYCLE.indexOf(task.status);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  await window.api.researchTasks.update(task.id, { status: next });
  task.status = next;
}

async function saveEdit(id: string) {
  await window.api.researchTasks.update(id, {
    task: editForm.task,
    notes: editForm.notes,
    result: editForm.result,
    status: editForm.status,
    priority: editForm.priority,
    person_id: editForm.person_id || undefined,
  });
  expandedId.value = null;
  emit('updated');
}

async function handleDelete(id: string) {
  if (!confirm('Ta bort denna uppgift?')) return;
  await window.api.researchTasks.delete(id);
  emit('updated');
}
</script>

<style scoped>
.th-shrink { width: 1%; white-space: nowrap; }
.th-person { width: 180px; white-space: nowrap; }
.person-cell { white-space: nowrap; }
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
.person-edit-row { display: flex; align-items: center; gap: 8px; }
.person-edit-row > :first-child { flex: 1; }
.person-link-btn { white-space: nowrap; font-size: var(--font-sm); }
.expanded-row td { background: var(--color-bg-subtle); padding: 0; }
.expanded-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.expanded-content label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  color: #374151;
}
.expanded-content input,
.expanded-content textarea,
.expanded-content select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: var(--font-base);
  font-family: inherit;
}
.expanded-row-inline { display: flex; gap: 16px; }
.expanded-row-inline label { flex: 1; }
.expanded-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
