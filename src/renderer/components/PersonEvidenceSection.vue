<template>
  <div class="evidence-section">
    <div v-if="conflicts.length === 0 && allAssertions.length === 0" class="empty-hint">
      {{ $t('assertions.noAssertions') }}
    </div>

    <div v-if="conflicts.length > 0" class="conflict-list">
      <div v-for="(group, gi) in conflicts" :key="gi" class="conflict-group">
        <div class="conflict-header" @click="toggleConflict(gi)">
          <span class="conflict-badge">{{ $t('assertions.conflict') }}</span>
          <span class="conflict-attr">{{ $t('assertions.attributes.' + group.attribute, group.attribute) }}</span>
          <span class="conflict-count">{{ group.assertions.length }} {{ $t('assertions.claimCount', group.assertions.length) }}</span>
          <span class="expand-arrow">{{ expandedConflicts.has(gi) ? '▾' : '▸' }}</span>
        </div>
        <table v-if="expandedConflicts.has(gi)" class="data-table assertion-table">
          <thead>
            <tr>
              <th>{{ $t('assertions.value') }}</th>
              <th>{{ $t('assertions.valueOriginal') }}</th>
              <th>{{ $t('assertions.confidence') }}</th>
              <th>{{ $t('assertions.isAccepted') }}</th>
              <th>{{ $t('assertions.notes') }}</th>
              <th class="th-actions">{{ $t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in group.assertions" :key="a.id" :class="{ 'row-accepted': a.is_accepted, 'row-conflict': !a.is_accepted }">
              <td>{{ a.value }}</td>
              <td class="td-original">{{ a.value_original }}</td>
              <td>{{ $t('confidenceLevels.' + a.confidence) }}</td>
              <td>
                <input type="checkbox" :checked="a.is_accepted" @change="toggleAccepted(a)" />
              </td>
              <td>
                <input
                  type="text"
                  class="inline-notes"
                  :value="a.notes"
                  :placeholder="$t('assertions.notesPlaceholder')"
                  @blur="updateNotes(a, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td>
                <button class="btn-sm btn-delete" @click="removeAssertion(a.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="nonConflicting.length > 0" class="assertions-list">
      <table class="data-table assertion-table">
        <thead>
          <tr>
            <th>{{ $t('assertions.attribute') }}</th>
            <th>{{ $t('assertions.value') }}</th>
            <th>{{ $t('assertions.confidence') }}</th>
            <th>{{ $t('assertions.isAccepted') }}</th>
            <th class="th-actions">{{ $t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in nonConflicting" :key="a.id" :class="{ 'row-accepted': a.is_accepted }">
            <td>{{ $t('assertions.attributes.' + a.attribute, a.attribute) }}</td>
            <td>{{ a.value }}</td>
            <td>{{ $t('confidenceLevels.' + a.confidence) }}</td>
            <td>
              <input type="checkbox" :checked="a.is_accepted" @change="toggleAccepted(a)" />
            </td>
            <td>
              <button class="btn-sm btn-delete" @click="removeAssertion(a.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Proof Summary -->
    <div v-if="allAssertions.length > 0 || conflicts.length > 0" class="proof-section">
      <button class="btn-sm btn-proof" @click="generateSummary">
        {{ $t('assertions.generateProof') }}
      </button>
      <div v-if="proofSummary" class="proof-content">
        <h5>{{ $t('assertions.proofTitle') }}</h5>
        <div v-if="proofSummary.items.length === 0" class="empty-hint">
          {{ $t('assertions.noAccepted') }}
        </div>
        <table v-else class="data-table proof-table">
          <thead>
            <tr>
              <th>{{ $t('assertions.attribute') }}</th>
              <th>{{ $t('assertions.value') }}</th>
              <th>{{ $t('assertions.source') }}</th>
              <th>{{ $t('assertions.confidence') }}</th>
              <th>{{ $t('assertions.notes') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in proofSummary.items" :key="i">
              <td>{{ $t('assertions.attributes.' + item.attribute, item.attribute) }}</td>
              <td>{{ item.accepted_value }}</td>
              <td class="td-source">{{ item.source_title }}<span v-if="item.citation_page">, {{ item.citation_page }}</span></td>
              <td>{{ $t('confidenceLevels.' + item.confidence) }}</td>
              <td class="td-notes">{{ item.notes }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="proofSummary.conflicts.length > 0" class="proof-conflicts">
          <p class="proof-warning">{{ $t('assertions.unresolvedNote', { count: proofSummary.conflicts.length }) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';

interface AssertionRow {
  id: string;
  citation_id: string;
  subject_type: string;
  subject_id: string;
  attribute: string;
  value: string;
  value_original: string;
  confidence: number;
  is_accepted: boolean;
  evidence_type: string | null;
  notes: string;
}

interface ConflictGroup {
  subject_type: string;
  subject_id: string;
  attribute: string;
  assertions: AssertionRow[];
}

const props = defineProps<{ personId: string }>();
const { t } = useI18n();
const toast = useToast();

const conflicts = ref<ConflictGroup[]>([]);
const allAssertions = ref<AssertionRow[]>([]);
const expandedConflicts = ref<Set<number>>(new Set());

// Assertions NOT in a conflict group
const conflictedIds = computed(() => {
  const ids = new Set<string>();
  for (const g of conflicts.value) {
    for (const a of g.assertions) ids.add(a.id);
  }
  return ids;
});

const nonConflicting = computed(() =>
  allAssertions.value.filter(a => !conflictedIds.value.has(a.id))
);

async function load() {
  if (!window.api) return;
  try {
    conflicts.value = (await window.api.assertions.conflictsForPerson(props.personId)) as ConflictGroup[];
    // Also load all assertions for this person directly
    allAssertions.value = (await window.api.assertions.forSubject('person', props.personId)) as AssertionRow[];

    // Expand all conflicts by default
    expandedConflicts.value = new Set(conflicts.value.map((_, i) => i));
  } catch (err) {
    console.error('[PersonEvidenceSection] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

function toggleConflict(index: number) {
  if (expandedConflicts.value.has(index)) {
    expandedConflicts.value.delete(index);
  } else {
    expandedConflicts.value.add(index);
  }
  expandedConflicts.value = new Set(expandedConflicts.value);
}

async function toggleAccepted(a: AssertionRow) {
  try {
    await window.api.assertions.update(a.id, { is_accepted: !a.is_accepted });
    await load();
  } catch (err) {
    console.error('[PersonEvidenceSection] toggleAccepted failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function updateNotes(a: AssertionRow, notes: string) {
  if (notes === a.notes) return;
  try {
    await window.api.assertions.update(a.id, { notes });
    a.notes = notes;
  } catch (err) {
    console.error('[PersonEvidenceSection] updateNotes failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function removeAssertion(id: string) {
  if (!confirm(t('common.confirmDelete'))) return;
  try {
    await window.api.assertions.delete(id);
    await load();
  } catch (err) {
    console.error('[PersonEvidenceSection] removeAssertion failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

interface ProofSummaryData {
  items: Array<{
    attribute: string;
    accepted_value: string;
    source_title: string;
    citation_page: string;
    confidence: number;
    notes: string;
  }>;
  conflicts: ConflictGroup[];
}

const proofSummary = ref<ProofSummaryData | null>(null);

async function generateSummary() {
  if (!window.api) return;
  try {
    proofSummary.value = (await window.api.assertions.proofSummary(props.personId)) as ProofSummaryData;
  } catch (err) {
    console.error('[PersonEvidenceSection] generateSummary failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

watch(() => props.personId, () => { proofSummary.value = null; load(); }, { immediate: true });

defineExpose({ reload: load });
</script>

<style scoped>
.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.conflict-group {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}
.conflict-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--color-warning-bg, #fef3c7);
  cursor: pointer;
  font-size: var(--font-sm);
}
.conflict-header:hover {
  background: var(--color-warning-hover-bg, #fde68a);
}
.conflict-badge {
  background: var(--color-warning-badge, #f59e0b);
  color: white;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: var(--font-xs);
  font-weight: 600;
}
.conflict-attr {
  font-weight: 600;
}
.conflict-count {
  color: var(--color-text-subtle);
  margin-left: auto;
}
.expand-arrow {
  color: var(--color-text-subtle);
}
.assertion-table {
  font-size: var(--font-sm);
}
.row-accepted td {
  background: var(--color-success-bg, #dcfce7);
}
.row-conflict td {
  background: var(--color-warning-light-bg, #fefce8);
}
.td-original {
  color: var(--color-text-subtle);
  font-style: italic;
}
.inline-notes {
  border: 1px solid transparent;
  background: transparent;
  padding: 2px 4px;
  font-size: var(--font-xs);
  width: 100%;
  min-width: 120px;
}
.inline-notes:focus {
  border-color: var(--color-border);
  background: var(--color-bg);
  outline: none;
}
.proof-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}
.btn-proof {
  background: var(--color-primary, #2c3e50);
  color: white;
  padding: 4px 12px;
}
.proof-content {
  margin-top: 10px;
}
.proof-content h5 {
  margin: 0 0 8px;
  font-size: var(--font-sm);
}
.proof-table {
  font-size: var(--font-xs);
}
.td-source {
  color: var(--color-text-subtle);
  font-style: italic;
}
.td-notes {
  font-size: var(--font-xs);
  max-width: 200px;
}
.proof-warning {
  margin-top: 8px;
  padding: 4px 8px;
  background: var(--color-warning-bg, #fef3c7);
  border-radius: 4px;
  font-size: var(--font-xs);
  color: var(--color-warning-badge, #92400e);
}
</style>
