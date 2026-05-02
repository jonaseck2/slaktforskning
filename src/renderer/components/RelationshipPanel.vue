<template>
  <EntityPanel
    entity-type="relationship"
    :entity="relationship"
    :label="$t('panel.manageRelationship')"
    @close="emit('close')"
  >
    <template #empty>{{ $t('relationshipPanel.noRelationshipSelected') }}</template>
    <template #header>
      <div class="panel-name-row">
        <div class="panel-name">{{ relationship ? $t('relTypes.' + relationship.type) : '' }}</div>
        <span v-if="relationship?.subtype" class="rel-subtype-badge">{{ subtypeBadgeLabel }}</span>
      </div>
    </template>

    <template v-if="relationship">
      <!-- Relationship section -->
      <div class="panel-section">
        <SectionHeader :title="$t('relationshipDetail.title')" :collapsed="!sections.relationship" @toggle="toggleSection('relationship')" />
        <div v-if="sections.relationship" class="panel-section-body">
          <div v-if="!props.readonly" class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('common.type') }}</label>
              <select
                class="compact-control"
                :value="fields.type ?? ''"
                @change="onTypeChange(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="rt in RELATIONSHIP_TYPE_VALUES" :key="rt" :value="rt">
                  {{ $t('relTypes.' + rt) }}
                </option>
              </select>
            </div>
            <div v-if="fields.type === 'couple'" class="compact-field">
              <label class="compact-label">{{ $t('relationshipDetail.subtype') }}</label>
              <select
                class="compact-control"
                :value="fields.subtype ?? ''"
                @change="saveField('subtype', ($event.target as HTMLSelectElement).value || null)"
              >
                <option value="">—</option>
                <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
                  {{ $t('coupleSubtypes.' + st) }}
                </option>
              </select>
            </div>
            <div v-else-if="fields.type === 'parent_child'" class="compact-field">
              <label class="compact-label">{{ $t('relationshipDetail.subtype') }}</label>
              <select
                class="compact-control"
                :value="fields.subtype ?? ''"
                @change="saveField('subtype', ($event.target as HTMLSelectElement).value || null)"
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
                :model-value="fields.person1_id ?? null"
                :placeholder="$t('relationshipDetail.selectPerson')"
                @update:model-value="saveField('person1_id', $event)"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ person2Label }}</label>
              <PersonPicker
                :model-value="fields.person2_id ?? null"
                :placeholder="$t('relationshipDetail.selectPerson')"
                @update:model-value="saveField('person2_id', $event)"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('common.notes') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="fields.notes ?? ''"
                @input="(fields as RelData).notes = ($event.target as HTMLTextAreaElement).value"
                @blur="save('notes')"
              />
            </div>
          </div>
          <div v-else class="compact-form">
            <div class="compact-field">
              <span class="compact-label">{{ $t('common.type') }}</span>
              <span class="readonly-value">{{ $t('relTypes.' + relationship.type) }}</span>
            </div>
            <div v-if="relationship.subtype" class="compact-field">
              <span class="compact-label">{{ $t('relationshipDetail.subtype') }}</span>
              <span class="readonly-value">
                <template v-if="relationship.type === 'couple'">{{ $t('coupleSubtypes.' + relationship.subtype) }}</template>
                <template v-else-if="relationship.type === 'parent_child'">{{ $t('parentChildSubtypes.' + relationship.subtype) }}</template>
                <template v-else>{{ relationship.subtype }}</template>
              </span>
            </div>
            <div v-if="relationship.notes" class="compact-field">
              <span class="compact-label">{{ $t('common.notes') }}</span>
              <span class="readonly-value">{{ relationship.notes }}</span>
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
                  <AppButton variant="ghost" size="sm"
                             :aria-label="$t('common.delete')"
                             :title="$t('common.deleteTooltip')"
                             @click.stop="removeCitation(cit.id)">
                    <IconTrash :size="14" />
                  </AppButton>
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

    <ConfirmModal
      :visible="delCitation.visible.value"
      :title="$t('citations.removeConfirmTitle')"
      :message="$t('sourceDetail.confirmDeleteCitation')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="delCitation.cancel"
      @confirm="delCitation.confirm"
    />
  </EntityPanel>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from 'vue';
