<template>
  <EntityPanel
    entity-type="group"
    :entity="group"
    :label="$t('panel.manageGroup')"
    @close="emit('close')"
  >
    <template #empty>{{ $t('groupPanel.noGroupSelected') }}</template>
    <template #header>
      <div class="panel-name-row">
        <div class="panel-name">{{ group?.name || $t('common.unknown') }}</div>
        <span class="member-count-badge">{{ links.length }}</span>
      </div>
    </template>

    <template v-if="group">
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
                :value="fields.name ?? ''"
                @input="(fields as GroupData).name = ($event.target as HTMLInputElement).value"
                @blur="save('name')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('groups.notes') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="fields.notes ?? ''"
                @input="(fields as GroupData).notes = ($event.target as HTMLTextAreaElement).value"
                @blur="save('notes')"
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
  </EntityPanel>
</template>

<script setup lang="ts">
import { reactive, computed, toRef } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import LinkedPersonsSection from './LinkedPersonsSection.vue';
import LinkedPlacesSection from './LinkedPlacesSection.vue';
import LinkedMediaSection from './LinkedMediaSection.vue';
import SectionHeader from './ui/SectionHeader.vue';
import EntityPanel from './EntityPanel.vue';
import { useToast } from '../composables/useToast';
import { usePanelSections } from '../composables/usePanelSections';
import { useEntityData } from '../composables/useEntityData';
import { useEditableFields } from '../composables/useEditableFields';

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

const showPicker = reactive({ person: false, place: false, media: false });

// ── Data (race-safe load) ────────────────────────────────────────────────────

interface GroupPanelData {
  group: GroupData | null;
  links: Link[];
}

const idRef = toRef(props, 'groupId');
const { data: panelData, reload } = useEntityData<GroupPanelData>(idRef, async (id) => {
  try {
    const g = await window.api.groups.get(id) as GroupData | null;
    if (!g) return { group: null, links: [] };
    const raw = await window.api.groups.getLinks(id) as Link[];
    return { group: g, links: raw };
  } catch (err) {
    console.error('[GroupPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
    return { group: null, links: [] };
  }
});

const group = computed(() => panelData.value?.group ?? null);
const links = computed(() => panelData.value?.links ?? []);

const personLinks = computed(() => links.value.filter(l => l.entity_type === 'person'));
const placeLinks = computed(() => links.value.filter(l => l.entity_type === 'place'));
const mediaLinks = computed(() => links.value.filter(l => l.entity_type === 'media'));

// ── Editable fields ──────────────────────────────────────────────────────────

const persistGroup = async (id: string, patch: Partial<GroupData>) => {
  try {
    await window.api.groups.update(id, patch);
  } catch (err) {
    console.error('[GroupPanel] persist failed:', err);
    toast.error(t('errors.saveFailed'));
    throw err;
  }
};

const { fields, save } = useEditableFields<GroupData & Record<string, unknown>>(
  idRef,
  group as unknown as Ref<(GroupData & Record<string, unknown>) | null>,
  persistGroup,
);

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
    await reload();
  } catch (err) {
    console.error('[GroupPanel] addLink failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeLink(linkId: string) {
  if (!props.groupId) return;
  try {
    await window.api.groups.removeLink(linkId);
    await reload();
  } catch (err) {
    console.error('[GroupPanel] removeLink failed:', err);
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
.member-count-badge {
  flex-shrink: 0;
  background: var(--surface-bg);
  color: var(--text-muted);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: var(--font-xs);
}

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
