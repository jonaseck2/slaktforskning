<template>
  <div v-if="relationship" class="relationship-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.push('/relationships')">{{ $t('relationshipDetail.back') }}</button>
      <div class="header-row">
        <h2>{{ $t('relationshipDetail.title') }} — {{ $t('relTypes.' + relationship.type) }}</h2>
        <button type="button" class="btn-cite-header" @click="showCiteForm = true">{{ $t('relationshipDetail.citeRelationship') }}</button>
      </div>
    </div>

    <!-- Type & Subtype -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('common.type') }}</h4>
      </div>
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
            v-model="notesText"
            rows="2"
            :placeholder="$t('relationshipDetail.notesPlaceholder')"
            @blur="saveNotes"
          />
        </label>
      </div>
    </section>

    <!-- Persons Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('relationshipDetail.persons') }}</h4>
      </div>
      <div class="persons-grid">
        <label>
          {{ person1Label }}
          <PersonPicker
            v-model="relationship.person1_id"
            :placeholder="$t('relationshipDetail.selectPerson')"
            @update:model-value="(v) => updateRel({ person1_id: v })"
          />
        </label>
        <label>
          {{ person2Label }}
          <PersonPicker
            v-model="relationship.person2_id"
            :placeholder="$t('relationshipDetail.selectPerson')"
            @update:model-value="(v) => updateRel({ person2_id: v })"
          />
        </label>
      </div>
    </section>

    <!-- Events Section -->
    <section class="detail-section">
      <EventList :relationship-id="relationship.id" />
    </section>

    <CitationForm
      v-if="showCiteForm && relationship"
      :relationship-id="relationship.id"
      @close="showCiteForm = false"
      @saved="showCiteForm = false"
    />
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import CitationForm from '../components/CitationForm.vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import EventList from '../components/EventList.vue';
import { RELATIONSHIP_TYPE_VALUES, COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';

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

const { t } = useI18n();
const route = useRoute();
const relId = route.params.id as string;

const relationship = ref<RelData | null>(null);
const notesText = ref('');
const showCiteForm = ref(false);

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

async function load() {
  if (!window.api) return;
  try {
    relationship.value = (await window.api.relationships.get(relId)) as RelData | null;
    if (!relationship.value) return;
    notesText.value = relationship.value.notes || '';
  } catch (err) {
    console.error('[RelationshipDetailView] load failed:', err);
  }
}

async function updateRel(data: Record<string, unknown>) {
  if (!window.api || !relationship.value) return;
  try {
    await window.api.relationships.update(relId, data);
  } catch (err) {
    console.error('[RelationshipDetailView] updateRel failed:', err);
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
</script>

<style scoped>
.relationship-detail {
  max-width: 700px;
}
.detail-header {
  margin-bottom: 24px;
}
.btn-back {
  background: none;
  border: none;
  color: #2c3e50;
  cursor: pointer;
  padding: 4px 0;
  font-size: 14px;
}
.btn-back:hover {
  text-decoration: underline;
}
.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.header-row h2 {
  margin: 0;
}
.btn-cite-header {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
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
  margin-bottom: 8px;
}
.section-header h4 {
  margin: 0;
  font-size: 15px;
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
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
.type-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.type-fields select,
.type-fields textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
}
</style>
