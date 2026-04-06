<template>
  <div class="person-panel">
    <!-- Empty state -->
    <div v-if="!personId" class="panel-empty">
      {{ $t('panel.noPersonSelected') }}
    </div>

    <template v-else-if="person">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-sex-bar" :style="{ background: sexColor }"></div>
        <div class="panel-header-content">
          <div class="panel-name">
            <PersonName
              :given-name="primaryName?.given_name ?? null"
              :surname="primaryName?.surname ?? null"
              :preferred-name="primaryName?.preferred_name ?? null"
              :nickname="primaryName?.nickname ?? null"
            />
          </div>
          <div class="panel-lifelines">
            <div v-if="person.birthLine" class="panel-lifeline">* {{ person.birthLine }}</div>
            <div v-if="person.deathLine" class="panel-lifeline">† {{ person.deathLine }}</div>
          </div>
          <div class="panel-actions">
            <router-link :to="'/persons/' + personId" class="panel-link">
              {{ $t('panel.open') }} →
            </router-link>
          </div>
          <div class="panel-add-relative-btns">
            <button class="btn-dark" @click="openAddRelative('parent')">+ Förälder</button>
            <button class="btn-dark" @click="openAddRelative('spouse')">+ Partner</button>
            <button class="btn-dark" @click="openAddRelative('child')">+ Barn</button>
          </div>
        </div>
      </div>

      <!-- Person section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('person')">
          <span class="panel-chevron">{{ sections.person ? '▾' : '▸' }}</span>
          Person
        </button>
        <div v-if="sections.person" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">Kön</label>
              <select class="compact-control" :value="person.sex" @change="updateSex(($event.target as HTMLSelectElement).value as 'M' | 'F' | 'U')">
                <option value="M">{{ $t('sex.M') }}</option>
                <option value="F">{{ $t('sex.F') }}</option>
                <option value="U">{{ $t('sex.U') }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">Status</label>
              <select class="compact-control" :value="String(person.living)" @change="updateLiving(($event.target as HTMLSelectElement).value === 'true')">
                <option value="true">{{ $t('personDetail.statusLiving') }}</option>
                <option value="false">{{ $t('personDetail.statusDeceased') }}</option>
              </select>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('panel.notes') }}</label>
              <textarea
                class="compact-control"
                rows="2"
                :value="person.notes ?? ''"
                @blur="updateNotes(($event.target as HTMLTextAreaElement).value)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Namn section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('names')">
          <span class="panel-chevron">{{ sections.names ? '▾' : '▸' }}</span>
          Namn
          <span class="panel-section-header-action" @click.stop="openNameForm(null)">+ Namn</span>
        </button>
        <div v-if="sections.names" class="panel-section-body">
          <div v-if="names.length === 0" class="panel-empty-section">—</div>
          <div
            v-for="name in names"
            :key="name.id"
            class="panel-name-row"
            :class="{ 'panel-name-row-clickable': name.sort_order !== 0 }"
            @click="name.sort_order !== 0 && openNameForm(name)"
          >
            <div class="panel-name-row-main">
              <PersonName
                :given-name="name.given_name"
                :surname="name.surname"
                :preferred-name="name.preferred_name ?? null"
                :nickname="name.nickname ?? null"
              />
              <span class="panel-name-type">{{ $t('nameTypes.' + name.name_type) }}</span>
            </div>
            <span v-if="name.sort_order === 0" class="panel-name-star">★</span>
            <button
              v-else
              class="btn-sm btn-delete"
              @click.stop="deleteName(name.id!)"
            >✕</button>
          </div>

          <!-- Inline name form -->
          <div v-if="showNameForm" class="panel-name-form">
            <div class="compact-form">
              <div class="compact-field">
                <label class="compact-label">Förnamn</label>
                <input v-model="nameFormData.given_name" type="text" class="compact-control" />
              </div>
              <div class="compact-field">
                <label class="compact-label">Efternamn</label>
                <input v-model="nameFormData.surname" type="text" class="compact-control" />
              </div>
              <div class="compact-field">
                <label class="compact-label">Namntyp</label>
                <select v-model="nameFormData.name_type" class="compact-control">
                  <option v-for="nt in NAME_TYPE_VALUES" :key="nt" :value="nt">{{ $t('nameTypes.' + nt) }}</option>
                </select>
              </div>
            </div>
            <div class="panel-name-form-actions">
              <button class="btn-dark" @click="saveName">Spara</button>
              <button class="btn-cancel" @click="cancelNameForm">Avbryt</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Händelser section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('events')">
          <span class="panel-chevron">{{ sections.events ? '▾' : '▸' }}</span>
          {{ $t('panel.events') }}
        </button>
        <div v-if="sections.events" class="panel-section-body">
          <EventList :person-id="personId" />
        </div>
      </div>

      <!-- Relationer section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('relationships')">
          <span class="panel-chevron">{{ sections.relationships ? '▾' : '▸' }}</span>
          {{ $t('panel.relationships') }}
          <span class="panel-section-header-action" @click.stop="showRelationPicker = !showRelationPicker">+ Relation</span>
        </button>
        <div v-if="sections.relationships" class="panel-section-body">
          <!-- Inline relation picker -->
          <div v-if="showRelationPicker" class="panel-relation-picker">
            <button class="btn-dark" @click="openAddRelative('parent'); showRelationPicker = false">+ Förälder</button>
            <button class="btn-dark" @click="openAddRelative('spouse'); showRelationPicker = false">+ Partner</button>
            <button class="btn-dark" @click="openAddRelative('child'); showRelationPicker = false">+ Barn</button>
          </div>
          <div v-if="relationships.length === 0" class="panel-empty-section">—</div>
          <div
            v-for="rel in relationships"
            :key="rel.id"
            class="panel-rel-row"
          >
            <span class="panel-rel-type">{{ relLabel(rel) }}</span>
            <button
              v-if="rel.otherId"
              class="panel-rel-person"
              @click="$emit('select', rel.otherId)"
            >{{ rel.otherName }}</button>
          </div>
        </div>
      </div>

      <!-- Källor section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('sources')">
          <span class="panel-chevron">{{ sections.sources ? '▾' : '▸' }}</span>
          Källor
          <span class="panel-section-header-action" @click.stop="showCitationForm = true">+ Källa</span>
        </button>
        <div v-if="sections.sources" class="panel-section-body">
          <div v-if="citations.length === 0" class="panel-empty-section">—</div>
          <div
            v-for="cit in citations"
            :key="cit.id"
            class="panel-citation-row"
          >
            <div class="panel-citation-main">
              <div class="panel-citation-source">{{ citationSources[cit.source_id]?.title ?? 'Okänd källa' }}</div>
              <div v-if="cit.page || cit.notes" class="panel-citation-detail">
                {{ cit.page ? cit.page : (cit.notes ?? '').slice(0, 40) }}
              </div>
            </div>
            <span class="panel-citation-confidence" :class="'conf-' + cit.confidence">
              {{ confidenceDots(cit.confidence) }}
            </span>
            <button class="btn-sm btn-delete" @click="deleteCitation(cit.id)">✕</button>
          </div>
        </div>
      </div>

      <!-- Grupper section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('groups')">
          <span class="panel-chevron">{{ sections.groups ? '▾' : '▸' }}</span>
          Grupper
          <span class="panel-section-header-action" @click.stop="showGroupPicker = !showGroupPicker">+ Grupp</span>
        </button>
        <div v-if="sections.groups" class="panel-section-body">
          <div v-if="showGroupPicker && personId" class="panel-group-picker-wrap">
            <GroupPicker
              :person-id="personId"
              :exclude-ids="groups.map(g => g.id)"
              @added="onGroupAdded"
              @cancel="showGroupPicker = false"
            />
          </div>
          <div v-if="groups.length === 0" class="panel-empty-section">—</div>
          <div
            v-for="group in groups"
            :key="group.id"
            class="panel-group-row"
          >
            <router-link :to="'/groups/' + group.id" class="panel-group-link">{{ group.name }}</router-link>
            <button class="btn-sm btn-delete" @click="removeFromGroup(group.id)">✕</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Add relative modal -->
    <AddRelatedPersonModal
      v-if="showAddRelative && personId"
      :person-id="personId"
      :mode="addRelativeMode"
      @close="showAddRelative = false"
      @saved="onRelativeSaved"
    />

    <!-- Citation form modal -->
    <CitationForm
      v-if="showCitationForm && personId"
      :person-id="personId"
      @close="showCitationForm = false"
      @saved="onCitationSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import EventList from './EventList.vue';
