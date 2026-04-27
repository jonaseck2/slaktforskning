<template>
  <div class="task-panel side-panel">
    <!-- Empty state -->
    <div v-if="!taskId" class="panel-empty">
      {{ $t('taskPanel.noTaskSelected') }}
    </div>

    <template v-else-if="task">
      <!-- Collapse arrow on the panel's left edge. -->
      <button class="panel-collapse-btn" :aria-label="$t('common.close')" :title="$t('common.close')" @click="emit('close')">▶</button>
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ task.task || $t('common.unknown') }}</div>
            <span :class="['status-chip', 'status-' + task.status]">{{ $t('researchTasks.statuses.' + task.status) }}</span>
          </div>
        </div>
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

      <!-- Persons section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('persons.title')"
          :count="personLinks.length"
          :collapsed="!sections.persons"
          :action-label="!showPicker.person ? '+ ' + $t('common.add') : ''"
          @toggle="toggleSection('persons')"
          @action="openPicker('person')"
        />
        <div v-if="sections.persons" class="panel-section-body">
          <LinkedPersonsSection
            :links="personLinks"
            :show-picker="showPicker.person"
            @add="(id) => addLink('person', id)"
            @remove="removeLink"
            @cancel-picker="showPicker.person = false"
          />
        </div>
      </div>

      <!-- Places section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('places.title')"
          :count="placeLinks.length"
          :collapsed="!sections.places"
          :action-label="!showPicker.place ? '+ ' + $t('common.add') : ''"
          @toggle="toggleSection('places')"
          @action="openPicker('place')"
        />
        <div v-if="sections.places" class="panel-section-body">
          <LinkedPlacesSection
            :links="placeLinks"
            :show-picker="showPicker.place"
            @add="(id) => addLink('place', id)"
            @remove="removeLink"
            @cancel-picker="showPicker.place = false"
          />
        </div>
      </div>

      <!-- Media section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.title')"
          :count="mediaLinks.length"
          :collapsed="!sections.media"
          :action-label="!showPicker.media ? '+ ' + $t('common.add') : ''"
          @toggle="toggleSection('media')"
          @action="openPicker('media')"
        />
        <div v-if="sections.media" class="panel-section-body">
          <LinkedMediaSection
            :links="mediaLinks"
            :show-picker="showPicker.media"
            @add="(id) => addLink('media', id)"
            @remove="removeLink"
            @cancel-picker="showPicker.media = false"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import LinkedPersonsSection from './LinkedPersonsSection.vue';
import LinkedPlacesSection from './LinkedPlacesSection.vue';
import LinkedMediaSection from './LinkedMediaSection.vue';
import SectionHeader from './ui/SectionHeader.vue';
import { useToast } from '../composables/useToast';
import { usePanelSections } from '../composables/usePanelSections';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface TaskData {
  id: string;
  task: string;
  notes: string | null;
  result: string | null;
  priority: number;
  status: 'open' | 'in_progress' | 'done' | 'stopped';
}

interface Link {
  id: string;
  entity_type: 'person' | 'place' | 'media';
  entity_id: string;
}

const props = defineProps<{ taskId: string | null }>();
const emit = defineEmits<{ close: []; updated: [] }>();

const { t } = useI18n();
const toast = useToast();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'researchtask-panel-section-',
  { task: true, persons: true, places: true, media: true },
);

// ── State ───────────────────────────────────────────────────────────────────

const task = ref<TaskData | null>(null);
const links = ref<Link[]>([]);
const showPicker = reactive({ person: false, place: false, media: false });

const personLinks = computed(() => links.value.filter(l => l.entity_type === 'person'));
const placeLinks = computed(() => links.value.filter(l => l.entity_type === 'place'));
const mediaLinks = computed(() => links.value.filter(l => l.entity_type === 'media'));

const editFields = reactive({
  task: '',
  status: 'open' as 'open' | 'in_progress' | 'done' | 'stopped',
  priority: 1,
  notes: '',
  result: '',
});

// ── Loaders ─────────────────────────────────────────────────────────────────

async function load(id: string | null) {
  if (!id) {
    task.value = null;
    links.value = [];
    return;
  }
  try {
    const data = await window.api.researchTasks.get(id) as TaskData | null;
    if (props.taskId !== id) return;
    task.value = data;
    if (!data) return;

    editFields.task = data.task ?? '';
    editFields.status = data.status ?? 'open';
    editFields.priority = data.priority ?? 1;
    editFields.notes = data.notes ?? '';
    editFields.result = data.result ?? '';

    await loadLinks(id);
  } catch (err) {
    console.error('[ResearchTaskPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function loadLinks(id: string) {
  const raw = await window.api.researchTasks.getLinks(id) as Link[];
  if (props.taskId !== id) return;
  links.value = raw;
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

// ── Link actions ────────────────────────────────────────────────────────────

function openPicker(kind: 'person' | 'place' | 'media') {
  const sectionKey = (kind === 'person' ? 'persons' : kind === 'place' ? 'places' : 'media') as keyof typeof sections;
  if (!sections[sectionKey]) toggleSection(sectionKey);
  showPicker[kind] = true;
}

async function addLink(entityType: 'person' | 'place' | 'media', entityId: string) {
  if (!props.taskId) return;
  try {
    await window.api.researchTasks.addLink(props.taskId, entityType, entityId);
    showPicker[entityType] = false;
    await loadLinks(props.taskId);
    emit('updated');
  } catch (err) {
    console.error('[ResearchTaskPanel] addLink failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeLink(linkId: string) {
  if (!props.taskId) return;
  try {
    await window.api.researchTasks.removeLink(linkId);
    await loadLinks(props.taskId);
    emit('updated');
  } catch (err) {
    console.error('[ResearchTaskPanel] removeLink failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}
</script>

<style scoped>
/* Layout, surface, and `padding-left: 28px` for the collapse tab come
   from `.side-panel` in shared.css. */
.task-panel { overflow-y: auto; }

/* Collapse arrow on the panel's left edge. */
.panel-collapse-btn {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 6px 5px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-xs);
  z-index: 10;
}
.panel-collapse-btn:hover { color: var(--text-secondary); background: var(--surface-hover); }

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


.panel-section {
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 var(--space-lg);
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }

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
