<template>
  <BaseSubPanel
    entity-type="person"
    :title="displayTitle"
    :mode="mode"
    :hide-save="needsChildSexPick"
    :save-disabled="!canSave"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Entry-mode toggle (always when addRelatedTo is set, so existing-person path is reachable) -->
    <div v-if="addRelatedTo" class="ep-fields">
      <div class="ep-field">
        <p class="entry-mode-helper">{{ $t('addRelated.modeHelper') }}</p>
        <div class="ep-seg">
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': entryMode === 'existing' }"
            @click="entryMode = 'existing'"
          >{{ $t('addRelated.existingPerson') }}</button>
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': entryMode === 'new' }"
            @click="entryMode = 'new'; existingPersonId = null"
          >{{ $t('addRelated.newPerson') }}</button>
        </div>
      </div>
    </div>

    <!-- Other-parent picker (only when adding a child/son/daughter to a person who has partner(s)) -->
    <div v-if="isChildMode && partnerOptions.length > 0" class="ep-fields">
      <div class="ep-field">
        <label class="ep-field-label" for="person-field-1">{{ $t('addRelated.otherParent') }}</label>
        <select id="person-field-1" class="ep-input" v-model="secondParentId">
          <option :value="null">{{ $t('addRelated.noOtherParent') }}</option>
          <option v-for="opt in partnerOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
        </select>
      </div>
    </div>

    <!-- Child-sex picker (only when addRelatedTo.mode === 'child', new-person path, and not yet picked) -->
    <div v-if="needsChildSexPick" class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('persons.sex') }}</span>
        <div class="ep-seg">
          <button
            v-for="[val, key] in SEX_OPTIONS"
            :key="val"
            type="button"
            class="ep-seg-opt"
            @click="pickChildSex(val as 'M' | 'F' | 'U')"
          >{{ $t(childSexLabelKey(val)) }}</button>
        </div>
      </div>
    </div>

    <!-- Existing person picker (only when addRelatedTo + entryMode=existing) -->
    <div v-if="addRelatedTo && entryMode === 'existing'" class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('addRelated.selectPerson') }}</span>
        <PersonPicker
          :model-value="existingPersonId"
          :placeholder="$t('addRelated.searchPlaceholder')"
          @update:model-value="existingPersonId = $event"
        />
      </div>

      <!-- Subtype (existing person path) -->
      <div v-if="addRelatedTo" class="ep-field">
        <label class="ep-field-label" for="person-field-2">{{ addRelatedTo.mode === 'spouse' ? $t('personDetail.coupleSubtype') : $t('relationshipDetail.subtype') }}</label>
        <select id="person-field-2" class="ep-input" v-model="form.subtype">
          <template v-if="addRelatedTo.mode === 'spouse'">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
          </template>
          <template v-else>
            <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">{{ parentChildSubtypeOptionLabel(st) }}</option>
          </template>
        </select>
      </div>
    </div>

    <!-- New person fields (always shown unless addRelatedTo+existing) -->
    <template v-if="!needsChildSexPick && (!addRelatedTo || entryMode === 'new')">
      <!-- Fields -->
      <div class="ep-fields">
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('persons.sex') }}</span>
          <div class="ep-seg">
            <button
              v-for="[val, key] in SEX_OPTIONS"
              :key="val"
              type="button"
              class="ep-seg-opt"
              :class="{ 'ep-seg-opt--on': form.sex === val }"
              @click="form.sex = val as 'M' | 'F' | 'U'"
            >{{ $t(key) }}</button>
          </div>
        </div>
        <!-- Subtype (new person path, when addRelatedTo is set) -->
        <div v-if="addRelatedTo" class="ep-field">
          <label class="ep-field-label" for="person-field-3">{{ addRelatedTo.mode === 'spouse' ? $t('personDetail.coupleSubtype') : $t('relationshipDetail.subtype') }}</label>
          <select id="person-field-3" class="ep-input" v-model="form.subtype">
            <template v-if="addRelatedTo.mode === 'spouse'">
              <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
            </template>
            <template v-else>
              <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">{{ parentChildSubtypeOptionLabel(st) }}</option>
            </template>
          </select>
        </div>

        <div class="ep-field">
          <label class="ep-field-label" for="person-field-4">{{ $t('persons.name') }}</label>
          <div class="ep-name-row">
            <input id="person-field-4"
              ref="givenNameRef"
              class="ep-input ep-input--name"
              v-model="form.given_name"
              :placeholder="$t('persons.givenName')"
            />
            <input
              class="ep-input ep-input--name"
              v-model="form.surname"
              :placeholder="$t('persons.surname')"
            />
          </div>
        </div>

        <!-- Inline birth event (create mode only — when no existing person yet).
             User goal: register birth date/place in the same modal step instead
             of having to open the new person and add a birth event manually.
             Empty fields skip event creation entirely (no toast, no error). -->
        <template v-if="!savedPersonId">
          <div class="ep-field">
            <span class="ep-field-label">{{ $t('persons.birthInline') }}</span>
            <div class="ep-birth-grid">
              <div class="ep-birth-cell">
                <span class="ep-birth-sublabel">{{ $t('events.date') }}</span>
                <SimpleDateInput v-model="birth.date" />
              </div>
              <div class="ep-birth-cell">
                <span class="ep-birth-sublabel">{{ $t('events.place') }}</span>
                <PlacePicker v-model="birth.placeId" :placeholder="$t('events.placePlaceholder')" />
              </div>
            </div>
          </div>
        </template>
      </div>

    </template>

    <!-- Events section (shown only after person is saved) -->
    <template v-if="savedPersonId">
      <div class="ep-sec-header" data-entity="event">
        <div class="ep-sec-left">
          <span class="ep-sec-title">📅 {{ $t('events.title') }}</span>
          <span class="ep-sec-count">{{ events.length }}</span>
        </div>
        <span class="ep-sec-open">›</span>
      </div>
      <div class="ep-sec-content">
        <input
          class="ep-search-input"
          :placeholder="$t('events.searchOrAdd')"
          @click="openAddEvent"
          readonly
        />
        <div
          v-for="ev in events"
          :key="ev.id"
          class="ep-entity-row"
          @click="openEditEvent(ev)"
        >
          <div class="ep-entity-main">
            <div class="ep-entity-name">{{ $t('eventTypes.' + ev.event_type) }}</div>
            <div class="ep-entity-sub">
              {{ ev.date_value || '' }}{{ ev.place_name ? ' · ' + ev.place_name : '' }}
            </div>
          </div>
          <span class="ep-entity-arrow">›</span>
        </div>
      </div>

      <div class="ep-sec-gap"></div>

      <!-- Relationships section -->
      <div class="ep-sec-header" data-entity="relationship">
        <div class="ep-sec-left">
          <span class="ep-sec-title">🔗 {{ $t('relationships.title') }}</span>
          <span class="ep-sec-count">{{ relationships.length }}</span>
        </div>
        <span class="ep-sec-open">›</span>
      </div>
      <div class="ep-sec-content">
        <input class="ep-search-input" :placeholder="$t('relationships.searchOrAdd')" readonly />
        <div v-for="rel in relationships" :key="rel.id" class="ep-entity-row">
          <div class="ep-entity-main">
            <div class="ep-entity-name">{{ rel.label }}</div>
            <div class="ep-entity-sub">{{ rel.sub }}</div>
          </div>
          <span class="ep-entity-arrow">›</span>
        </div>
      </div>
      <div class="ep-spacer"></div>
    </template>

    <!-- Sub-panels -->
    <template #subpanels>
      <EventModal
        v-if="subPanel === 'event'"
        mode="subpanel"
        :person-id="savedPersonId || undefined"
        :editing-event="activeEvent || undefined"
        :default-event-type="defaultEventType"
        @cancel="subPanel = null"
        @close="subPanel = null"
        @saved="onEventSaved"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import EventModal from './EventModal.vue';