import PersonName from './PersonName.vue';
import AddRelatedPersonModal from './AddRelatedPersonModal.vue';
import CitationForm from './CitationForm.vue';
import GroupPicker from './GroupPicker.vue';
import { NAME_TYPE_VALUES } from '../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();

const props = defineProps<{ personId: string | null }>();
const emit = defineEmits<{
  select: [id: string];
  'relative-added': [];
}>();

// ── Local state ──────────────────────────────────────────────────────────────

interface PersonData {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  notes: string | null;
  birthLine: string | null;
  deathLine: string | null;
}
interface NameData { id?: string; given_name: string; surname: string; preferred_name: string | null; nickname: string | null; sort_order: number; name_type?: string; }
interface RelRow { id: string; type: string; subtype: string | null; otherId: string | null; otherName: string; }
interface CitationData { id: string; source_id: string; page: string | null; notes: string | null; confidence: number; }
interface GroupData { id: string; name: string; notes: string | null; }

const person = ref<PersonData | null>(null);
const primaryName = ref<NameData | null>(null);
const names = ref<NameData[]>([]);
const relationships = ref<RelRow[]>([]);
const citations = ref<CitationData[]>([]);
const citationSources = ref<Record<string, { title: string }>>({});
const groups = ref<GroupData[]>([]);

