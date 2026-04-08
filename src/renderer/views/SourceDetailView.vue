<template>
  <div v-if="source" class="source-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.back()" :aria-label="$t('a11y.goBack')">{{ $t('sourceDetail.back') }}</button>
      <h2>{{ source.title }}</h2>
    </div>

    <!-- Source Fields -->
    <section class="detail-section" aria-labelledby="section-source-details">
      <div class="section-header">
        <h4 id="section-source-details">{{ $t('sourceDetail.title') }}</h4>
      </div>
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
      <div class="section-header">
        <h4 id="section-source-citations">{{ $t('sourceDetail.citations') }}</h4>
        <button class="btn-add" @click="showCitationForm = true">{{ $t('sourceDetail.addCitation') }}</button>
      </div>
      <div v-if="citations.length === 0" class="empty-hint">{{ $t('sourceDetail.noCitations') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('sourceDetail.entity') }}</th>
            <th>{{ $t('sourceDetail.page') }}</th>
            <th>{{ $t('sourceDetail.confidence') }}</th>
            <th>{{ $t('sourceDetail.transcription') }}</th>
            <th>{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="cit in citations" :key="cit.id">
            <tr>
              <td>
                <a v-if="cit.entityRoute" class="entity-link" @click.prevent="router.push(cit.entityRoute)" href="#">{{ cit.entityLabel }}</a>
                <span v-else-if="cit.entityLabel" class="muted">{{ cit.entityLabel }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td>{{ cit.page || '—' }}</td>
              <td>
                <span :class="'confidence-badge confidence-' + cit.confidence">
                  {{ $t('confidenceLevels.' + cit.confidence) }}
                </span>
              </td>
              <td class="transcription-cell">{{ truncate(cit.transcription, 80) }}</td>
              <td>
                <button class="btn-sm btn-edit" @click="editingCitation = cit">{{ $t('common.edit') }}</button>
                <button class="btn-sm btn-delete" @click="removeCitation(cit.id)">✕</button>
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
import { SOURCE_TYPE_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';
import { useTTS } from '../composables/useTTS';
import { narrateSource } from '../utils/narration';

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
        const names = await window.api.persons.getNames(primary.person_id) as Array<{ given_name: string | null; surname: string | null; preferred_name: string | null; sort_order: number }>;
        const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order)[0];
        const personName = sorted ? ([sorted.preferred_name ?? sorted.given_name?.split(' ')[0] ?? '', sorted.surname].filter(Boolean).join(' ') || '?') : '?';
        return { label: `${personName} – ${eventLabel}${dateStr}`, route: `/persons/${primary.person_id}` };
      }
      return { label: `${eventLabel}${dateStr}`, route: '' };
    }
    if (cit.person_id) {
      const names = await window.api.persons.getNames(cit.person_id) as Array<{ given_name: string | null; surname: string | null; preferred_name: string | null; sort_order: number }>;
      const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order)[0];
      const personName = sorted ? ([sorted.preferred_name ?? sorted.given_name?.split(' ')[0] ?? '', sorted.surname].filter(Boolean).join(' ') || '?') : '?';
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
  });
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
    citations.value = rawCits;
    // Resolve entity labels in parallel
    await Promise.all(rawCits.map(async (cit) => {
      const resolved = await resolveEntityLabel(cit);
      if (resolved) {
        cit.entityLabel = resolved.label;
        cit.entityRoute = resolved.route;
      }
    }));
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
  max-width: 700px;
}
.detail-header {
  margin-bottom: 24px;
}
.detail-header h2 {
  margin: 8px 0 0;
}
.btn-back {
  background: none;
  border: none;
  color: var(--color-primary);
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
  border-bottom: 1px solid #eee;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-header h4 {
  margin: 0;
  font-size: var(--font-md);
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
  color: #555;
}
.field-grid input,
.field-grid select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
.entity-link {
  color: #1565c0;
  text-decoration: none;
  cursor: pointer;
}
.entity-link:hover { text-decoration: underline; }
.transcription-cell {
  color: #555;
  font-style: italic;
  max-width: 300px;
}
.confidence-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  white-space: nowrap;
}
.confidence-0 { background: var(--color-danger-bg); color: #991b1b; }
.confidence-1 { background: #fef3c7; color: #92400e; }
.confidence-2 { background: #e0f2fe; color: #075985; }
.confidence-3 { background: #dcfce7; color: #166534; }
.btn-edit {
  background: #e8f4fd;
  color: #1565c0;
  margin-right: 4px;
}
</style>