import type { ComponentPublicInstance, Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonPicker from './PersonPicker.vue';
import EventList from './EventList.vue';
import ConfirmModal from './ConfirmModal.vue';
import EntityPanel from './EntityPanel.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import CitationModal from './modals/CitationModal.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import { RELATIONSHIP_TYPE_VALUES, COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { usePanelSections } from '../composables/usePanelSections';
import { useEntityData } from '../composables/useEntityData';
import { useEditableFields } from '../composables/useEditableFields';

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

const { sections, toggleSection } = usePanelSections(
  'relationship-panel-section-',
  { relationship: true, events: true, citations: false, media: false },
  { relationship: true, events: true, citations: true, media: true },
);

// ── Refs / state ────────────────────────────────────────────────────────────

const eventListRef = ref<(ComponentPublicInstance & { openAddForm: () => void }) | null>(null);
const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const showCitationForm = ref(false);

// ── Data (race-safe load) ────────────────────────────────────────────────────

interface RelationshipPanelData {
  relationship: RelData | null;
  citations: CitationRow[];
}

const idRef = toRef(props, 'relationshipId');
const { data: panelData, reload } = useEntityData<RelationshipPanelData>(idRef, async (id) => {
  try {
    const r = await window.api.relationships.get(id) as RelData | null;
    if (!r) return { relationship: null, citations: [] };

    const rawCits = await window.api.citations.forRelationship(id) as Array<{
      id: string; source_id: string; page: string | null; confidence: number | null;
    }>;

    const enriched: CitationRow[] = [];
    for (const c of rawCits) {
      const source = await window.api.sources.get(c.source_id) as { title: string } | null;
      enriched.push({ ...c, source_title: source?.title ?? '' });
    }

    return { relationship: r, citations: enriched };
  } catch (err) {
    console.error('[RelationshipPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
    return { relationship: null, citations: [] };
  }
});

const relationship = computed(() => panelData.value?.relationship ?? null);
const citations = computed(() => panelData.value?.citations ?? []);

// ── Computed labels ─────────────────────────────────────────────────────────

const person1Label = computed(() => {
  const type = fields.type;
  if (type === 'parent_child') return t('relTypes.parent');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godparent');
  return t('relationships.person1');
});

const person2Label = computed(() => {
  const type = fields.type;
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

// ── Editable fields ──────────────────────────────────────────────────────────

const persistRelationship = async (id: string, patch: Partial<RelData>) => {
  try {
    await window.api.relationships.update(id, patch);
  } catch (err) {
    console.error('[RelationshipPanel] persist failed:', err);
    toast.error(t('errors.saveFailed'));
    throw err;
  }
};

const { fields, save } = useEditableFields<RelData & Record<string, unknown>>(
  idRef,
  relationship as unknown as Ref<(RelData & Record<string, unknown>) | null>,
  persistRelationship,
);

async function saveField<K extends keyof RelData>(field: K, value: RelData[K]) {
  if (!props.relationshipId || !relationship.value || props.readonly) return;
  (fields as RelData)[field] = value;
  await save(field);
}

async function onTypeChange(newType: string) {
  if (props.readonly) return;
  // Clear subtype when switching to a type that doesn't support it; do this
  // before the type save so the persisted state stays self-consistent.
  if (newType !== 'couple' && newType !== 'parent_child' && fields.subtype) {
    (fields as RelData).subtype = null;
    await save('subtype');
  }
  (fields as RelData).type = newType;
  await save('type');
}

// ── Citations ───────────────────────────────────────────────────────────────

const delCitation = useDeleteConfirm<string>(async (id) => {
  try {
    await window.api.citations.delete(id);
    await reload();
  } catch (err) {
    console.error('[RelationshipPanel] removeCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function removeCitation(id: string) { delCitation.ask(id); }

function onCitationSaved() {
  showCitationForm.value = false;
  reload();
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
.rel-subtype-badge {
  flex-shrink: 0;
  background: var(--surface-bg);
  color: var(--text-muted);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: var(--font-xs);
}

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