// Add relative modal state
const showAddRelative = ref(false);
const addRelativeMode = ref<'parent' | 'spouse' | 'child'>('parent');
const showRelationPicker = ref(false);

// Citation form state
const showCitationForm = ref(false);

// Group picker state
const showGroupPicker = ref(false);

function openAddRelative(mode: 'parent' | 'spouse' | 'child') {
  addRelativeMode.value = mode;
  showAddRelative.value = true;
}

async function onRelativeSaved() {
  showAddRelative.value = false;
  if (props.personId) {
    await loadPerson(props.personId);
    await loadRelationships(props.personId);
  }
  emit('relative-added');
}

// Section open/closed — persisted per key
function loadSection(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`viz-panel-section-${key}`);
  return v === null ? def : v === 'true';
}
const sections = reactive({
  person: loadSection('person', false),
  names: loadSection('names', false),
  events: loadSection('events', true),
  relationships: loadSection('relationships', false),
  sources: loadSection('sources', false),
  groups: loadSection('groups', false),
});

function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
  localStorage.setItem(`viz-panel-section-${key}`, String(sections[key]));
}

// ── Person field updates ──────────────────────────────────────────────────────

async function updateSex(value: 'M' | 'F' | 'U') {
  if (!props.personId || !person.value) return;
  await window.api.persons.update(props.personId, { sex: value });
  person.value.sex = value;
}

async function updateLiving(value: boolean) {
  if (!props.personId || !person.value) return;
  await window.api.persons.update(props.personId, { living: value });
  person.value.living = value;
}

async function updateNotes(value: string) {
  if (!props.personId || !person.value) return;
  const notes = value.trim() || null;
  await window.api.persons.update(props.personId, { notes });
  person.value.notes = notes;
}

// ── Name form ─────────────────────────────────────────────────────────────────

const showNameForm = ref(false);
const editingName = ref<NameData | null>(null);
const nameFormData = reactive({ given_name: '', surname: '', name_type: 'birth' as string });

function openNameForm(name: NameData | null) {
  editingName.value = name;
  if (name) {
    nameFormData.given_name = name.given_name ?? '';
    nameFormData.surname = name.surname ?? '';
    nameFormData.name_type = name.name_type ?? 'birth';
  } else {
    nameFormData.given_name = '';
    nameFormData.surname = '';
    nameFormData.name_type = 'birth';
  }
  showNameForm.value = true;
}

function cancelNameForm() {
  showNameForm.value = false;
  editingName.value = null;
}

async function saveName() {
  if (!props.personId) return;
  if (editingName.value?.id) {
    await window.api.persons.updateName(editingName.value.id, {
      given_name: nameFormData.given_name,
      surname: nameFormData.surname,
      name_type: nameFormData.name_type,
    });
  } else {
    await window.api.persons.addName(props.personId, {
      given_name: nameFormData.given_name,
      surname: nameFormData.surname,
      name_type: nameFormData.name_type,
    });
  }
  showNameForm.value = false;
  editingName.value = null;
  await reloadNames(props.personId);
}

async function deleteName(nameId: string) {
  if (!props.personId) return;
  await window.api.persons.deleteName(nameId);
  await reloadNames(props.personId);
}

async function reloadNames(id: string) {
  const fetched = (await window.api.persons.getNames(id)) as NameData[];
  const sorted = [...fetched].sort((a, b) => a.sort_order - b.sort_order);
  names.value = sorted;
  primaryName.value = sorted[0] ?? null;
}

// ── Derived ──────────────────────────────────────────────────────────────────

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
const sexColor = computed(() => SEX_COLORS[person.value?.sex ?? 'U'] ?? '#ccc');