import PersonPicker from '../PersonPicker.vue';
import PlacePicker from '../PlacePicker.vue';
import SimpleDateInput from '../SimpleDateInput.vue';
import { COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../../constants/eventTypes';
import { useToast } from '../../composables/useToast';
import { usePersonForm, type AddRelatedTo } from '../../composables/usePersonForm';
import { usePersonValidation } from '../../composables/usePersonValidation';
import { usePersonSave, type Person } from '../../composables/usePersonSave';
import { getParentChildRoleLabel } from '../../utils/relationshipLabels';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const SEX_OPTIONS: [string, string][] = [
  ['M', 'persons.male'],
  ['F', 'persons.female'],
  ['U', 'persons.sexUnknown'],
];

interface EventRow {
  id: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  place_name: string | null;
  cause: string | null;
  description: string;
}

interface RelRow { id: string; label: string; sub: string; }

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string | null;
  prefillSurname?: string | null;
  addRelatedTo?: AddRelatedTo | null;
}>(), {
  mode: 'standalone',
  personId: null,
  prefillSurname: null,
  addRelatedTo: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [person: Person];
}>();

const { t } = useI18n();
const toast = useToast();
const givenNameRef = ref<HTMLInputElement | null>(null);
const savedPersonId = ref<string | null>(props.personId);

