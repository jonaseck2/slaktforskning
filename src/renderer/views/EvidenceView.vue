<template>
  <div>
    <div class="header">
      <h2>{{ $t('assertions.title') }}</h2>
    </div>

    <div v-if="loading" class="empty">{{ $t('assertions.loading') }}</div>

    <template v-else>
      <p class="count-label">
        {{ $t('assertions.summary', { total: allAssertions.length, conflicts: conflicts.length }) }}
      </p>

      <div class="filter-chips">
        <button
          v-for="f in filters"
          :key="f.value"
          :class="['chip', { active: activeFilter === f.value }]"
          @click="activeFilter = f.value"
        >{{ f.label }}</button>
      </div>

      <!-- Conflicts section -->
      <div v-if="activeFilter === 'all' || activeFilter === 'conflicts'">
        <div v-if="conflicts.length > 0" class="conflict-list">
          <div v-for="(group, gi) in conflicts" :key="gi" class="conflict-group">
            <div class="conflict-header" @click="toggleConflict(gi)">
              <span class="conflict-badge">{{ $t('assertions.conflict') }}</span>
              <span class="conflict-subject">{{ subjectLabel(group) }}</span>
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
        <div v-else-if="activeFilter === 'conflicts'" class="empty">
          {{ $t('assertions.noConflicts') }}
        </div>
      </div>

      <!-- All assertions table -->
      <div v-if="activeFilter === 'all' || activeFilter === 'accepted' || activeFilter === 'unaccepted'">
        <div v-if="filteredAssertions.length === 0" class="empty">
          {{ $t('assertions.noAssertions') }}
        </div>
        <table v-else class="data-table assertion-table">
          <thead>
            <tr>
              <th>{{ $t('assertions.subjectHeader') }}</th>
              <th>{{ $t('assertions.attribute') }}</th>
              <th>{{ $t('assertions.value') }}</th>
              <th>{{ $t('assertions.confidence') }}</th>
              <th>{{ $t('assertions.evidenceType') }}</th>
              <th>{{ $t('assertions.isAccepted') }}</th>
              <th class="th-actions">{{ $t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="a in filteredAssertions"
              :key="a.id"
              :class="['clickable-row', { 'row-accepted': a.is_accepted }]"
              @click="navigateToSubject(a)"
            >
              <td>
                <router-link
                  v-if="a.subject_type === 'person' && subjectNames[a.subject_id]"
                  :to="'/persons/' + a.subject_id"
                  class="person-link"
                  @click.stop
                >{{ subjectNames[a.subject_id] }}</router-link>
                <span v-else>{{ a.subject_type }}:{{ a.subject_id.substring(0, 8) }}</span>
              </td>
              <td>{{ $t('assertions.attributes.' + a.attribute, a.attribute) }}</td>
              <td>{{ a.value }}</td>
              <td>{{ $t('confidenceLevels.' + a.confidence) }}</td>
              <td>{{ a.evidence_type ? $t('assertions.evidenceTypes.' + a.evidence_type) : '—' }}</td>
              <td>
                <input type="checkbox" :checked="a.is_accepted" @change.stop="toggleAccepted(a)" />
              </td>
              <td>
                <button class="btn-sm btn-delete" @click.stop="removeAssertion(a.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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

const router = useRouter();
const { t } = useI18n();
const toast = useToast();

const loading = ref(true);
const allAssertions = ref<AssertionRow[]>([]);
const conflicts = ref<ConflictGroup[]>([]);
const expandedConflicts = ref<Set<number>>(new Set());
const subjectNames = ref<Record<string, string>>({});
const activeFilter = ref('all');

const filters = computed(() => [
  { value: 'all', label: t('assertions.filterAll') },
  { value: 'conflicts', label: t('assertions.filterConflicts', { count: conflicts.value.length }) },
  { value: 'accepted', label: t('assertions.accepted') },
  { value: 'unaccepted', label: t('assertions.filterUnaccepted') },
]);

const filteredAssertions = computed(() => {
  if (activeFilter.value === 'conflicts') return [];
  if (activeFilter.value === 'accepted') return allAssertions.value.filter(a => a.is_accepted);
  if (activeFilter.value === 'unaccepted') return allAssertions.value.filter(a => !a.is_accepted);
  return allAssertions.value;
});

function subjectLabel(group: ConflictGroup): string {
  if (group.subject_type === 'person' && subjectNames.value[group.subject_id]) {
    return subjectNames.value[group.subject_id];
  }
  return `${group.subject_type}:${group.subject_id.substring(0, 8)}`;
}

function toggleConflict(index: number) {
  if (expandedConflicts.value.has(index)) {
    expandedConflicts.value.delete(index);
  } else {
    expandedConflicts.value.add(index);
  }
  expandedConflicts.value = new Set(expandedConflicts.value);
}

async function load() {
  loading.value = true;
  try {
    const [assertionsList, conflictsList] = await Promise.all([
      window.api.assertions.list() as Promise<AssertionRow[]>,
      window.api.assertions.conflicts() as Promise<ConflictGroup[]>,
    ]);
    allAssertions.value = assertionsList;
    conflicts.value = conflictsList;
    expandedConflicts.value = new Set(conflictsList.map((_, i) => i));

    // Resolve person names for person-type subjects
    const personIds = new Set<string>();
    for (const a of assertionsList) {
      if (a.subject_type === 'person') personIds.add(a.subject_id);
    }
    for (const g of conflictsList) {
      if (g.subject_type === 'person') personIds.add(g.subject_id);
    }
    const names: Record<string, string> = {};
    for (const pid of personIds) {
      try {
        const person = await window.api.persons.get(pid) as { id: string; given_name?: string; surname?: string } | null;
        if (person) {
          const personNames = await window.api.persons.getNames(pid) as Array<{ given_name?: string; surname?: string }>;
          const n = personNames[0];
          names[pid] = n ? [n.given_name, n.surname].filter(Boolean).join(' ') || '—' : '—';
        }
      } catch { /* skip */ }
    }
    subjectNames.value = names;
  } catch (err) {
    console.error('[EvidenceView] load failed:', err);
    toast.error(t('errors.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function toggleAccepted(a: AssertionRow) {
  try {
    await window.api.assertions.update(a.id, { is_accepted: !a.is_accepted });
    await load();
  } catch {
    toast.error(t('errors.saveFailed'));
  }
}

async function updateNotes(a: AssertionRow, notes: string) {
  if (notes === a.notes) return;
  try {
    await window.api.assertions.update(a.id, { notes });
    a.notes = notes;
  } catch {
    toast.error(t('errors.saveFailed'));
  }
}

async function removeAssertion(id: string) {
  if (!confirm(t('common.confirmDelete'))) return;
  try {
    await window.api.assertions.delete(id);
    await load();
  } catch {
    toast.error(t('errors.deleteFailed'));
  }
}

function navigateToSubject(a: AssertionRow) {
  if (a.subject_type === 'person') {
    router.push('/persons/' + a.subject_id);
  }
}

onMounted(load);
</script>

<style scoped>
.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
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
.conflict-subject {
  font-weight: 600;
}
.conflict-attr {
  color: var(--color-text-subtle);
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
</style>
