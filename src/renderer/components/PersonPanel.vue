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
            />
          </div>
          <div class="panel-dates">{{ personDates }}</div>
          <div class="panel-actions">
            <button class="panel-btn" @click="$emit('focus', personId)">
              🌳 {{ $t('panel.showInTree') }}
            </button>
            <router-link :to="'/persons/' + personId" class="panel-link">
              {{ $t('panel.open') }} →
            </router-link>
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
          <EventList :person-id="personId" :readonly="true" />
        </div>
      </div>

      <!-- Relationer section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('relationships')">
          <span class="panel-chevron">{{ sections.relationships ? '▾' : '▸' }}</span>
          {{ $t('panel.relationships') }}
        </button>
        <div v-if="sections.relationships" class="panel-section-body">
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

      <!-- Anteckningar section -->
      <div class="panel-section">
        <button class="panel-section-header" @click="toggleSection('notes')">
          <span class="panel-chevron">{{ sections.notes ? '▾' : '▸' }}</span>
          {{ $t('panel.notes') }}
        </button>
        <div v-if="sections.notes" class="panel-section-body panel-notes">
          {{ person.notes || $t('panel.noNotes') }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import EventList from './EventList.vue';
import PersonName from './PersonName.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();

const props = defineProps<{ personId: string | null }>();
const emit = defineEmits<{
  focus: [id: string];
  select: [id: string];
}>();

// ── Local state ──────────────────────────────────────────────────────────────

interface PersonData { id: string; sex: 'M' | 'F' | 'U'; living: boolean; notes: string | null; birthYear: number | null; deathYear: number | null; }
interface NameData { given_name: string; surname: string; preferred_name: string | null; sort_order: number; }
interface RelRow { id: string; type: string; subtype: string | null; otherId: string | null; otherName: string; }

const person = ref<PersonData | null>(null);
const primaryName = ref<NameData | null>(null);
const relationships = ref<RelRow[]>([]);

// Section open/closed — persisted per key
function loadSection(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`viz-panel-section-${key}`);
  return v === null ? def : v === 'true';
}
const sections = reactive({
  events: loadSection('events', true),
  relationships: loadSection('relationships', false),
  notes: loadSection('notes', false),
});

function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
  localStorage.setItem(`viz-panel-section-${key}`, String(sections[key]));
}

// ── Derived ──────────────────────────────────────────────────────────────────

const SEX_COLORS: Record<string, string> = { M: '#7eb8f7', F: '#f7a5c0', U: '#ccc' };
const sexColor = computed(() => SEX_COLORS[person.value?.sex ?? 'U'] ?? '#ccc');

const personDates = computed(() => {
  const p = person.value;
  if (!p) return '';
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
  return '';
});

const REL_TYPE_LABELS: Record<string, string> = {
  couple: 'Partner', parent_child: 'Förälder/barn', sibling: 'Syskon',
  godparent: 'Fadder', other: 'Annan',
};
function relLabel(rel: RelRow): string {
  return rel.subtype ?? REL_TYPE_LABELS[rel.type] ?? rel.type;
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadPerson(id: string) {
  const raw = (await window.api.persons.get(id)) as { id: string; sex: string; living: boolean; notes: string | null } | null;
  if (!raw) { person.value = null; return; }

  const names = (await window.api.persons.getNames(id)) as NameData[];
  const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
  primaryName.value = sorted[0] ?? null;

  // Get birth/death years from events
  const events = (await window.api.events.forPerson(id)) as Array<{ event_type: string; date_value: string | null }>;
  const birth = events.find(e => e.event_type === 'birth');
  const death = events.find(e => e.event_type === 'death');
  const parseYear = (v: string | null) => v ? parseInt(v.slice(0, 4)) || null : null;

  person.value = {
    id: raw.id,
    sex: raw.sex as 'M' | 'F' | 'U',
    living: raw.living,
    notes: raw.notes,
    birthYear: parseYear(birth?.date_value ?? null),
    deathYear: parseYear(death?.date_value ?? null),
  };

  await loadRelationships(id);
}

async function loadRelationships(id: string) {
  const rels = (await window.api.relationships.forPerson(id)) as Array<{
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
  border-bottom: 1px solid #eee;
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
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-dates {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-btn {
  font-size: 12px;
  padding: 3px 8px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  color: #444;
  white-space: nowrap;
}
.panel-btn:hover { background: #e8e8e8; }
.panel-link {
  font-size: 12px;
  color: #2980b9;
  text-decoration: none;
  white-space: nowrap;
}
.panel-link:hover { text-decoration: underline; }

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
.panel-section-body { padding: 4px 0 8px; }
.panel-empty-section { padding: 4px 14px; color: #bbb; font-size: 12px; }
.panel-notes { padding: 8px 14px; color: #555; white-space: pre-wrap; font-size: 12px; }

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
</style>