// ── Form state (via usePersonForm composable) ─────────────────────────────
const { form, birth } = usePersonForm({
  prefillSurname: props.prefillSurname,
  addRelatedTo: props.addRelatedTo,
});

// ── Add-related state (orchestration, kept inline) ────────────────────────
const entryMode = ref<'new' | 'existing'>('new');
const existingPersonId = ref<string | null>(null);
const isChildMode = computed(() => {
  const m = props.addRelatedTo?.mode;
  return m === 'child' || m === 'son' || m === 'daughter';
});

/**
 * For parent_child subtype dropdowns: direction the *new* (or selected
 * existing) person plays toward the panel host.
 *   father / mother → new person becomes the parent → render parent labels
 *                     ("Fosterförälder", "Adoptivförälder", …)
 *   child / son / daughter → new person becomes the child → render child labels
 *                     ("Fosterbarn", "Adoptivbarn", …)
 */
const parentChildDirection = computed<'parent' | 'child'>(() => {
  const m = props.addRelatedTo?.mode;
  if (m === 'father' || m === 'mother') return 'parent';
  return 'child';
});

function parentChildSubtypeOptionLabel(subtype: string): string {
  return getParentChildRoleLabel(t, parentChildDirection.value, subtype);
}
const childSexPicked = ref(props.addRelatedTo?.mode !== 'child');
const needsChildSexPick = computed(() =>
  props.addRelatedTo?.mode === 'child'
  && entryMode.value === 'new'
  && !childSexPicked.value
);

// Partner candidates for the second-parent picker (only loaded in child mode).
interface PartnerOption { id: string; label: string; }
const partnerOptions = ref<PartnerOption[]>([]);
const secondParentId = ref<string | null>(null);

function childSexLabelKey(val: string): string {
  if (val === 'M') return 'persons.son';
  if (val === 'F') return 'persons.daughter';
  return 'persons.sexUnknown';
}

function pickChildSex(val: 'M' | 'F' | 'U') {
  form.sex = val;
  childSexPicked.value = true;
  nextTick(() => givenNameRef.value?.focus());
}

const relatedPersonName = ref('');

// ── Validation (via usePersonValidation composable) ───────────────────────
const { canSave } = usePersonValidation({
  form,
  savedPersonId,
  hasAddRelatedTo: () => !!props.addRelatedTo,
  entryMode,
  existingPersonId,
});

const displayTitle = computed(() => {
  if (props.addRelatedTo) {
    const m = props.addRelatedTo.mode;
    let base: string;
    if (m === 'father') base = t('personDetail.addFatherTitle');
    else if (m === 'mother') base = t('personDetail.addMotherTitle');
    else if (m === 'spouse') base = t('personDetail.addSpouseTitle');
    else if (m === 'son') base = t('personDetail.addSonTitle');
    else if (m === 'daughter') base = t('personDetail.addDaughterTitle');
    else base = t('personDetail.addChildTitle');
    return relatedPersonName.value
      ? t('persons.titleFor', { title: base, name: relatedPersonName.value })
      : base;
  }
  return [form.given_name, form.surname].filter(Boolean).join(' ') || t('persons.newPerson');
});

