<template>
  <BaseSubPanel
    entity-type="group"
    :title="form.name || $t('groups.newGroup')"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Fields -->
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('groups.name') }}</span>
        <input
          ref="nameRef"
          class="ep-input"
          v-model="form.name"
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('groups.notes') }}</span>
        <textarea
          class="ep-textarea"
          v-model="form.notes"
          rows="3"
        />
      </div>
    </div>

    <!-- Members section (only after first save) -->
    <template v-if="savedGroupId">
      <div class="ep-sec-header" data-entity="person">
        <div class="ep-sec-left">
          <span class="ep-sec-title">👤 {{ $t('groups.members') }}</span>
          <span class="ep-sec-count">{{ members.length }}</span>
        </div>
        <span class="ep-sec-open">›</span>
      </div>
      <div class="ep-sec-content">
        <div class="ep-search-wrap">
          <input
            class="ep-search-input"
            v-model="memberSearch"
            :placeholder="$t('groups.searchOrAdd')"
            @input="onSearchInput"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
          />
          <!-- Search dropdown -->
          <div v-if="showDropdown && (searchResults.length > 0 || memberSearch === '')" class="ep-search-dropdown">
            <div
              class="ep-search-item ep-search-item--create"
              @mousedown.prevent="openPersonSubpanel"
            >
              + {{ $t('persons.newPerson') }}
            </div>
            <div
              v-for="person in searchResults"
              :key="person.id"
              class="ep-search-item"
              @mousedown.prevent="addMember(person)"
            >
              {{ [person.given_name, person.surname].filter(Boolean).join(' ') || $t('common.unknown') }}
            </div>
          </div>
        </div>
        <!-- Member rows -->
        <div
          v-for="m in members"
          :key="m.person_id"
          class="ep-entity-row"
        >
          <div class="ep-entity-main">
            <div class="ep-entity-name">
              {{ [m.given_name, m.surname].filter(Boolean).join(' ') || $t('common.unknown') }}
            </div>
          </div>
          <button
            type="button"
            class="ep-entity-remove"
            :aria-label="$t('common.remove')"
            @click="removeMember(m.person_id)"
          >×</button>
        </div>
        <div v-if="members.length === 0" class="ep-sec-empty">{{ $t('groups.noMembers') }}</div>
      </div>
      <div class="ep-spacer"></div>
    </template>

    <!-- Sub-panels -->
    <template #subpanels>
      <PersonModal
        v-if="subPanel === 'person'"
        mode="subpanel"
        @cancel="subPanel = null"
        @close="subPanel = null"
        @saved="onPersonSaved"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import PersonModal from './PersonModal.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Group { id: string; name: string; notes: string | null; }
interface MemberRow {
  person_id: string;
  given_name: string | null;
  surname: string | null;
}
interface PersonResult {
  id: string;
  given_name: string | null;
  surname: string | null;
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  editingGroup?: Group | null;
}>(), {
  mode: 'standalone',
  editingGroup: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [group: Group];
}>();

const { t } = useI18n();
const nameRef = ref<HTMLInputElement | null>(null);
const savedGroupId = ref<string | null>(props.editingGroup?.id ?? null);

const form = reactive({
  name: props.editingGroup?.name ?? '',
  notes: props.editingGroup?.notes ?? '',
});

const members = ref<MemberRow[]>([]);
const memberSearch = ref('');
const searchResults = ref<PersonResult[]>([]);
const showDropdown = ref(false);
const subPanel = ref<'person' | null>(null);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

async function loadMembers() {
  if (!savedGroupId.value || !window.api) return;
  try {
    const raw = (await window.api.groups.getLinks(savedGroupId.value)) as Array<{ entity_type: string; entity_id: string }>;
    const rows: MemberRow[] = [];
    for (const m of raw) {
      if (m.entity_type !== 'person') continue;
      const names = (await window.api.persons.getNames(m.entity_id)) as Array<{
        given_name: string | null;
        surname: string | null;
      }>;
      const n = names[0] ?? { given_name: null, surname: null };
      rows.push({ person_id: m.entity_id, given_name: n.given_name, surname: n.surname });
    }
    members.value = rows;
  } catch { /* ignore */ }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (!window.api) return;
    try {
      const q = memberSearch.value.trim();
      const results = (await window.api.persons.search(q)) as PersonResult[];
      // Filter out already-added members
      const memberIds = new Set(members.value.map(m => m.person_id));
      searchResults.value = results.filter(p => !memberIds.has(p.id)).slice(0, 10);
      showDropdown.value = true;
    } catch { /* ignore */ }
  }, 150);
}

async function onSearchFocus() {
  if (!memberSearch.value.trim() && window.api) {
    try {
      const results = (await window.api.persons.search('')) as PersonResult[];
      const memberIds = new Set(members.value.map(m => m.person_id));
      searchResults.value = results.filter(p => !memberIds.has(p.id)).slice(0, 10);
    } catch { /* ignore */ }
  }
  showDropdown.value = true;
}

function onSearchBlur() {
  // Delay to allow mousedown events on dropdown items to fire first
  setTimeout(() => {
    showDropdown.value = false;
  }, 200);
}

async function addMember(person: PersonResult) {
  if (!savedGroupId.value || !window.api) return;
  try {
    await window.api.groups.addLink(savedGroupId.value, 'person', person.id);
    memberSearch.value = '';
    searchResults.value = [];
    showDropdown.value = false;
    await loadMembers();
  } catch { /* ignore */ }
}

async function removeMember(personId: string) {
  if (!savedGroupId.value || !window.api) return;
  try {
    await window.api.groups.removeLinkByEntity(savedGroupId.value, 'person', personId);
    await loadMembers();
  } catch { /* ignore */ }
}

function openPersonSubpanel() {
  showDropdown.value = false;
  memberSearch.value = '';
  subPanel.value = 'person';
}

async function onPersonSaved(person: { id: string }) {
  subPanel.value = null;
  if (savedGroupId.value) {
    await addMember({ id: person.id, given_name: null, surname: null });
    await loadMembers();
  }
}

async function handleSave() {
  if (!window.api || !form.name.trim()) return;
  try {
    let group: Group;
    const payload = {
      name: form.name.trim(),
      notes: form.notes.trim() || null,
    };
    if (savedGroupId.value) {
      group = (await window.api.groups.update(savedGroupId.value, payload)) as Group;
    } else {
      group = (await window.api.groups.create(payload)) as Group;
      savedGroupId.value = group.id;
      // Load members now that we have the group id
      await loadMembers();
    }
    emit('saved', group);
  } catch (err) {
    console.error('[GroupModal] save failed:', err);
  }
}

onMounted(async () => {
  if (savedGroupId.value) {
    await loadMembers();
  }
  nextTick(() => nameRef.value?.focus());
});
</script>

<style scoped>
.ep-search-wrap {
  position: relative;
}
.ep-search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 10;
  max-height: 220px;
  overflow-y: auto;
}
.ep-spacer {
  height: var(--space-sm);
}
.ep-search-item {
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-sm);
  cursor: pointer;
  color: var(--text-primary);
}
.ep-search-item:hover {
  background: var(--surface-hover);
}
.ep-search-item--create {
  color: var(--accent);
  font-weight: 500;
  border-bottom: 1px solid var(--surface-border-subtle);
}
.ep-entity-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-md);
  padding: 0 var(--space-xs);
  line-height: 1;
  flex-shrink: 0;
}
.ep-entity-remove:hover {
  color: var(--error-text);
}
.ep-sec-empty {
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-sm);
  color: var(--text-muted);
}
</style>
