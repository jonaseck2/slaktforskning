<template>
  <div class="task-panel">
    <!-- Empty state -->
    <div v-if="!taskId" class="panel-empty">
      {{ $t('taskPanel.noTaskSelected') }}
    </div>

    <template v-else-if="task">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ task.task || $t('common.unknown') }}</div>
            <span :class="['status-chip', 'status-' + task.status]">{{ $t('researchTasks.statuses.' + task.status) }}</span>
          </div>
        </div>
        <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </div>

      <!-- Task section -->
      <div class="panel-section">
        <SectionHeader :title="$t('researchTasks.task')" :collapsed="!sections.task" @toggle="toggleSection('task')" />
        <div v-if="sections.task" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('researchTasks.task') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="editFields.task"
                @input="editFields.task = ($event.target as HTMLInputElement).value"
                @blur="saveField('task')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('researchTasks.status') }}</label>
              <select
                class="compact-control"
                :value="editFields.status"
                @change="onStatusChange(($event.target as HTMLSelectElement).value)"
              >
                <option value="open">{{ $t('researchTasks.statuses.open') }}</option>
                <option value="in_progress">{{ $t('researchTasks.statuses.in_progress') }}</option>
                <option value="done">{{ $t('researchTasks.statuses.done') }}</option>
                <option value="stopped">{{ $t('researchTasks.statuses.stopped') }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('researchTasks.priority') }}</label>
              <select
                class="compact-control"
                :value="editFields.priority"
                @change="onPriorityChange(Number(($event.target as HTMLSelectElement).value))"
              >
                <option :value="0">0</option>
                <option :value="1">1</option>
                <option :value="2">2</option>
                <option :value="3">3</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('persons.title') }}</label>
              <PersonPicker
                :model-value="editFields.person_id"
                :placeholder="$t('researchTasks.selectPersonOptional')"
                @update:model-value="onPersonChange"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('researchTasks.notes') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="editFields.notes"
                @input="editFields.notes = ($event.target as HTMLTextAreaElement).value"
                @blur="saveField('notes')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('researchTasks.result') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="editFields.result"
                @input="editFields.result = ($event.target as HTMLTextAreaElement).value"
                @blur="saveField('result')"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from './PersonPicker.vue';
import SectionHeader from './ui/SectionHeader.vue';
import { useToast } from '../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface TaskData {
  id: string;
  task: string;
  notes: string | null;
  result: string | null;
  person_id: string | null;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
}

const props = defineProps<{ taskId: string | null }>();
const emit = defineEmits<{ close: []; updated: [] }>();

const { t } = useI18n();
const toast = useToast();

// ── Section state ───────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'task-panel-section-';
function loadBool(key: string, def: boolean): boolean {
  const v = localStorage.getItem(STORAGE_PREFIX + key);
  return v === null ? def : v === 'true';
}
const sections = reactive({
  task: loadBool('task', true),
});
function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
  localStorage.setItem(STORAGE_PREFIX + key, String(sections[key]));
}

// ── State ───────────────────────────────────────────────────────────────────

const task = ref<TaskData | null>(null);

const editFields = reactive({
  task: '',
  status: 'open' as 'open' | 'in_progress' | 'done' | 'stopped',
  priority: 1,
  person_id: null as string | null,
  notes: '',
  result: '',
});

// ── Loaders ─────────────────────────────────────────────────────────────────

async function load(id: string | null) {
  if (!id) {
    task.value = null;
    return;
  }
  try {
    const data = await window.api.researchTasks.get(id) as TaskData | null;
    if (props.taskId !== id) return; // raced past us
    task.value = data;
    if (!data) return;

    editFields.task = data.task ?? '';
    editFields.status = data.status ?? 'open';
    editFields.priority = data.priority ?? 1;
    editFields.person_id = data.person_id ?? null;
    editFields.notes = data.notes ?? '';
    editFields.result = data.result ?? '';
  } catch (err) {
    console.error('[ResearchTaskPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

watch(() => props.taskId, load, { immediate: true });

// ── Field updates ───────────────────────────────────────────────────────────

async function saveField(field: keyof typeof editFields) {
  if (!props.taskId || !task.value) return;
  const val = editFields[field];
  if (val === (task.value as Record<string, unknown>)[field]) return;
  try {
    await window.api.researchTasks.update(props.taskId, { [field]: val });
    (task.value as Record<string, unknown>)[field] = val;
    emit('updated');
  } catch (err) {
    console.error(`[ResearchTaskPanel] saveField(${field}) failed:`, err);
    toast.error(t('errors.saveFailed'));
  }
}

function onStatusChange(val: string) {
  editFields.status = val as 'open' | 'in_progress' | 'done' | 'stopped';
  saveField('status');
}
function onPriorityChange(val: number) {
  editFields.priority = val;
  saveField('priority');
}
function onPersonChange(val: string | null) {
  editFields.person_id = val;
  saveField('person_id');
}
</script>

<style scoped>
.task-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-sm);
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-xl);
  text-align: center;
}

/* Header */
.panel-header {
  display: flex;
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.panel-header-content {
  padding: var(--space-md) var(--space-lg);
  flex: 1;
  min-width: 0;
}
.panel-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
.panel-name {
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.status-chip {
  flex-shrink: 0;
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: var(--font-xs);
  font-weight: 600;
  white-space: nowrap;
}
.status-open { background: #dbeafe; color: #1d4ed8; }
.status-in_progress { background: #fef3c7; color: #92400e; }
.status-done { background: #d1fae5; color: #065f46; }
.status-stopped { background: #f3f4f6; color: #6b7280; }

.panel-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--font-lg);
  cursor: pointer;
  padding: 0 var(--space-md);
  align-self: stretch;
}
.panel-close-btn:hover { color: var(--text-primary); background: var(--surface-hover); }

/* Sections */
.panel-section {
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 var(--space-lg);
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }

/* Compact form */
.compact-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.compact-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compact-label {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: var(--font-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
