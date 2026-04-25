<template>
  <div class="source-panel">
    <!-- Empty state -->
    <div v-if="!sourceId" class="panel-empty">
      {{ $t('sourcePanel.noSourceSelected') }}
    </div>

    <template v-else-if="source">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-content">
          <div class="panel-name-row">
            <div class="panel-name">{{ source.title || $t('common.unknown') }}</div>
            <span v-if="source.source_type" class="source-type-badge">{{ $t('sourceTypes.' + source.source_type) }}</span>
          </div>
        </div>
        <button class="panel-close-btn" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </div>

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
                :value="editFields.title"
                @input="editFields.title = ($event.target as HTMLInputElement).value"
                @blur="saveField('title')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.author') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="editFields.author"
                @input="editFields.author = ($event.target as HTMLInputElement).value"
                @blur="saveField('author')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.sourceType') }}</label>
              <select
                class="compact-control"
                :value="editFields.source_type"
                @change="editFields.source_type = ($event.target as HTMLSelectElement).value; saveField('source_type')"
              >
                <option value="">{{ $t('sourceDetail.noType') }}</option>
                <option v-for="st in SOURCE_TYPE_VALUES" :key="st" :value="st">
                  {{ $t('sourceTypes.' + st) }}
                </option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.publicationInfo') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="editFields.publication_info"
                @input="editFields.publication_info = ($event.target as HTMLInputElement).value"
                @blur="saveField('publication_info')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.repository') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="editFields.repository"
                @input="editFields.repository = ($event.target as HTMLInputElement).value"
                @blur="saveField('repository')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.url') }}</label>
              <input
                class="compact-control"
                type="url"
                :value="editFields.url"
                @input="editFields.url = ($event.target as HTMLInputElement).value"
                @blur="saveField('url')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.callNumber') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="editFields.call_number"
                @input="editFields.call_number = ($event.target as HTMLInputElement).value"
                @blur="saveField('call_number')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('sources.abstract') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="editFields.abstract"
                @input="editFields.abstract = ($event.target as HTMLTextAreaElement).value"
                @blur="saveField('abstract')"
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
          <SectionEmpty v-if="citations.length === 0" :message="$t('empty.citations')" />
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
                <td>
                  <a v-if="cit.entityRoute" class="entity-link" href="#" @click.stop.prevent="cit.entityRoute && router.push(cit.entityRoute)">
                    {{ cit.entityLabel }}
                  </a>
                  <span v-else-if="cit.entityLabel" class="muted">{{ cit.entityLabel }}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td>
                  <span :class="'confidence-badge confidence-' + cit.confidence">
                    {{ $t('confidenceLevels.' + cit.confidence) }}
                  </span>
                </td>
                <td class="actions-cell">
                  <AppButton variant="ghost" size="sm" :aria-label="$t('common.remove')" @click.stop="removeCitation(cit.id)">✕</AppButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Repositories section -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('sourcePanel.repositories')"
          :count="linkedRepositories.length"
          :collapsed="!sections.repositories"
          :action-label="'+ ' + $t('sourcePanel.addRepository')"
          @toggle="toggleSection('repositories')"
          @action="onAddRepositoryAction"
        />
        <div v-if="sections.repositories" class="panel-section-body">
          <div v-if="showRepoPicker" class="repo-picker-row">
            <select v-model="repoToAdd" class="compact-control">
              <option value="">{{ $t('sourcePanel.selectRepository') }}</option>
              <option v-for="r in unlinkedRepositories" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
            <AppButton variant="primary" size="sm" :disabled="!repoToAdd" @click="addRepository">{{ $t('common.add') }}</AppButton>
            <AppButton variant="ghost" size="sm" @click="showRepoPicker = false; repoToAdd = ''">{{ $t('common.cancel') }}</AppButton>
          </div>
          <SectionEmpty v-if="linkedRepositories.length === 0 && !showRepoPicker" :message="$t('sourcePanel.noRepositories')" />
          <table v-else-if="linkedRepositories.length > 0" class="data-table">
            <thead>
              <tr>
                <th>{{ $t('sourcePanel.repositoryName') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="repo in linkedRepositories" :key="repo.id">
                <td>{{ repo.name }}</td>
                <td class="actions-cell">
                  <AppButton variant="ghost" size="sm" :aria-label="$t('common.remove')" @click="removeRepository(repo.id)">✕</AppButton>
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
          <EntityMediaSection ref="mediaSectionRef" entity-type="source" :entity-id="sourceId" />
        </div>
      </div>

      <!-- Quality section -->
      <div class="panel-section">
        <SectionHeader :title="$t('quality.nav')" :collapsed="!sections.quality" @toggle="toggleSection('quality')" />
        <div v-if="sections.quality" class="panel-section-body">
          <SectionEmpty :message="$t('sourcePanel.noChecks')" />
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CitationModal from './modals/CitationModal.vue';
import EntityMediaSection from './EntityMediaSection.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import { SOURCE_TYPE_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { usePanelSections } from '../composables/usePanelSections';
import { resolvePersonDisplayName } from '../utils/nameUtils';

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

interface RepositoryRow {
  id: string;
  name: string;
}

const props = defineProps<{ sourceId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const toast = useToast();
const router = useRouter();

// ── Section state ───────────────────────────────────────────────────────────

const { sections, toggleSection } = usePanelSections(
  'source-panel-section-',
  { source: true, citations: true, repositories: false, media: false, quality: false },
  { source: true, citations: true, repositories: true, media: true, quality: false },
);

// ── Refs / state ────────────────────────────────────────────────────────────

const mediaSectionRef = ref<InstanceType<typeof EntityMediaSection> | null>(null);
const source = ref<SourceData | null>(null);
const citations = ref<CitationRow[]>([]);
const linkedRepositories = ref<RepositoryRow[]>([]);
const allRepositories = ref<RepositoryRow[]>([]);
const showCitationForm = ref(false);
const editingCitation = ref<CitationRow | null>(null);
const showRepoPicker = ref(false);
const repoToAdd = ref<string>('');

const editFields = reactive({
  title: '',
  author: '',
  source_type: '',
  publication_info: '',
  repository: '',
  url: '',
  call_number: '',
  abstract: '',
});

const unlinkedRepositories = computed(() => {
  const linkedIds = new Set(linkedRepositories.value.map(r => r.id));
  return allRepositories.value.filter(r => !linkedIds.has(r.id));
});

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
      return { label: t('nav.relationships'), route: `/relationships/${cit.relationship_id}` };
    }
    if (cit.place_id) {
      const place = await window.api.places.get(cit.place_id) as { name: string } | null;
      return place ? { label: place.name, route: `/places/${cit.place_id}` } : null;
    }
  } catch { /* ignore */ }
  return null;
}

