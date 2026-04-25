<template>
  <div class="group-panel">
    <!-- Empty state -->
    <div v-if="!groupId" class="panel-empty">
      {{ $t('groupPanel.noGroupSelected') }}
    </div>

    <template v-else-if="group">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ group.name || $t('common.unknown') }}</div>
            <span class="member-count-badge">{{ links.length }}</span>
          </div>
        </div>
        <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </div>

      <!-- Group info section -->
      <div class="panel-section">
        <SectionHeader :title="$t('groups.title')" :collapsed="!sections.info" @toggle="toggleSection('info')" />
        <div v-if="sections.info" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('groups.name') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="editFields.name"
                @input="editFields.name = ($event.target as HTMLInputElement).value"
                @blur="saveField('name')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('groups.notes') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="editFields.notes"
                @input="editFields.notes = ($event.target as HTMLTextAreaElement).value"
                @blur="saveField('notes')"
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

interface GroupData {
  id: string;
  name: string;
  notes: string;
}

interface Link {
  id: string;
  entity_type: 'person' | 'place' | 'media';
  entity_id: string;
}

const props = defineProps<{ groupId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const toast = useToast();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'group-panel-section-',
  { info: true, persons: true, places: true, media: true },
);

// ── State ───────────────────────────────────────────────────────────────────

const group = ref<GroupData | null>(null);
const links = ref<Link[]>([]);
const showPicker = reactive({ person: false, place: false, media: false });

const personLinks = computed(() => links.value.filter(l => l.entity_type === 'person'));
const placeLinks = computed(() => links.value.filter(l => l.entity_type === 'place'));
const mediaLinks = computed(() => links.value.filter(l => l.entity_type === 'media'));

const editFields = reactive({ name: '', notes: '' });

// ── Loaders ─────────────────────────────────────────────────────────────────

async function load(id: string | null) {
  if (!id) {
    group.value = null;
    links.value = [];
    return;
  }
  try {
    const g = await window.api.groups.get(id) as GroupData | null;
    if (props.groupId !== id) return;
    group.value = g;
    if (!g) return;
    editFields.name = g.name ?? '';
    editFields.notes = g.notes ?? '';
    await loadLinks(id);
  } catch (err) {
    console.error('[GroupPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function loadLinks(id: string) {
  const raw = await window.api.groups.getLinks(id) as Link[];
  if (props.groupId !== id) return;
  links.value = raw;
}

watch(() => props.groupId, load, { immediate: true });

// ── Field updates ───────────────────────────────────────────────────────────

async function saveField(field: keyof typeof editFields) {
  if (!props.groupId || !group.value) return;
  const val = editFields[field];
  if (val === (group.value as Record<string, unknown>)[field]) return;
  try {
    await window.api.groups.update(props.groupId, { [field]: val });
    (group.value as Record<string, unknown>)[field] = val;
  } catch (err) {
    console.error(`[GroupPanel] saveField(${field}) failed:`, err);
    toast.error(t('errors.saveFailed'));
  }
}

// ── Link actions ────────────────────────────────────────────────────────────

function openPicker(kind: 'person' | 'place' | 'media') {
  const sectionKey = (kind === 'person' ? 'persons' : kind === 'place' ? 'places' : 'media') as keyof typeof sections;
  if (!sections[sectionKey]) toggleSection(sectionKey);
  showPicker[kind] = true;
}

async function addLink(entityType: 'person' | 'place' | 'media', entityId: string) {
  if (!props.groupId) return;
  try {
    await window.api.groups.addLink(props.groupId, entityType, entityId);
    showPicker[entityType] = false;
    await loadLinks(props.groupId);
  } catch (err) {
    console.error('[GroupPanel] addLink failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeLink(linkId: string) {
  if (!props.groupId) return;
  try {
    await window.api.groups.removeLink(linkId);
    await loadLinks(props.groupId);
  } catch (err) {
    console.error('[GroupPanel] removeLink failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}
</script>

<style scoped>
.group-panel {
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
.member-count-badge {
  flex-shrink: 0;
  background: var(--surface-bg);
  color: var(--text-muted);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: var(--font-xs);
}
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
