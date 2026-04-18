<template>
  <div v-if="relationship" class="relationship-detail">
    <div class="detail-header">
      <div class="header-row">
        <h2>{{ $t('relationshipDetail.title') }}</h2>
        <AppBadge variant="event">{{ $t('relTypes.' + relationship.type) }}</AppBadge>
        <AppBadge v-if="relationship.subtype" variant="status">{{ $t((relationship.type === 'couple' ? 'coupleSubtypes.' : 'parentChildSubtypes.') + relationship.subtype) }}</AppBadge>
        <AppButton v-if="relationship.type === 'couple'" variant="ghost" size="sm" @click="$router.push('/reports?tab=familyNarrative&relationshipId=' + relationship.id)">{{ $t('reports.tabFamilyNarrative') }} →</AppButton>
      </div>
    </div>

    <!-- Type & Subtype -->
    <section class="detail-section" aria-labelledby="section-rel-type">
      <SectionHeader
        :title="$t('common.type')"
        :collapsible="false"
        tabindex="0"
        :data-narrate="$t('common.type') + ': ' + $t('relTypes.' + relationship.type)"
      />
      <div class="type-fields">
        <label>
          {{ $t('common.type') }}
          <select :value="relationship.type" @change="updateType($event)">
            <option v-for="rt in RELATIONSHIP_TYPE_VALUES" :key="rt" :value="rt">
              {{ $t('relTypes.' + rt) }}
            </option>
          </select>
        </label>
        <label v-if="relationship.type === 'couple'">
          {{ $t('relationshipDetail.subtype') }}
          <select :value="relationship.subtype" @change="updateSubtype($event)">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
              {{ $t('coupleSubtypes.' + st) }}
            </option>
          </select>
        </label>
        <label v-if="relationship.type === 'parent_child'">
          {{ $t('relationshipDetail.subtype') }}
          <select :value="relationship.subtype" @change="updateSubtype($event)">
            <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">
              {{ $t('parentChildSubtypes.' + st) }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('common.notes') }}
          <textarea
            ref="notesRef"
            v-model="notesText"
            rows="2"
            :placeholder="$t('relationshipDetail.notesPlaceholder')"
            :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
            @blur="persistNotesHeight(); saveNotes()"
            @mouseup="persistNotesHeight"
          />
        </label>
      </div>
    </section>

    <!-- Persons Section -->
    <section class="detail-section" aria-labelledby="section-rel-persons">
      <SectionHeader
        :title="$t('relationshipDetail.persons')"
        :collapsible="false"
        tabindex="0"
        :data-narrate="$t('relationshipDetail.persons')"
      />
      <div class="persons-grid">
        <label>
          {{ person1Label }}
          <PersonPicker
            v-model="relationship.person1_id"
            :placeholder="$t('relationshipDetail.selectPerson')"
            @update:model-value="(v) => updateRel({ person1_id: v })"
            @select="selectPerson"
          />
        </label>
        <label>
          {{ person2Label }}
          <PersonPicker
            v-model="relationship.person2_id"
            :placeholder="$t('relationshipDetail.selectPerson')"
            @update:model-value="(v) => updateRel({ person2_id: v })"
            @select="selectPerson"
          />
        </label>
      </div>
    </section>

    <!-- Events Section -->
    <section class="detail-section" aria-label="Events">
      <EventList :relationship-id="relationship.id" />
    </section>

  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave } from 'vue-router';
import PersonPicker from '../components/PersonPicker.vue';
import EventList from '../components/EventList.vue';
import AppBadge from '../components/ui/AppBadge.vue';
import AppButton from '../components/ui/AppButton.vue';
import SectionHeader from '../components/ui/SectionHeader.vue';
import { RELATIONSHIP_TYPE_VALUES, COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';
import { useFocusStore } from '../stores/focus';
import { fullNameParts, resolvePersonDisplayName } from '../utils/nameUtils';
import { useToast } from '../composables/useToast';
import { useTTS } from '../composables/useTTS';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { narrateRelationship, narrationLabelsFromI18n } from '../utils/narration';

interface RelData {
  id: string;
  type: string;
  person1_id: string | null;
  person2_id: string | null;
  subtype: string | null;
  notes: string;
}

const { t, locale } = useI18n();
const toast = useToast();
const route = useRoute();
const relId = route.params.id as string;
const focusStore = useFocusStore();
const ttsEnabled = inject<Ref<boolean>>('ttsEnabled', ref(false));
const { speak, stop } = useTTS();

const relationship = ref<RelData | null>(null);
const notesText = ref('');
const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('relationship-notes');
const person1Label = computed(() => {
  const type = relationship.value?.type;
  if (type === 'parent_child') return t('relTypes.parent');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godparent');
  return t('relationships.person1');
});

const person2Label = computed(() => {
  const type = relationship.value?.type;
  if (type === 'parent_child') return t('relTypes.child');
  if (type === 'couple') return t('relTypes.partner');
  if (type === 'sibling') return t('relTypes.sibling');
  if (type === 'godparent') return t('relTypes.godchild');
  return t('relationships.person2');
});

function selectPerson(person: { id: string; given_name: string; surname: string; preferred_name: string | null; nickname: string | null }) {
  const name = fullNameParts(person.given_name ?? null, person.surname ?? null, person.preferred_name ?? null, person.nickname ?? null).map(p => p.text).join('');
  focusStore.set(person.id, name);
}

async function resolvePersonName(personId: string | null): Promise<string> {
  if (!personId) return t('common.unknown');
  return resolvePersonDisplayName(personId, t('common.unknown'));
}

async function autoNarrate() {
  if (!ttsEnabled.value || !relationship.value) return;
  const [person1Name, person2Name] = await Promise.all([
    resolvePersonName(relationship.value.person1_id),
    resolvePersonName(relationship.value.person2_id),
  ]);
  const text = narrateRelationship({
    type: relationship.value.type,
    person1Name,
    person2Name,
  }, narrationLabelsFromI18n(t));
  speak(text, locale.value);
}

async function load() {
  if (!window.api) return;
  try {
    relationship.value = (await window.api.relationships.get(relId)) as RelData | null;
    if (!relationship.value) return;
    notesText.value = relationship.value.notes || '';
    await autoNarrate();
  } catch (err) {
    console.error('[RelationshipDetailView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function updateRel(data: Record<string, unknown>) {
  if (!window.api || !relationship.value) return;
  try {
    await window.api.relationships.update(relId, data);
  } catch (err) {
    console.error('[RelationshipDetailView] updateRel failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

function updateType(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  if (relationship.value) relationship.value.type = val;
  updateRel({ type: val });
}

function updateSubtype(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  if (relationship.value) relationship.value.subtype = val;
  updateRel({ subtype: val });
}

async function saveNotes() {
  if (!relationship.value || notesText.value === (relationship.value.notes || '')) return;
  relationship.value.notes = notesText.value;
  await updateRel({ notes: notesText.value });
}

onMounted(load);

onBeforeRouteLeave(() => { stop(); });
</script>

<style scoped>
.relationship-detail {
  max-width: none;
}
.detail-header {
  margin-bottom: 24px;
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
.header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.header-row h2 {
  margin: 0;
}
.detail-section {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--surface-border-subtle, #eee);
}
.persons-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.persons-grid label,
.type-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
}
.type-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.type-fields select,
.type-fields textarea {
  padding: 6px 8px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-size: var(--font-base);
  font-family: inherit;
}
.empty {
  color: var(--text-muted);
  padding: 40px;
  text-align: center;
}
</style>