const REL_TYPE_LABELS: Record<string, string> = {
  couple: 'Partner', parent_child: 'Förälder/barn', sibling: 'Syskon',
  godparent: 'Fadder', other: 'Annan',
};
function relLabel(rel: RelRow): string {
  if (rel.subtype) {
    const ns = rel.type === 'couple' ? 'coupleSubtypes' : 'parentChildSubtypes';
    const key = `${ns}.${rel.subtype}`;
    const label = t(key);
    return label !== key ? label : rel.subtype;
  }
  return REL_TYPE_LABELS[rel.type] ?? rel.type;
}

// ── Date formatting ───────────────────────────────────────────────────────────

async function buildDateLine(event: { date_original: string | null; date_value: string | null; place_id: string | null; place_address: string | null } | undefined): Promise<string | null> {
  if (!event) return null;

  const datePart = (event.date_original && event.date_original.trim())
    ? event.date_original.trim()
    : (event.date_value ?? null);

  if (!datePart) return null;

  let placePart: string | null = null;
  if (event.place_id) {
    try {
      const place = (await window.api.places.get(event.place_id)) as { name?: string; city?: string } | null;
      if (place) placePart = place.city ?? place.name ?? null;
    } catch {
      // ignore place fetch errors
    }
  } else if (event.place_address && event.place_address.trim()) {
    placePart = event.place_address.trim();
  }

  return placePart ? `${datePart}, ${placePart}` : datePart;
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadPerson(id: string) {
  const raw = (await window.api.persons.get(id)) as { id: string; sex: string; living: boolean; notes: string | null } | null;
  if (props.personId !== id) return;
  if (!raw) { person.value = null; return; }

  const fetched = (await window.api.persons.getNames(id)) as NameData[];
  if (props.personId !== id) return;
  const sorted = [...fetched].sort((a, b) => a.sort_order - b.sort_order);
  primaryName.value = sorted[0] ?? null;
  names.value = sorted;

  // Get birth/death events with full date + place info
  const events = (await window.api.events.forPerson(id)) as Array<{
    event_type: string;
    date_value: string | null;
    date_original: string | null;
    place_id: string | null;
    place_address: string | null;
  }>;
  if (props.personId !== id) return;

  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');

  const [birthLine, deathLine] = await Promise.all([
    buildDateLine(birth),
    buildDateLine(death),
  ]);
  if (props.personId !== id) return;

  person.value = {
    id: raw.id,
    sex: raw.sex as 'M' | 'F' | 'U',
    living: raw.living,
    notes: raw.notes,
    birthLine,
    deathLine,
  };

  await loadRelationships(id);
  await loadCitations(id);
  await loadGroups(id);
}

async function loadCitations(id: string) {
  const raw = (await window.api.citations.forPerson(id)) as CitationData[];
  citations.value = raw;

  const uniqueSourceIds = [...new Set(raw.map(c => c.source_id))];
  const sourceEntries = await Promise.all(
    uniqueSourceIds.map(async (sid) => {
      const src = (await window.api.sources.get(sid)) as { title: string } | null;
      return [sid, src ?? { title: 'Okänd källa' }] as [string, { title: string }];
    })
  );
  citationSources.value = Object.fromEntries(sourceEntries);
}

async function deleteCitation(id: string) {
  await window.api.citations.delete(id);
  if (props.personId) await loadCitations(props.personId);
}

async function loadGroups(id: string) {
  const raw = (await window.api.groups.forPerson(id)) as GroupData[];
  groups.value = raw;
}

async function removeFromGroup(groupId: string) {
  if (!props.personId) return;
  await window.api.groups.removeMember(groupId, props.personId);
  await loadGroups(props.personId);
}

async function onGroupAdded() {
  showGroupPicker.value = false;
  if (props.personId) await loadGroups(props.personId);
}

async function onCitationSaved() {
  showCitationForm.value = false;
  if (props.personId) await loadCitations(props.personId);
}

function confidenceDots(level: number): string {
  const filled = '●';
  const empty = '○';
  return filled.repeat(Math.min(level, 3)) + empty.repeat(Math.max(0, 3 - level));
}

async function loadRelationships(id: string) {
  const rels = (await window.api.relationships.getForPerson(id)) as Array<{
    id: string; type: string; subtype: string | null;
    person1_id: string | null; person2_id: string | null;
  }>;

  const rows: RelRow[] = await Promise.all(rels.map(async rel => {
    const otherId = rel.person1_id === id ? rel.person2_id : rel.person1_id;
    let otherName = t('common.unknown');
    if (otherId) {
      const otherNames = (await window.api.persons.getNames(otherId)) as NameData[];
      const first = [...otherNames].sort((a, b) => a.sort_order - b.sort_order)[0];
      if (first) {
        const gn = first.preferred_name ?? first.given_name ?? '';
        const sn = first.surname ?? '';
        otherName = [gn, sn].filter(Boolean).join(' ');
      }
    }
    return { id: rel.id, type: rel.type, subtype: rel.subtype, otherId, otherName };
  }));

  relationships.value = rows;
}

watch(() => props.personId, async (id) => {
  person.value = null;
  relationships.value = [];
  names.value = [];
  citations.value = [];
  citationSources.value = {};
  groups.value = [];
  if (id) await loadPerson(id);
}, { immediate: true });
</script>

<style scoped>
.person-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: white;
  font-size: 13px;
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #aaa;
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

/* Header */
.panel-header {
  display: flex;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.panel-sex-bar {
  width: 4px;
  flex-shrink: 0;
}
.panel-header-content {
  padding: 10px 14px 10px 10px;
  flex: 1;
  min-width: 0;
}
.panel-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a2a3a;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-lifelines {
  margin-bottom: 6px;
}
.panel-lifeline {
  font-size: 12px;
  color: #555;
  line-height: 1.5;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.panel-link {
  font-size: 12px;
  color: #2980b9;
  text-decoration: none;
  white-space: nowrap;
}
.panel-link:hover { text-decoration: underline; }

.panel-add-relative-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.btn-dark {
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.btn-dark:hover { opacity: 0.9; }

/* Sections */
.panel-section {
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}
.panel-section-header {
  width: 100%;
  text-align: left;
  background: #fafafa;
  border: none;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-section-header:hover { background: #f0f0f0; }
.panel-chevron { font-size: 10px; color: #999; }
.panel-section-header-action {
  margin-left: auto;
  background: #2c3e50;
  color: white;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
}
.panel-section-header-action:hover { opacity: 0.85; }
.panel-section-body { padding: 4px 0 8px; }
.panel-empty-section { padding: 4px 14px; color: #bbb; font-size: 12px; }

/* Compact form */
.compact-form {
  padding: 4px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.compact-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compact-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  color: #222;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: #2980b9;
}

/* Name rows */
.panel-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
  gap: 6px;
}
.panel-name-row-clickable {
  cursor: pointer;
}
.panel-name-row-clickable:hover {
  background: #f5f7fa;
}
.panel-name-row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.panel-name-type {
  font-size: 11px;
  color: #aaa;
}
.panel-name-star {
  font-size: 12px;
  color: #f0a500;
  flex-shrink: 0;
}
.panel-name-form {
  padding: 4px 14px 8px;
  border-top: 1px solid #eee;
  margin-top: 4px;
}
.panel-name-form-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.btn-cancel {
  background: #f0f0f0;
  color: #555;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.btn-cancel:hover { background: #e0e0e0; }
.btn-sm {
  padding: 3px 8px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-delete {
  background: #fee2e2;
  color: #b91c1c;
}
.btn-delete:hover { background: #fecaca; }

/* Relationships */
.panel-rel-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 14px;
}
.panel-rel-type { font-size: 11px; color: #aaa; white-space: nowrap; }
.panel-rel-person {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  color: #2980b9;
  cursor: pointer;
  text-align: left;
}
.panel-rel-person:hover { text-decoration: underline; }

/* Relation picker */
.panel-relation-picker {
  display: flex;
  gap: 6px;
  padding: 6px 14px;
  flex-wrap: wrap;
  border-bottom: 1px solid #f0f0f0;
}

/* Citations */
.panel-citation-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
}
.panel-citation-main {
  flex: 1;
  min-width: 0;
}
.panel-citation-source {
  font-size: 12px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-citation-detail {
  font-size: 11px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-citation-confidence {
  font-size: 11px;
  flex-shrink: 0;
}
.conf-0 { color: #aaa; }
.conf-1 { color: #ca8a04; }
.conf-2 { color: #ea580c; }
.conf-3 { color: #16a34a; }

/* Groups */
.panel-group-picker-wrap {
  padding: 6px 14px;
  border-bottom: 1px solid #f0f0f0;
}
.panel-group-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
}
.panel-group-link {
  font-size: 12px;
  color: #2563eb;
  text-decoration: none;
}
.panel-group-link:hover { text-decoration: underline; }
</style>
