<template>
  <EntityPanel
    entity-type="task"
    :entity="task"
    :label="$t('panel.manageTask')"
    @close="emit('close')"
  >
    <template #empty>{{ $t('taskPanel.noTaskSelected') }}</template>
    <template #header>
      <div class="panel-name-row">
        <div class="panel-name">{{ task?.task || $t('common.unknown') }}</div>
        <span v-if="task" :class="['status-chip', 'status-' + task.status]">{{ $t('researchTasks.statuses.' + task.status) }}</span>
      </div>
    </template>

    <template v-if="task">
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
                :value="fields.task ?? ''"
                @input="(fields as TaskData).task = ($event.target as HTMLInputElement).value"
                @blur="save('task')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('researchTasks.status') }}</label>
              <select
                class="compact-control"
                :value="fields.status ?? 'open'"
                @change="saveField('status', ($event.target as HTMLSelectElement).value as TaskData['status'])"
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
                :value="fields.priority ?? 1"
                @change="saveField('priority', Number(($event.target as HTMLSelectElement).value))"
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
                :value="fields.notes ?? ''"
                @input="(fields as TaskData).notes = ($event.target as HTMLTextAreaElement).value"
                @blur="save('notes')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('researchTasks.result') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="fields.result ?? ''"
                @input="(fields as TaskData).result = ($event.target as HTMLTextAreaElement).value"
                @blur="save('result')"
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

      <!-- Danger zone: delete task -->
      <div class="panel-danger-zone">
        <AppButton variant="secondary" size="sm" @click="showDeleteConfirm = true">
          <IconTrash class="trash-icon" />
          <span>{{ $t('researchTasks.deleteTaskAction') }}</span>
        </AppButton>
      </div>
    </template>

    <ConfirmModal
      :visible="delLink.visible.value"
      :title="$t('researchTasks.unlinkConfirmTitle')"
      :message="$t('researchTasks.confirmUnlink')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.remove')"
      @cancel="delLink.cancel"
      @confirm="delLink.confirm"
    />

    <!-- Delete task confirmation -->
    <ConfirmModal
      :visible="showDeleteConfirm"
      :title="$t('researchTasks.deleteConfirmTitle')"
      :message="deleteConfirmMessage"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('researchTasks.deleteConfirmContinue')"
      @cancel="showDeleteConfirm = false"
      @confirm="performDelete"
    />
  </EntityPanel>
</template>

<script setup lang="ts">
import { ref, reactive, computed, toRef } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import LinkedPersonsSection from './LinkedPersonsSection.vue';
import LinkedPlacesSection from './LinkedPlacesSection.vue';
import LinkedMediaSection from './LinkedMediaSection.vue';
import SectionHeader from './ui/SectionHeader.vue';
import EntityPanel from './EntityPanel.vue';
import ConfirmModal from './ConfirmModal.vue';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import { useToast } from '../composables/useToast';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { usePanelSections } from '../composables/usePanelSections';
import { useEntityData } from '../composables/useEntityData';
import { useEditableFields } from '../composables/useEditableFields';

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

const showPicker = reactive({ person: false, place: false, media: false });

// ── Data (race-safe load) ────────────────────────────────────────────────────

interface TaskPanelData {
  task: TaskData | null;
  links: Link[];
}

const idRef = toRef(props, 'taskId');
const { data: panelData, reload } = useEntityData<TaskPanelData>(idRef, async (id) => {
  try {
    const data = await window.api.researchTasks.get(id) as TaskData | null;
    if (!data) return { task: null, links: [] };
    const raw = await window.api.researchTasks.getLinks(id) as Link[];
    return { task: data, links: raw };
  } catch (err) {
    console.error('[ResearchTaskPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
    return { task: null, links: [] };
  }
});

const task = computed(() => panelData.value?.task ?? null);
const links = computed(() => panelData.value?.links ?? []);

const personLinks = computed(() => links.value.filter(l => l.entity_type === 'person'));
const placeLinks = computed(() => links.value.filter(l => l.entity_type === 'place'));
const mediaLinks = computed(() => links.value.filter(l => l.entity_type === 'media'));

// ── Editable fields ──────────────────────────────────────────────────────────

const persistTask = async (id: string, patch: Partial<TaskData>) => {
  try {
    await window.api.researchTasks.update(id, patch);
    emit('updated');
  } catch (err) {
    console.error('[ResearchTaskPanel] persist failed:', err);
    toast.error(t('errors.saveFailed'));
    throw err;
  }
};

const { fields, save } = useEditableFields<TaskData & Record<string, unknown>>(
  idRef,
  task as unknown as Ref<(TaskData & Record<string, unknown>) | null>,
  persistTask,
);

async function saveField<K extends keyof TaskData>(field: K, value: TaskData[K]) {
  if (!props.taskId || !task.value) return;
  (fields as TaskData)[field] = value;
  await save(field);
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
    await reload();
    emit('updated');
  } catch (err) {
    console.error('[ResearchTaskPanel] addLink failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

const delLink = useDeleteConfirm<string>(async (linkId) => {
  if (!props.taskId) return;
  try {
    await window.api.researchTasks.removeLink(linkId);
    await reload();
    emit('updated');
  } catch (err) {
    console.error('[ResearchTaskPanel] removeLink failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function removeLink(linkId: string) { delLink.ask(linkId); }

// ── Delete task ────────────────────────────────────────────────────────────

const showDeleteConfirm = ref(false);
const deleteConfirmMessage = computed(() => {
  const title = task.value?.task ?? t('common.unknown');
  return t('researchTasks.deleteConfirmMessage', {
    title,
    links: personLinks.value.length + placeLinks.value.length + mediaLinks.value.length,
  });
});

async function performDelete() {
  if (!props.taskId) return;
  try {
    const title = task.value?.task ?? t('common.unknown');
    await window.api.researchTasks.delete(props.taskId);
    showDeleteConfirm.value = false;
    toast.success(t('researchTasks.deletedToast', { title }));
    emit('close');
  } catch (err) {
    console.error('[ResearchTaskPanel] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}
</script>

<style scoped>
/* Header slot content */
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
