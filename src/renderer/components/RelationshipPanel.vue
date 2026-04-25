<template>
  <div class="relationship-panel">
    <!-- Empty state -->
    <div v-if="!relationshipId" class="panel-empty">
      {{ $t('relationshipPanel.noRelationshipSelected') }}
    </div>

    <template v-else-if="relationship">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ $t('relTypes.' + relationship.type) }}</div>
            <span v-if="relationship.subtype" class="rel-subtype-badge">{{ subtypeBadgeLabel }}</span>
          </div>
        </div>
        <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </div>

      <!-- Relationship section -->
      <div class="panel-section">
        <SectionHeader :title="$t('relationshipDetail.title')" :collapsed="!sections.relationship" @toggle="toggleSection('relationship')" />
        <div v-if="sections.relationship" class="panel-section-body">
          <div v-if="!props.readonly" class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('common.type') }}</label>
              <select
                class="compact-control"
                :value="editFields.type"
                @change="onTypeChange(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="rt in RELATIONSHIP_TYPE_VALUES" :key="rt" :value="rt">
                  {{ $t('relTypes.' + rt) }}
                </option>
              </select>
            </div>
            <div v-if="editFields.type === 'couple'" class="compact-field">
              <label class="compact-label">{{ $t('relationshipDetail.subtype') }}</label>
              <select
                class="compact-control"
                :value="editFields.subtype"
                @change="editFields.subtype = ($event.target as HTMLSelectElement).value; saveField('subtype')"
              >
                <option value="">—</option>
                <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
                  {{ $t('coupleSubtypes.' + st) }}
                </option>
              </select>
            </div>
            <div v-else-if="editFields.type === 'parent_child'" class="compact-field">
              <label class="compact-label">{{ $t('relationshipDetail.subtype') }}</label>
              <select
                class="compact-control"
                :value="editFields.subtype"
                @change="editFields.subtype = ($event.target as HTMLSelectElement).value; saveField('subtype')"
              >
                <option value="">—</option>
                <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">
                  {{ $t('parentChildSubtypes.' + st) }}
                </option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ person1Label }}</label>
              <PersonPicker
                :model-value="editFields.person1_id"
                :placeholder="$t('relationshipDetail.selectPerson')"
                @update:model-value="onPerson1Change"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ person2Label }}</label>
              <PersonPicker
                :model-value="editFields.person2_id"
                :placeholder="$t('relationshipDetail.selectPerson')"
                @update:model-value="onPerson2Change"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('common.notes') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="editFields.notes"
                @input="editFields.notes = ($event.target as HTMLTextAreaElement).value"
                @blur="saveField('notes')"
              />
            </div>
          </div>
          <div v-else class="compact-form">
            <div class="compact-field">
              <span class="compact-label">{{ $t('common.type') }}</span>
              <span class="readonly-value">{{ $t('relTypes.' + editFields.type) }}</span>
            </div>
            <div v-if="editFields.subtype" class="compact-field">
              <span class="compact-label">{{ $t('relationshipDetail.subtype') }}</span>
              <span class="readonly-value">
                <template v-if="editFields.type === 'couple'">{{ $t('coupleSubtypes.' + editFields.subtype) }}</template>
                <template v-else-if="editFields.type === 'parent_child'">{{ $t('parentChildSubtypes.' + editFields.subtype) }}</template>
                <template v-else>{{ editFields.subtype }}</template>
              </span>
            </div>
            <div v-if="editFields.notes" class="compact-field">
              <span class="compact-label">{{ $t('common.notes') }}</span>
              <span class="readonly-value">{{ editFields.notes }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Events section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('panel.events')"
          :collapsed="!sections.events"
          :action-label="!props.readonly ? '+ ' + $t('events.event') : undefined"
          @toggle="toggleSection('events')"
          @action="eventListRef?.openAddForm()"
        />
        <div v-if="sections.events" class="panel-section-body">
          <EventList ref="eventListRef" :relationship-id="relationship.id" :readonly="props.readonly" hide-header />
        </div>
      </div>

      <!-- Citations section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('sourceDetail.citations')"
          :count="citations.length"
          :collapsed="!sections.citations"
          :action-label="!props.readonly ? '+ ' + $t('sourceDetail.addCitation') : undefined"
          @toggle="toggleSection('citations')"
          @action="showCitationForm = true"
        />
        <div v-if="sections.citations" class="panel-section-body">
          <SectionEmpty v-if="citations.length === 0" :message="$t('empty.citations')" />
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
              <tr v-for="cit in citations" :key="cit.id" class="clickable-row" @click="router.push('/sources/' + cit.source_id)">
                <td>
                  <router-link :to="'/sources/' + cit.source_id" class="person-link" @click.stop>
                    {{ cit.source_title || '—' }}
                  </router-link>
                </td>
                <td>{{ cit.page || '—' }}</td>
                <td>
                  <span v-if="cit.confidence != null" :class="'confidence-badge confidence-' + cit.confidence">
                    {{ $t('confidenceLevels.' + cit.confidence) }}
                  </span>
                </td>
                <td v-if="!props.readonly" class="actions-cell">
                  <AppButton variant="ghost" size="sm" @click.stop="removeCitation(cit.id)">✕</AppButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Media section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.title')"
          :collapsed="!sections.media"
          :action-label="!props.readonly ? '+ ' + $t('media.attachShort') : undefined"
          @toggle="toggleSection('media')"
          @action="mediaSectionRef?.attach()"
        />
        <div v-if="sections.media" class="panel-section-body">
          <EntityMediaSection ref="mediaSectionRef" entity-type="relationship" :entity-id="relationship.id" />
        </div>
      </div>
    </template>

    <!-- Add citation modal -->
    <CitationModal
      v-if="!props.readonly && showCitationForm && relationshipId"
      mode="standalone"
      :relationship-id="relationshipId"
      @close="showCitationForm = false"
      @cancel="showCitationForm = false"
      @saved="onCitationSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { ComponentPublicInstance } from 'vue';
import PersonPicker from './PersonPicker.vue';
import EventList from './EventList.vue';
import CitationModal from './modals/CitationModal.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import { RELATIONSHIP_TYPE_VALUES, COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RelData {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string;
}