// ── Loaders ─────────────────────────────────────────────────────────────────

async function load(id: string | null) {
  if (!id) {
    source.value = null;
    citations.value = [];
    linkedRepositories.value = [];
    allRepositories.value = [];
    return;
  }
  try {
    const s = await window.api.sources.get(id) as SourceData | null;
    if (props.sourceId !== id) return; // raced past us
    source.value = s;
    if (!s) return;

    editFields.title = s.title ?? '';
    editFields.author = s.author ?? '';
    editFields.source_type = s.source_type ?? '';
    editFields.publication_info = s.publication_info ?? '';
    editFields.repository = s.repository ?? '';
    editFields.url = s.url ?? '';
    editFields.call_number = s.call_number ?? '';
    editFields.abstract = s.abstract ?? '';

    const [rawCits, repos, allRepos] = await Promise.all([
      window.api.citations.forSource(id) as Promise<CitationRow[]>,
      window.api.repositories.forSource(id) as Promise<RepositoryRow[]>,
      window.api.repositories.list() as Promise<RepositoryRow[]>,
    ]);
    if (props.sourceId !== id) return;

    await Promise.all(rawCits.map(async (cit) => {
      const resolved = await resolveEntityLabel(cit);
      if (resolved) {
        cit.entityLabel = resolved.label;
        cit.entityRoute = resolved.route;
      }
    }));
    if (props.sourceId !== id) return;
    citations.value = rawCits;
    linkedRepositories.value = repos;
    allRepositories.value = allRepos;
  } catch (err) {
    console.error('[SourcePanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

watch(() => props.sourceId, load, { immediate: true });

// ── Field updates ───────────────────────────────────────────────────────────

async function saveField(field: keyof typeof editFields) {
  if (!props.sourceId || !source.value) return;
  const val = editFields[field];
  if (val === (source.value as Record<string, unknown>)[field]) return;
  try {
    await window.api.sources.update(props.sourceId, { [field]: val });
    (source.value as Record<string, unknown>)[field] = val;
  } catch (err) {
    console.error(`[SourcePanel] saveField(${field}) failed:`, err);
    toast.error(t('errors.saveFailed'));
  }
}

// ── Citations ───────────────────────────────────────────────────────────────

async function removeCitation(id: string) {
  if (!confirm(t('sourceDetail.confirmDeleteCitation'))) return;
  try {
    await window.api.citations.delete(id);
    await load(props.sourceId);
  } catch (err) {
    console.error('[SourcePanel] removeCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

function onCitationSaved() {
  showCitationForm.value = false;
  load(props.sourceId);
}

function onCitationEdited() {
  editingCitation.value = null;
  load(props.sourceId);
}

// ── Repositories ────────────────────────────────────────────────────────────

function onAddRepositoryAction() {
  if (!sections.repositories) toggleSection('repositories');
  showRepoPicker.value = true;
  repoToAdd.value = '';
}

async function addRepository() {
  if (!props.sourceId || !repoToAdd.value) return;
  try {
    await window.api.repositories.linkSource(props.sourceId, repoToAdd.value);
    showRepoPicker.value = false;
    repoToAdd.value = '';
    await load(props.sourceId);
  } catch (err) {
    console.error('[SourcePanel] addRepository failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeRepository(repoId: string) {
  if (!props.sourceId) return;
  try {
    await window.api.repositories.unlinkSource(props.sourceId, repoId);
    await load(props.sourceId);
  } catch (err) {
    console.error('[SourcePanel] removeRepository failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

</script>

<style scoped>
.source-panel {
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
.source-type-badge {
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

.entity-link {
  color: var(--accent);
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

.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
