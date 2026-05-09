<template>
  <EntityPanel
    entity-type="source"
    :entity="source"
    :label="$t('panel.manageSource')"
    :created-at="source?.created_at ?? null"
    :updated-at="source?.updated_at ?? null"
    @close="emit('close')"
  >
    <template #empty>{{ $t('sourcePanel.noSourceSelected') }}</template>
    <template #header>
      <div class="panel-name-row">
        <div class="panel-name">{{ source?.title || $t('common.unknown') }}</div>
        <span v-if="source?.source_type" class="source-type-badge">{{ $t('sourceTypes.' + source.source_type) }}</span>
      </div>
    </template>

    <template v-if="source">
      <!-- Source section -->
      <div class="panel-section">
        <SectionHeader :title="$t('sourceDetail.title')" :collapsed="!sections.source" @toggle="toggleSection('source')" />
        <div v-if="sections.source" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.sourceTitle') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.title ?? ''"
                @input="(fields as SourceData).title = ($event.target as HTMLInputElement).value"
                @blur="save('title')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.author') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.author ?? ''"
                @input="(fields as SourceData).author = ($event.target as HTMLInputElement).value"
                @blur="save('author')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.sourceType') }}</label>
              <select
                class="compact-control"
                :value="fields.source_type ?? ''"
                @change="saveField('source_type', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ $t('sourceDetail.noType') }}</option>
                <option v-for="st in sortedSourceTypes" :key="st" :value="st">
                  {{ $t('sourceTypes.' + st) }}
                </option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.publicationInfo') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.publication_info ?? ''"
                @input="(fields as SourceData).publication_info = ($event.target as HTMLInputElement).value"
                @blur="save('publication_info')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.repository') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.repository ?? ''"
                @input="(fields as SourceData).repository = ($event.target as HTMLInputElement).value"
                @blur="save('repository')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.url') }}</label>
              <input
                class="compact-control"
                type="url"
                :value="fields.url ?? ''"
                @input="(fields as SourceData).url = ($event.target as HTMLInputElement).value"
                @blur="save('url')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.callNumber') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.call_number ?? ''"
                @input="(fields as SourceData).call_number = ($event.target as HTMLInputElement).value"
                @blur="save('call_number')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.abstract') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="fields.abstract ?? ''"
                @input="(fields as SourceData).abstract = ($event.target as HTMLTextAreaElement).value"
                @blur="save('abstract')"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Citations section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('sourceDetail.citations')"
          :count="citations.length"
          :collapsed="!sections.citations"
          :action-label="'+ ' + $t('sourceDetail.addCitation')"
          @toggle="toggleSection('citations')"
          @action="showCitationForm = true"
        />
        <div v-if="sections.citations" class="panel-section-body">
          <SectionEmpty
            v-if="citations.length === 0"
            purpose-key="onboarding.empty.sourceCitations.purpose"
            action-label-key="onboarding.empty.sourceCitations.cta"
            @action="showCitationForm = true"
          />
          <table v-else class="data-table">
            <thead>
              <tr>
                <th>{{ $t('sourceDetail.entity') }}</th>
                <th>{{ $t('sourceDetail.confidence') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cit in citations" :key="cit.id" class="clickable-row" @click="editingCitation = cit">
                <td class="entity-cell" :title="cit.entityLabel || ''">
                  <a v-if="cit.entityRoute" class="entity-link" href="#" @click.stop.prevent="cit.entityRoute && router.push(cit.entityRoute)">
                    {{ cit.entityLabel }}
                  </a>
                  <span v-else-if="cit.entityLabel" class="muted">{{ cit.entityLabel }}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td class="confidence-cell">
                  <span :class="'confidence-badge confidence-' + cit.confidence">
                    {{ $t('confidenceLevels.' + cit.confidence) }}
                  </span>
                </td>
                <td class="actions-cell">
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
          :action-label="'+ ' + $t('media.attachShort')"
          @toggle="toggleSection('media')"
          @action="mediaSectionRef?.attach()"
        />
        <div v-if="sections.media" class="panel-section-body">
          <EntityMediaSection ref="mediaSectionRef" entity-type="source" :entity-id="sourceId!" />
        </div>
      </div>

      <!-- Quality section -->
      <div class="panel-section">
        <SectionHeader :title="$t('quality.nav')" :collapsed="!sections.quality" @toggle="toggleSection('quality')" />
        <div v-if="sections.quality" class="panel-section-body">
          <SectionEmpty purpose-key="onboarding.empty.sourceQualityChecks.purpose" />
        </div>
      </div>

      <!-- Danger zone: delete source -->
      <div class="panel-danger-zone">
        <AppButton variant="secondary" size="sm" @click="showDeleteConfirm = true">
          <IconTrash class="trash-icon" />
          <span>{{ $t('sources.deleteSourceAction') }}</span>
        </AppButton>
      </div>
    </template>

    <!-- Add citation modal -->
    <CitationModal
      v-if="showCitationForm && source"
      mode="standalone"
      :source-id="source.id"
      :source-title="source.title"
      @close="showCitationForm = false"
      @cancel="showCitationForm = false"
      @saved="onCitationSaved"
    />

    <!-- Edit citation modal -->
    <CitationModal
      v-if="editingCitation"
      mode="standalone"
      :editing-citation="editingCitation"
      @close="editingCitation = null"
      @cancel="editingCitation = null"
      @saved="onCitationEdited"
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

    <!-- Delete source confirmation -->
    <ConfirmModal
      :visible="showDeleteConfirm"
      :title="$t('sources.deleteConfirmTitle')"
      :message="deleteConfirmMessage"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('sources.deleteConfirmContinue')"
      @cancel="showDeleteConfirm = false"
      @confirm="performDelete"
    />
  </EntityPanel>
</template>

<script setup lang="ts">
import { ref, reactive, computed, toRef } from 'vue';
import type { Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CitationModal from './modals/CitationModal.vue';
import ConfirmModal from './ConfirmModal.vue';
import EntityPanel from './EntityPanel.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import EntityMediaSection from './EntityMediaSection.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import { SOURCE_TYPE_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { usePanelSections } from '../composables/usePanelSections';
import { resolvePersonDisplayName } from '../utils/nameUtils';
import { useEntityData } from '../composables/useEntityData';
import { useEditableFields } from '../composables/useEditableFields';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface SourceData {
  id: string;
  title: string;
  author: string;
  publication_info: string;
  repository: string;
  url: string;
  source_type: string;
  call_number: string;
  abstract: string;
}

interface CitationRow {
  id: string;
  page: string;
  confidence: number;
  transcription: string;
  notes: string;
  date_accessed: string;
  event_id: string | null;
  person_id: string | null;
  relationship_id: string | null;
  place_id: string | null;
  entityLabel?: string;
  entityRoute?: string;
}

const props = defineProps<{ sourceId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();
const toast = useToast();
const router = useRouter();

// Locale-aware alphabetical sort of source types — Swedish needs å/ä/ö
// ordered correctly relative to z, which a binary string compare gets wrong.
const sortedSourceTypes = computed(() => {
  const collator = new Intl.Collator(locale.value);
  return [...SOURCE_TYPE_VALUES].sort((a, b) =>
    collator.compare(t(`sourceTypes.${a}`), t(`sourceTypes.${b}`)),
  );
});

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'source-panel-section-',
  { source: true, citations: true, media: false, quality: false },
  { source: true, citations: true, media: true, quality: false },
);

// ── Refs / state ────────────────────────────────────────────────────────────

const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const showCitationForm = ref(false);
const editingCitation = ref<CitationRow | null>(null);

// ── Data (race-safe load) ────────────────────────────────────────────────────

interface SourcePanelData {
  source: SourceData | null;
  citations: CitationRow[];
}

const idRef = toRef(props, 'sourceId');
const { data: panelData, reload } = useEntityData<SourcePanelData>(idRef, async (id) => {
  const s = await window.api.sources.get(id) as SourceData | null;
  if (!s) return { source: null, citations: [] };

  const rawCits = await window.api.citations.forSource(id) as CitationRow[];

  await Promise.all(rawCits.map(async (cit) => {
    const resolved = await resolveEntityLabel(cit);
    if (resolved) {
      cit.entityLabel = resolved.label;
      cit.entityRoute = resolved.route;
    }
  }));

  return { source: s, citations: rawCits };
});

const source = computed(() => panelData.value?.source ?? null);
const citations = computed(() => panelData.value?.citations ?? []);

// ── Editable fields ──────────────────────────────────────────────────────────

const persistSource = async (id: string, patch: Partial<SourceData>) => {
  try {
    await window.api.sources.update(id, patch);
  } catch (err) {
    console.error('[SourcePanel] persist failed:', err);
    toast.error(t('errors.saveFailed'));
    throw err;
  }
};

const { fields, save } = useEditableFields<SourceData & Record<string, unknown>>(
  idRef,
  source as unknown as Ref<(SourceData & Record<string, unknown>) | null>,
  persistSource,
);

async function saveField<K extends keyof SourceData>(field: K, value: SourceData[K]) {
  if (!props.sourceId || !source.value) return;
  (fields as SourceData)[field] = value;
  await save(field);
}

// ── Resolve citation entity labels ───────────────────────────────────────────

async function resolveEntityLabel(cit: CitationRow): Promise<{ label: string; route: string } | null> {
  try {
    if (cit.event_id) {
      const ev = await window.api.events.get(cit.event_id) as { event_type: string; date_value: string | null } | null;
      if (!ev) return null;
      const eventLabel = t('eventTypes.' + ev.event_type);
      const dateStr = ev.date_value ? ` (${ev.date_value})` : '';
      const participants = await window.api.eventParticipants.getForEvent(cit.event_id) as Array<{ person_id: string; role: string }>;
      const primary = participants.find(p => p.role === 'primary') ?? participants[0];
      if (primary) {
        const personName = await resolvePersonDisplayName(primary.person_id, '?');
        return { label: `${personName} – ${eventLabel}${dateStr}`, route: `/persons/${primary.person_id}` };
      }
      return { label: `${eventLabel}${dateStr}`, route: '' };
    }
    if (cit.person_id) {
      const personName = await resolvePersonDisplayName(cit.person_id, '?');
      return { label: personName, route: `/persons/${cit.person_id}` };
    }
    if (cit.relationship_id) {
      const rel = await window.api.relationships.get(cit.relationship_id) as { person1_id: string | null } | null;
      if (rel?.person1_id) {
        const personName = await resolvePersonDisplayName(rel.person1_id, '?');
        return { label: personName, route: `/persons/${rel.person1_id}` };
      }
      return null;
    }
    if (cit.place_id) {
      const place = await window.api.places.get(cit.place_id) as { name: string } | null;
      return place ? { label: place.name, route: `/places/${cit.place_id}` } : null;
    }
  } catch { /* ignore */ }
  return null;
}

// ── Citations ───────────────────────────────────────────────────────────────

const delCitation = useDeleteConfirm<string>(async (id) => {
  try {
    await window.api.citations.delete(id);
    await reload();
  } catch (err) {
    console.error('[SourcePanel] removeCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});
function removeCitation(id: string) { delCitation.ask(id); }

function onCitationSaved() {
  showCitationForm.value = false;
  reload();
}

function onCitationEdited() {
  editingCitation.value = null;
  reload();
}

// ── Delete source ──────────────────────────────────────────────────────────

const showDeleteConfirm = ref(false);
const deleteConfirmMessage = computed(() => {
  const title = source.value?.title ?? t('common.unknown');
  return t('sources.deleteConfirmMessage', {
    title,
    citations: panelData.value?.citations.length ?? 0,
  });
});

async function performDelete() {
  if (!props.sourceId) return;
  try {
    const title = source.value?.title ?? t('common.unknown');
    await window.api.sources.delete(props.sourceId);
    showDeleteConfirm.value = false;
    toast.success(t('sources.deletedToast', { title }));
    emit('close');
  } catch (err) {
    console.error('[SourcePanel] delete failed:', err);
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
.source-type-badge {
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

.entity-link {
  color: var(--color-link);
  text-decoration: none;
  cursor: pointer;
}
.entity-link:hover { text-decoration: underline; }

.muted { color: var(--text-muted); }

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

.repo-picker-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;
}
.repo-picker-row .compact-control {
  flex: 1;
}

.actions-cell { width: 1px; max-width: none; text-align: right; white-space: nowrap; }
.entity-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.confidence-cell { width: 1px; max-width: none; white-space: nowrap; }
</style>