interface CitationRow {
  id: string;
  source_id: string;
  source_title: string;
  page: string | null;
  confidence: number | null;
}

const props = defineProps<{ relationshipId: string | null; readonly?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const toast = useToast();
const router = useRouter();

// ── Section state ───────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'rel-panel-section-';
function loadBool(key: string, def: boolean): boolean {
  const v = localStorage.getItem(STORAGE_PREFIX + key);
  return v === null ? def : v === 'true';
}
const sections = reactive({
  relationship: loadBool('relationship', true),
  events: loadBool('events', true),
  citations: loadBool('citations', false),
  media: loadBool('media', false),
});
function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
  localStorage.setItem(STORAGE_PREFIX + key, String(sections[key]));
}

// ── Refs / state ────────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const relationship = ref<RelData | null>(null);
const citations = ref<CitationRow[]>([]);
const showCitationForm = ref(false);

const editFields = reactive({
  type: '',
  subtype: '',
  person1_id: null as string | null,
  person2_id: null as string | null,
  notes: '',
});

// ── Computed labels ─────────────────────────────────────────────────────────

const person1Label = computed(() => {
  const type = editFields.type;
  if (type === 'parent_child') return t('relTypes.parent');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godparent');
  return t('relationships.person1');
});

const person2Label = computed(() => {
  const type = editFields.type;
  if (type === 'parent_child') return t('relTypes.child');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godchild');
  return t('relationships.person2');
});

const subtypeBadgeLabel = computed(() => {
  if (!relationship.value?.subtype) return '';
  if (relationship.value.type === 'couple') return t('coupleSubtypes.' + relationship.value.subtype);
  if (relationship.value.type === 'parent_child') return t('parentChildSubtypes.' + relationship.value.subtype);
  return relationship.value.subtype;
});

// ── Loaders ─────────────────────────────────────────────────────────────────

async function load(id: string | null) {
  if (!id) {
    relationship.value = null;
    citations.value = [];
    return;
  }
  try {
    const r = await window.api.relationships.get(id) as RelData | null;
    if (props.relationshipId !== id) return; // raced past us
    relationship.value = r;
    if (!r) return;

    editFields.type = r.type ?? '';
    editFields.subtype = r.subtype ?? '';
    editFields.person1_id = r.person1_id;
    editFields.person2_id = r.person2_id;
    editFields.notes = r.notes ?? '';

    const rawCits = await window.api.citations.forRelationship(id) as Array<{
      id: string; source_id: string; page: string | null; confidence: number | null;
    }>;
    if (props.relationshipId !== id) return;

    const enriched: CitationRow[] = [];
    for (const c of rawCits) {
      const source = await window.api.sources.get(c.source_id) as { title: string } | null;
      enriched.push({ ...c, source_title: source?.title ?? '' });
    }
    if (props.relationshipId !== id) return;
    citations.value = enriched;
  } catch (err) {
    console.error('[RelationshipPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

watch(() => props.relationshipId, load, { immediate: true });

// ── Field updates ───────────────────────────────────────────────────────────

async function saveField(field: keyof typeof editFields) {
  if (!props.relationshipId || !relationship.value || props.readonly) return;
  const val = editFields[field];
  if (val === (relationship.value as Record<string, unknown>)[field]) return;
  try {
    await window.api.relationships.update(props.relationshipId, { [field]: val });
    (relationship.value as Record<string, unknown>)[field] = val;
  } catch (err) {
    console.error(`[RelationshipPanel] saveField(${field}) failed:`, err);
    toast.error(t('errors.saveFailed'));
  }
}

function onTypeChange(newType: string) {
  editFields.type = newType;
  // Clear subtype when switching to a type that doesn't support it
  if (newType !== 'couple' && newType !== 'parent_child') {
    editFields.subtype = '';
    saveField('subtype');
  }
  saveField('type');
}

function onPerson1Change(val: string | null) {
  editFields.person1_id = val;
  saveField('person1_id');
}

function onPerson2Change(val: string | null) {
  editFields.person2_id = val;
  saveField('person2_id');
}

// ── Citations ───────────────────────────────────────────────────────────────

async function removeCitation(id: string) {
  if (!confirm(t('sourceDetail.confirmDeleteCitation'))) return;
  try {
    await window.api.citations.delete(id);
    await load(props.relationshipId);
  } catch (err) {
    console.error('[RelationshipPanel] removeCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

function onCitationSaved() {
  showCitationForm.value = false;
  load(props.relationshipId);
}
</script>

<style scoped>
.relationship-panel {
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
.rel-subtype-badge {
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

.readonly-value {
  font-size: var(--font-xs);
  color: var(--text-primary);
  padding: var(--space-xs) 0;
}

.confidence-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  white-space: nowrap;
}
.confidence-0 { background: var(--error-bg); color: var(--error-text); }
.confidence-1 { background: var(--warning-bg); color: var(--warning-text); }
.confidence-2 { background: var(--info-bg); color: var(--info-text); }
.confidence-3 { background: var(--success-bg); color: var(--success-text); }

.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
