<template>
  <div v-if="source" class="source-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.back()">{{ $t('sourceDetail.back') }}</button>
      <h2>{{ source.title }}</h2>
    </div>

    <!-- Source Fields -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('sourceDetail.title') }}</h4>
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
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('sourceDetail.citations') }}</h4>
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
            <th>{{ $t('assertions.title') }}</th>
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
                <button
                  v-if="(assertionCounts[cit.id] ?? 0) > 0"
                  class="btn-sm btn-assertions"
                  @click="toggleAssertionExpand(cit.id)"
                >{{ assertionCounts[cit.id] }}</button>
                <button
                  class="btn-sm btn-add-assertion"
                  @click="openAssertionForm(cit)"
                >+</button>
              </td>
              <td>
                <button class="btn-sm btn-edit" @click="editingCitation = cit">{{ $t('common.edit') }}</button>
                <button class="btn-sm btn-delete" @click="removeCitation(cit.id)">✕</button>
              </td>
            </tr>
            <tr v-if="expandedCitationId === cit.id" class="assertion-expand-row">
              <td :colspan="6">
                <table class="data-table assertion-inline-table">
                  <thead>
                    <tr>
                      <th>{{ $t('assertions.attribute') }}</th>
                      <th>{{ $t('assertions.value') }}</th>
                      <th>{{ $t('assertions.valueOriginal') }}</th>
                      <th>{{ $t('assertions.isAccepted') }}</th>
                      <th>{{ $t('common.actions') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in expandedAssertions" :key="a.id">
                      <td>{{ $t('assertions.attributes.' + a.attribute, a.attribute) }}</td>
                      <td>{{ a.value }}</td>
                      <td class="td-original">{{ a.value_original }}</td>
                      <td>
                        <input type="checkbox" :checked="a.is_accepted" @change="toggleAssertionAccepted(a)" />
                      </td>
                      <td>
                        <button class="btn-sm btn-delete" @click="removeAssertion(a.id)">✕</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
    <AssertionFormModal
      v-if="assertionFormCitation"
      :citation-id="assertionFormCitation.id"
      :subject-type="assertionFormSubjectType"
      :subject-id="assertionFormSubjectId"
      @close="assertionFormCitation = null"
      @saved="assertionFormCitation = null; load()"
    />
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CitationForm from '../components/CitationForm.vue';
import CitationEditModal from '../components/CitationEditModal.vue';
import AssertionFormModal from '../components/AssertionFormModal.vue';
import { SOURCE_TYPE_VALUES } from '../constants/eventTypes';
import { useToast } from '../composables/useToast';

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

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const router = useRouter();
const sourceId = route.params.id as string;

const source = ref<SourceData | null>(null);
const citations = ref<CitationRow[]>([]);
const showCitationForm = ref(false);
const editingCitation = ref<CitationRow | null>(null);
const assertionCounts = ref<Record<string, number>>({});
const expandedCitationId = ref<string | null>(null);
const expandedAssertions = ref<Array<{ id: string; attribute: string; value: string; value_original: string; confidence: number; is_accepted: boolean; evidence_type: string | null; notes: string }>>([]);
const assertionFormCitation = ref<CitationRow | null>(null);
const assertionFormSubjectType = ref('event');
const assertionFormSubjectId = ref('');

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
    await loadAssertionCounts();
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

async function loadAssertionCounts() {
  if (!window.api) return;
  const counts: Record<string, number> = {};
  await Promise.all(citations.value.map(async (cit) => {
    try {
      const list = (await window.api.assertions.forCitation(cit.id)) as unknown[];
      counts[cit.id] = list.length;
    } catch { counts[cit.id] = 0; }
  }));
  assertionCounts.value = counts;
}

async function toggleAssertionExpand(citId: string) {
  if (expandedCitationId.value === citId) {
    expandedCitationId.value = null;
    expandedAssertions.value = [];
    return;
  }
  try {
    expandedAssertions.value = (await window.api.assertions.forCitation(citId)) as typeof expandedAssertions.value;
    expandedCitationId.value = citId;
  } catch (err) {
    console.error('[SourceDetailView] loadAssertions failed:', err);
  }
}

function openAssertionForm(cit: CitationRow) {
  assertionFormCitation.value = cit;
  // Determine subject from citation target
  if (cit.event_id) {
    assertionFormSubjectType.value = 'event';
    assertionFormSubjectId.value = cit.event_id;
  } else if (cit.person_id) {
    assertionFormSubjectType.value = 'person';
    assertionFormSubjectId.value = cit.person_id;
  } else if (cit.relationship_id) {
    assertionFormSubjectType.value = 'relationship';
    assertionFormSubjectId.value = cit.relationship_id;
  } else if (cit.place_id) {
    assertionFormSubjectType.value = 'place';
    assertionFormSubjectId.value = cit.place_id;
  } else {
    // No target — default to event
    assertionFormSubjectType.value = 'event';
    assertionFormSubjectId.value = '';
  }
}

async function toggleAssertionAccepted(a: { id: string; is_accepted: boolean }) {
  try {
    await window.api.assertions.update(a.id, { is_accepted: !a.is_accepted });
    if (expandedCitationId.value) {
      expandedAssertions.value = (await window.api.assertions.forCitation(expandedCitationId.value)) as typeof expandedAssertions.value;
    }
  } catch (err) {
    console.error('[SourceDetailView] toggleAssertionAccepted failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeAssertion(id: string) {
  if (!confirm(t('common.confirmDelete'))) return;
  try {
    await window.api.assertions.delete(id);
    await load();
    if (expandedCitationId.value) {
      expandedAssertions.value = (await window.api.assertions.forCitation(expandedCitationId.value)) as typeof expandedAssertions.value;
    }
  } catch (err) {
    console.error('[SourceDetailView] removeAssertion failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

onMounted(load);
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
.btn-assertions {
  background: #fef3c7;
  color: #92400e;
  margin-right: 4px;
}
.btn-add-assertion {
  background: #f3f4f6;
  color: #374151;
}
.assertion-expand-row td {
  padding: 0 !important;
  background: #f9fafb;
}
.assertion-inline-table {
  font-size: var(--font-xs);
  margin: 0;
}
.td-original {
  color: var(--color-text-subtle);
  font-style: italic;
}
</style>
