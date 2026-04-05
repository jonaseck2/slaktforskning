<template>
  <div class="reports-view">
    <h2>{{ $t('reports.title') }}</h2>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <!-- Ancestor Chart Tab -->
    <div v-if="activeTab === 'ancestor'" class="tab-content">
      <div class="controls">
        <label>
          {{ $t('reports.rootPerson') }}
          <PersonPicker v-model="ancestorRootId" :placeholder="$t('reports.selectPerson')" />
        </label>
        <label>
          {{ $t('reports.generations') }}
          <select v-model="ancestorGenerations">
            <option :value="3">3</option>
            <option :value="4">4</option>
            <option :value="5">5</option>
          </select>
        </label>
      </div>
      <div class="print-actions">
        <button class="btn-print" :disabled="!ancestorRootId" @click="printCurrent">{{ $t('reports.print') }}</button>
        <button class="btn-pdf" :disabled="!ancestorRootId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
      </div>
      <div v-if="ancestorRootId" class="print-preview">
        <AncestorChartReport :root-person-id="ancestorRootId" :generations="ancestorGenerations" />
      </div>
      <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
    </div>

    <!-- Family Group Sheet Tab -->
    <div v-if="activeTab === 'family'" class="tab-content">
      <div class="controls">
        <label>
          {{ $t('reports.couple') }}
          <select v-model="familyRelationshipId">
            <option value="" disabled>{{ $t('reports.selectCouple') }}</option>
            <option v-for="rel in coupleRelationships" :key="rel.id" :value="rel.id">
              {{ rel.label }}
            </option>
          </select>
        </label>
      </div>
      <div class="print-actions">
        <button class="btn-print" :disabled="!familyRelationshipId" @click="printCurrent">{{ $t('reports.print') }}</button>
        <button class="btn-pdf" :disabled="!familyRelationshipId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
      </div>
      <div v-if="familyRelationshipId" class="print-preview">
        <FamilyGroupSheet :relationship-id="familyRelationshipId" />
      </div>
      <div v-else class="empty-hint">{{ $t('reports.selectCoupleFirst') }}</div>
    </div>

    <!-- Individual Summary Tab -->
    <div v-if="activeTab === 'individual'" class="tab-content">
      <div class="controls">
        <label>
          {{ $t('reports.person') }}
          <PersonPicker v-model="individualPersonId" :placeholder="$t('reports.selectPerson')" />
        </label>
      </div>
      <div class="print-actions">
        <button class="btn-print" :disabled="!individualPersonId" @click="printCurrent">{{ $t('reports.print') }}</button>
        <button class="btn-pdf" :disabled="!individualPersonId" @click="exportPdf">{{ $t('reports.exportPdf') }}</button>
      </div>
      <div v-if="individualPersonId" class="print-preview">
        <IndividualSummary :person-id="individualPersonId" />
      </div>
      <div v-else class="empty-hint">{{ $t('reports.selectPersonFirst') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from '../components/PersonPicker.vue';
import AncestorChartReport from '../components/reports/AncestorChartReport.vue';
import FamilyGroupSheet from '../components/reports/FamilyGroupSheet.vue';
import IndividualSummary from '../components/reports/IndividualSummary.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RelationshipOption { id: string; label: string; }

const { t } = useI18n();

const activeTab = ref<'ancestor' | 'family' | 'individual'>('ancestor');
const tabs = computed(() => [
  { id: 'ancestor', label: t('reports.tabAncestor') },
  { id: 'family', label: t('reports.tabFamily') },
  { id: 'individual', label: t('reports.tabIndividual') },
]);

const ancestorRootId = ref<string | null>(null);
const ancestorGenerations = ref(4);
const familyRelationshipId = ref('');
const coupleRelationships = ref<RelationshipOption[]>([]);
const individualPersonId = ref<string | null>(null);

async function getPersonName(id: string | null): Promise<string> {
  if (!id || !window.api) return '?';
  try {
    const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string | null; surname: string | null; preferred_name: string | null }>;
    if (names.length > 0) {
      const n = names[0];
      const first = n.preferred_name ?? n.given_name?.split(' ')[0] ?? '';
      return [first, n.surname].filter(Boolean).join(' ') || '?';
    }
  } catch { /* ignore */ }
  return '?';
}

onMounted(async () => {
  if (!window.api) return;
  const rels = (await window.api.relationships.list()) as Array<{
    id: string; type: string;
    person1_id: string | null;
    person2_id: string | null;
  }>;
  const couples = rels.filter(r => r.type === 'couple');
  const options: RelationshipOption[] = [];
  for (const r of couples) {
    const name1 = await getPersonName(r.person1_id);
    const name2 = await getPersonName(r.person2_id);
    options.push({ id: r.id, label: `${name1} & ${name2}` });
  }
  coupleRelationships.value = options;
});

async function printCurrent() {
  await window.api.print.print();
}

async function exportPdf() {
  await window.api.print.exportPdf();
}
</script>

<style scoped>
.reports-view { max-width: 900px; }
.reports-view h2 { margin: 0 0 20px; }
.tab-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid #e0e0e0; }
.tab-btn {
  padding: 8px 20px; border: none; background: none; cursor: pointer;
  font-size: 14px; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.tab-btn.active { color: #2c3e50; font-weight: 600; border-bottom-color: #2c3e50; }
.tab-content { display: flex; flex-direction: column; gap: 16px; }
.controls { display: flex; gap: 16px; flex-wrap: wrap; }
.controls label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 13px; font-weight: 600; color: #555; min-width: 200px;
}
.controls select {
  padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit;
}
.print-actions { display: flex; gap: 8px; }
.btn-print, .btn-pdf {
  padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;
}
.btn-print { background: #2c3e50; color: white; }
.btn-pdf { background: #e74c3c; color: white; }
.btn-print:disabled, .btn-pdf:disabled { opacity: 0.5; cursor: default; }
.print-preview {
  background: white; border: 1px solid #ddd; border-radius: 4px;
  padding: 20mm; min-height: 297mm; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
@media print {
  .reports-view > h2, .tab-bar, .controls, .print-actions { display: none !important; }
  .print-preview { border: none; padding: 0; box-shadow: none; min-height: auto; }
}
.empty-hint { color: #999; font-size: 13px; padding: 20px 0; }
</style>