async function loadRelatedPersonName() {
  if (!props.addRelatedTo || !window.api) return;
  try {
    const names = (await window.api.persons.getNames(props.addRelatedTo.personId)) as Array<{ given_name: string; surname: string }>;
    const primary = names[0];
    if (primary) relatedPersonName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
  } catch { /* ignore */ }
}

// ── Events + relationships (loaded after person exists) ─────────────────────
const events = ref<EventRow[]>([]);
const relationships = ref<RelRow[]>([]);

async function loadData() {
  if (!savedPersonId.value || !window.api) return;
  try {
    events.value = (await window.api.events.forPerson(savedPersonId.value)) as EventRow[];
    const rels = (await window.api.relationships.getForPerson(savedPersonId.value)) as Array<{
      id: string; type: string; subtype: string | null;
    }>;
    relationships.value = rels.map(r => ({
      id: r.id,
      label: t('relationshipTypes.' + r.type),
      sub: r.subtype ? t('coupleSubtypes.' + r.subtype) : '',
    }));
  } catch { /* ignore */ }
}

const subPanel = ref<'event' | null>(null);
const activeEvent = ref<EventRow | null>(null);
const defaultEventType = ref('birth');

function openAddEvent() {
  defaultEventType.value = 'birth';
  activeEvent.value = null;
  subPanel.value = 'event';
}

function openEditEvent(ev: EventRow) {
  activeEvent.value = ev;
  subPanel.value = 'event';
}

async function onEventSaved() {
  subPanel.value = null;
  await loadData();
}

// ── Save orchestration (via usePersonSave composable) ─────────────────────
const { save: composableSave } = usePersonSave({
  form,
  birth,
  savedPersonIdRef: savedPersonId,
  addRelatedTo: props.addRelatedTo,
  entryMode,
  existingPersonId,
  secondParentId,
  canSave,
  emit: (name, payload) => {
    if (name === 'saved') emit('saved', payload as Person);
    else if (name === 'close') emit('close');
  },
});

async function handleSave() {
  try {
    await composableSave();
  } catch (err) {
    console.error('[PersonModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function loadPartners() {
  if (!isChildMode.value) return;
  if (!window.api) return;
  if (!props.addRelatedTo) return;
  const parentId = props.addRelatedTo.personId;
  try {
    const rels = (await window.api.relationships.getForPerson(parentId)) as Array<{
      id: string; type: string; person1_id: string | null; person2_id: string | null;
    }>;
    const partnerIds = rels
      .filter(r => r.type === 'couple')
      .map(r => r.person1_id === parentId ? r.person2_id : r.person1_id)
      .filter((id): id is string => !!id && id !== parentId);
    const seen = new Set<string>();
    const options: PartnerOption[] = [];
    for (const id of partnerIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const names = (await window.api.persons.getNames(id)) as Array<{ given_name: string; surname: string }>;
      const primary = names[0];
      const label = primary ? [primary.given_name, primary.surname].filter(Boolean).join(' ') : id;
      options.push({ id, label: label || id });
    }
    partnerOptions.value = options;
    if (options.length === 1) secondParentId.value = options[0].id;
  } catch { /* ignore */ }
}

onMounted(async () => {
  await loadData();
  await loadPartners();
  await loadRelatedPersonName();
  nextTick(() => givenNameRef.value?.focus());
});

// Default the Add-relative entry-mode to 'existing' when the database already
// contains other persons — this nudges the user toward "find existing" first
// (the safe path) rather than silently creating a duplicate via "new person".
onMounted(async () => {
  if (props.addRelatedTo && window.api?.persons?.listPage) {
    try {
      const result = await window.api.persons.listPage(1, 0) as { persons: unknown[]; total: number };
      if (result && typeof result.total === 'number' && result.total > 1) {
        entryMode.value = 'existing';
      }
    } catch (err) {
      // If anything fails, default to 'new' (current behavior).
      console.warn('[PersonModal] entry-mode default check failed:', err);
    }
  }
});
</script>

<style scoped>
.ep-spacer {
  height: var(--space-sm);
}
.entry-mode-helper {
  margin: 0 0 var(--space-sm) 0;
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.ep-birth-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-sm);
}
.ep-birth-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.ep-birth-sublabel {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
