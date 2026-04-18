<template>
  <div v-if="source" class="source-detail">
    <div class="detail-header">
      <div class="header-row">
        <h2><LinkedText :text="source.title" /></h2>
        <AppBadge v-if="source.source_type" variant="event">{{ $t('sourceTypes.' + source.source_type) }}</AppBadge>
      </div>
    </div>

    <!-- Source Fields -->
    <section class="detail-section" aria-labelledby="section-source-details">
      <SectionHeader
        :title="$t('sourceDetail.title')"
        :collapsible="false"
        tabindex="0"
        :data-narrate="$t('screenReader.navSourceDetail', { title: source.title || $t('common.unknown') })"
      />
      <div class="field-grid">
        <label>
          {{ $t('sources.sourceTitle') }}
          <input v-model="editFields.title" type="text" @blur="saveField('title')" />
        </label>
        <label>
          {{ $t('sources.author') }}
          <input v-model="editFields.author" type="text" @blur="saveField('author')" />
        </label>
        <label>
          {{ $t('sources.sourceType') }}
          <select v-model="editFields.source_type" @change="saveField('source_type')">
            <option value="">{{ $t('sourceDetail.noType') }}</option>
            <option v-for="st in SOURCE_TYPE_VALUES" :key="st" :value="st">
              {{ $t('sourceTypes.' + st) }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('sources.publicationInfo') }}
          <input v-model="editFields.publication_info" type="text" @blur="saveField('publication_info')" />
        </label>
        <label>
          {{ $t('sources.repository') }}
          <input v-model="editFields.repository" type="text" @blur="saveField('repository')" />
        </label>
        <label>
          {{ $t('sources.url') }}
          <input v-model="editFields.url" type="url" @blur="saveField('url')" />
        </label>
      </div>
    </section>

    <!-- Citations Section -->
    <section class="detail-section" aria-labelledby="section-source-citations">
      <SectionHeader
        :title="$t('sourceDetail.citations')"
        :count="citations.length"
        :collapsible="false"
        :action-label="$t('sourceDetail.addCitation')"
        tabindex="0"
        :data-narrate="$t('sourceDetail.citations') + ', ' + citations.length"
        @action="showCitationForm = true"
      />
      <div v-if="citations.length === 0" class="empty-hint">{{ $t('sourceDetail.noCitations') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('sourceDetail.entity') }}</th>
            <th>{{ $t('sourceDetail.notes') }}</th>
            <th>{{ $t('sourceDetail.confidence') }}</th>
            <th>{{ $t('sourceDetail.transcription') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="cit in citations" :key="cit.id">
            <tr class="clickable-row" @click="editingCitation = cit">
              <td>
                <a v-if="cit.entityRoute" class="entity-link" @click.stop.prevent="router.push(cit.entityRoute)" href="#">{{ cit.entityLabel }}</a>
                <span v-else-if="cit.entityLabel" class="muted">{{ cit.entityLabel }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td><LinkedText v-if="cit.notes" :text="cit.notes" /><span v-else>—</span></td>
              <td>
                <span :class="'confidence-badge confidence-' + cit.confidence">
                  {{ $t('confidenceLevels.' + cit.confidence) }}
                </span>
                <span class="confidence-text-label">&nbsp;({{ cit.confidence }})</span>
              </td>
              <td class="transcription-cell">{{ truncate(cit.transcription, 80) }}</td>
              <td>
                <AppButton variant="ghost" size="sm" @click.stop="removeCitation(cit.id)">✕</AppButton>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>

    <CitationForm
      v-if="showCitationForm"
      :source-id="source.id"
      @close="showCitationForm = false"
      @saved="onCitationSaved"
    />
    <CitationEditModal
      v-if="editingCitation"
      :citation="editingCitation"
      @close="editingCitation = null"
      @saved="editingCitation = null; load()"
    />
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, inject, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave } from 'vue-router';
import CitationForm from '../components/CitationForm.vue';
import CitationEditModal from '../components/CitationEditModal.vue';
import LinkedText from '../components/LinkedText.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppButton from '../components/ui/AppButton.vue';
import SectionHeader from '../components/ui/SectionHeader.vue';
import { SOURCE_TYPE_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { useTTS } from '../composables/useTTS';
import { narrateSource, narrationLabelsFromI18n } from '../utils/narration';
import { resolvePersonDisplayName } from '../utils/nameUtils';

interface SourceData {
  id: string;
  title: string;
  author: string;
  publication_info: string;
  repository: string;
  url: string;
  source_type: string;
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
  // resolved after load
  entityLabel?: string;
  entityRoute?: string;
}

const { t, locale } = useI18n();
const toast = useToast();
const route = useRoute();
const router = useRouter();
const sourceId = route.params.id as string;
const ttsEnabled = inject<Ref<boolean>>('ttsEnabled', ref(false));
const { speak, stop } = useTTS();

const source = ref<SourceData | null>(null);
const citations = ref<CitationRow[]>([]);
const showCitationForm = ref(false);
const editingCitation = ref<CitationRow | null>(null);
const editFields = reactive({
  title: '',
  author: '',
  source_type: '',
  publication_info: '',
  repository: '',
  url: '',
});

async function resolveEntityLabel(cit: CitationRow): Promise<{ label: string; route: string } | null> {
  try {
    if (cit.event_id) {
      const ev = await window.api.events.get(cit.event_id) as { event_type: string; date_value: string | null } | null;
      if (!ev) return null;
      const eventLabel = t('eventTypes.' + ev.event_type);
      const dateStr = ev.date_value ? ` (${ev.date_value})` : '';
      // Find primary participant to name the event
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

function truncate(text: string, max: number): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function autoNarrate() {
  if (!ttsEnabled.value || !source.value) return;
  const text = narrateSource({
    title: source.value.title || t('common.unknown'),
    author: source.value.author || undefined,
    citationCount: citations.value.length,
  }, narrationLabelsFromI18n(t));
  speak(text, locale.value);
}

async function load() {
  if (!window.api) return;
  try {
    source.value = (await window.api.sources.get(sourceId)) as SourceData | null;
    if (!source.value) return;

    editFields.title = source.value.title;
    editFields.author = source.value.author;
    editFields.source_type = source.value.source_type;
    editFields.publication_info = source.value.publication_info;
    editFields.repository = source.value.repository;
    editFields.url = source.value.url;

    const rawCits = (await window.api.citations.forSource(sourceId)) as CitationRow[];
    // Resolve entity labels in parallel before assigning to ref
    await Promise.all(rawCits.map(async (cit) => {
      const resolved = await resolveEntityLabel(cit);
      if (resolved) {
        cit.entityLabel = resolved.label;
        cit.entityRoute = resolved.route;
      }
    }));
    citations.value = rawCits;
    autoNarrate();
  } catch (err) {
    console.error('[SourceDetailView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function saveField(field: string) {
  if (!window.api || !source.value) return;
  const val = editFields[field as keyof typeof editFields];
  if (val === source.value[field as keyof SourceData]) return;
  try {
    await window.api.sources.update(sourceId, { [field]: val });
    (source.value as Record<string, unknown>)[field] = val;
  } catch (err) {
    console.error(`[SourceDetailView] saveField(${field}) failed:`, err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeCitation(id: string) {
  if (!window.api) return;
  if (!confirm(t('sourceDetail.confirmDeleteCitation'))) return;
  try {
    await window.api.citations.delete(id);
    await load();
  } catch (err) {
    console.error('[SourceDetailView] removeCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

function onCitationSaved() {
  showCitationForm.value = false;
  load();
}

onMounted(load);

onBeforeRouteLeave(() => { stop(); });
</script>

<style scoped>
.source-detail {
}
.detail-header {
  margin-bottom: 24px;
}
.detail-header h2 {
  margin: 0;
}
.header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.btn-back {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 4px 0;
  font-size: var(--font-base);
}
.btn-back:hover {
  text-decoration: underline;
}
.detail-section {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--surface-border-subtle, #eee);
}
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.field-grid input,
.field-grid select {
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
.entity-link {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
}
.entity-link:hover { text-decoration: underline; }
.transcription-cell {
  color: var(--text-secondary);
  font-style: italic;
  max-width: 300px;
}
.confidence-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  white-space: nowrap;
}
.confidence-0 { background: var(--error-bg); color: var(--error-text); }
.confidence-1 { background: var(--warning-bg); color: var(--warning-text); }
.confidence-2 { background: var(--info-bg, #e0f2fe); color: var(--info-text, #075985); }
.confidence-3 { background: var(--success-bg); color: var(--success-text); }
</style>
