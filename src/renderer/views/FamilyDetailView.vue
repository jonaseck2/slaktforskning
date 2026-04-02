<template>
  <div v-if="family" class="family-detail">
    <div class="detail-header">
      <button class="btn-back" @click="$router.push('/families')">{{ $t('familyDetail.back') }}</button>
      <h2>{{ $t('familyDetail.title') }}</h2>
    </div>

    <!-- Partners Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('familyDetail.partners') }}</h4>
      </div>
      <div class="partners-grid">
        <label>
          {{ $t('families.partnerA') }}
          <PersonPicker
            v-model="family.partner_a_id"
            :placeholder="$t('familyDetail.selectPartner')"
            @update:model-value="(v) => updateFamily({ partner_a_id: v })"
          />
        </label>
        <label>
          {{ $t('families.partnerB') }}
          <PersonPicker
            v-model="family.partner_b_id"
            :placeholder="$t('familyDetail.selectPartner')"
            @update:model-value="(v) => updateFamily({ partner_b_id: v })"
          />
        </label>
      </div>
    </section>

    <!-- Union Info -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('familyDetail.union') }}</h4>
      </div>
      <div class="union-fields">
        <label>
          {{ $t('common.type') }}
          <select :value="family.union_type" @change="updateUnionType($event)">
            <option v-for="ut in UNION_TYPE_VALUES" :key="ut" :value="ut">
              {{ $t('unionTypes.' + ut) }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('common.notes') }}
          <textarea
            v-model="notesText"
            rows="2"
            :placeholder="$t('familyDetail.notesPlaceholder')"
            @blur="saveNotes"
          />
        </label>
      </div>
    </section>

    <!-- Children Section -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('familyDetail.children') }}</h4>
        <button class="btn-add" @click="showChildForm = true">{{ $t('familyDetail.addChild') }}</button>
      </div>
      <div v-if="children.length === 0" class="empty-hint">{{ $t('familyDetail.noChildren') }}</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>{{ $t('common.name') }}</th>
            <th>{{ $t('familyDetail.relationship') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="child in children"
            :key="child.link_id"
            class="clickable-row"
            @click="$router.push(`/persons/${child.person_id}`)"
          >
            <td>{{ child.name }}</td>
            <td><span class="type-badge">{{ $t('relationshipTypes.' + child.relationship_type) }}</span></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Events Section -->
    <section class="detail-section">
      <EventList :family-id="family.id" />
    </section>

    <!-- Add Child Modal -->
    <div v-if="showChildForm" class="modal-overlay" @click.self="showChildForm = false">
      <div class="modal">
        <h3>{{ $t('familyDetail.addChildTitle') }}</h3>
        <form @submit.prevent="addChild">
          <label>
            {{ $t('familyDetail.person') }}
            <PersonPicker v-model="childForm.person_id" :placeholder="$t('families.searchPerson')" />
          </label>
          <label>
            {{ $t('familyDetail.relationship') }}
            <select v-model="childForm.relationship_type">
              <option v-for="rt in RELATIONSHIP_TYPE_VALUES" :key="rt" :value="rt">
                {{ $t('relationshipTypes.' + rt) }}
              </option>
            </select>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showChildForm = false">{{ $t('common.cancel') }}</button>
            <button type="submit" :disabled="!childForm.person_id">{{ $t('familyDetail.addChildTitle') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <div v-else class="empty">{{ $t('common.loading') }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import EventList from '../components/EventList.vue';
import { UNION_TYPE_VALUES, RELATIONSHIP_TYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface FamilyData {
  id: string;
  partner_a_id: string | null;
  partner_b_id: string | null;
  union_type: string;
  notes: string;
}

interface ChildRow {
  link_id: string;
  person_id: string;
  name: string;
  relationship_type: string;
}

interface NameRow {
  given_name: string;
  surname: string;
}

const { t } = useI18n();
const route = useRoute();
const familyId = route.params.id as string;

const family = ref<FamilyData | null>(null);
const children = ref<ChildRow[]>([]);
const notesText = ref('');
const showChildForm = ref(false);

const childForm = reactive({
  person_id: null as string | null,
  relationship_type: 'biological',
});

async function load() {
  if (!window.api) return;
  try {
    family.value = (await window.api.families.get(familyId)) as FamilyData | null;
    if (!family.value) return;
    notesText.value = family.value.notes || '';

    const links = (await window.api.families.getChildren(familyId)) as Array<{
      id: string;
      person_id: string;
      relationship_type: string;
    }>;
    const enriched: ChildRow[] = [];
    for (const link of links) {
      let name = '';
      try {
        const names = (await window.api.persons.getNames(link.person_id)) as NameRow[];
        if (names.length > 0) name = `${names[0].given_name} ${names[0].surname}`.trim();
      } catch {
        /* ignore */
      }
      enriched.push({
        link_id: link.id,
        person_id: link.person_id,
        name: name || t('common.unknown'),
        relationship_type: link.relationship_type,
      });
    }
    children.value = enriched;
  } catch (err) {
    console.error('[FamilyDetailView] load failed:', err);
  }
}

async function updateFamily(data: Record<string, unknown>) {
  if (!window.api || !family.value) return;
  try {
    await window.api.families.update(familyId, data);
  } catch (err) {
    console.error('[FamilyDetailView] updateFamily failed:', err);
  }
}

function updateUnionType(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  if (family.value) family.value.union_type = val;
  updateFamily({ union_type: val });
}

async function saveNotes() {
  if (!family.value || notesText.value === (family.value.notes || '')) return;
  family.value.notes = notesText.value;
  await updateFamily({ notes: notesText.value });
}

async function addChild() {
  if (!window.api || !childForm.person_id) return;
  try {
    await window.api.families.addChild(familyId, childForm.person_id, childForm.relationship_type);
    showChildForm.value = false;
    childForm.person_id = null;
    childForm.relationship_type = 'biological';
    await load();
  } catch (err) {
    console.error('[FamilyDetailView] addChild failed:', err);
  }
}

onMounted(load);
</script>

<style scoped>
.family-detail {
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
  color: #2c3e50;
  cursor: pointer;
  padding: 4px 0;
  font-size: 14px;
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
  margin-bottom: 8px;
}
.section-header h4 {
  margin: 0;
  font-size: 15px;
}
.btn-add {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.partners-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.partners-grid label,
.union-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
.union-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.union-fields select,
.union-fields textarea {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
.empty-hint {
  color: #999;
  font-size: 13px;
  padding: 12px 0;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th,
.data-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #eee;
  text-align: left;
}
.data-table th {
  background: #f8f8f8;
  font-weight: 600;
  font-size: 12px;
  color: #666;
}
.clickable-row {
  cursor: pointer;
}
.clickable-row:hover {
  background: #f0f4ff;
}
.type-badge {
  background: #f0fdf4;
  color: #166534;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.empty {
  color: #999;
  padding: 40px;
  text-align: center;
}
/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0 0 16px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
form > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
form select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}
.modal-actions button[type='submit'] {
  background: #2c3e50;
  color: white;
}
.modal-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-cancel {
  background: #e0e0e0;
  color: #333;
}
</style>
