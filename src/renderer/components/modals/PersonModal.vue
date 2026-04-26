<template>
  <BaseSubPanel
    entity-type="person"
    :title="displayTitle"
    :mode="mode"
    :hide-save="needsChildSexPick"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Entry-mode toggle (always when addRelatedTo is set, so existing-person path is reachable) -->
    <div v-if="addRelatedTo" class="ep-fields">
      <div class="ep-field">
        <div class="ep-seg">
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': entryMode === 'new' }"
            @click="entryMode = 'new'; existingPersonId = null"
          >{{ $t('addRelated.newPerson') }}</button>
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': entryMode === 'existing' }"
            @click="entryMode = 'existing'"
          >{{ $t('addRelated.existingPerson') }}</button>
        </div>
      </div>
    </div>

    <!-- Other-parent picker (only when adding a child/son/daughter to a person who has partner(s)) -->
    <div v-if="isChildMode && partnerOptions.length > 0" class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('addRelated.otherParent') }}</span>
        <select class="ep-input" v-model="secondParentId">
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
        <span class="ep-field-label">{{ addRelatedTo.mode === 'spouse' ? $t('personDetail.coupleSubtype') : $t('relationshipDetail.subtype') }}</span>
        <select class="ep-input" v-model="form.subtype">
          <template v-if="addRelatedTo.mode === 'spouse'">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
          </template>
          <template v-else>
            <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('parentChildSubtypes.' + st) }}</option>
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
          <span class="ep-field-label">{{ addRelatedTo.mode === 'spouse' ? $t('personDetail.coupleSubtype') : $t('relationshipDetail.subtype') }}</span>
          <select class="ep-input" v-model="form.subtype">
            <template v-if="addRelatedTo.mode === 'spouse'">
              <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
            </template>
            <template v-else>
              <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('parentChildSubtypes.' + st) }}</option>
            </template>
          </select>
        </div>

        <div class="ep-field">
          <span class="ep-field-label">{{ $t('persons.name') }}</span>
          <div class="ep-name-row">
            <input
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
import { reactive, ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import EventModal from './EventModal.vue';
import PersonPicker from '../PersonPicker.vue';
import { COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../../constants/eventTypes';
import { useToast } from '../../composables/useToast';

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
interface Person { id: string; sex: string; living: boolean; }

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string | null;
  prefillSurname?: string | null;
  addRelatedTo?: {
    personId: string;
    mode: 'father' | 'mother' | 'spouse' | 'child' | 'son' | 'daughter';
    personSex?: 'M' | 'F' | 'U';
    personSurname?: string;
  } | null;
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

// ── Add-related state ───────────────────────────────────────────────────────
const entryMode = ref<'new' | 'existing'>('new');
const existingPersonId = ref<string | null>(null);
const isChildMode = computed(() => {
  const m = props.addRelatedTo?.mode;
  return m === 'child' || m === 'son' || m === 'daughter';
});
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

function defaultSex(): 'M' | 'F' | 'U' {
  if (!props.addRelatedTo) return 'U';
  const m = props.addRelatedTo.mode;
  if (m === 'father' || m === 'son') return 'M';
  if (m === 'mother' || m === 'daughter') return 'F';
  if (m === 'spouse') {
    if (props.addRelatedTo.personSex === 'M') return 'F';
    if (props.addRelatedTo.personSex === 'F') return 'M';
    return 'U';
  }
  return 'U';
}

function defaultSurname(): string {
  if (props.prefillSurname) return props.prefillSurname;
  return '';
}

function defaultSubtype(): string {
  if (props.addRelatedTo?.mode === 'spouse') return 'unknown';
  if (props.addRelatedTo) return 'biological';
  return '';
}

const form = reactive({
  given_name: '',
  surname: defaultSurname(),
  sex: defaultSex(),
  subtype: defaultSubtype(),
});

const relatedPersonName = ref('');

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

// ── Save ────────────────────────────────────────────────────────────────────
async function handleSave() {
  if (!window.api) return;
  try {
    let person: Person;

    if (savedPersonId.value) {
      // Edit mode
      person = (await window.api.persons.update(savedPersonId.value, {
        sex: form.sex,
      })) as Person;
    } else if (props.addRelatedTo && entryMode.value === 'existing') {
      // Link existing person
      if (!existingPersonId.value) return;
      person = (await window.api.persons.get(existingPersonId.value)) as Person;
    } else {
      // Warn (but allow) when neither name field is filled in.
      if (!form.given_name.trim() && !form.surname.trim()) {
        toast.info(t('persons.missingNameWarning'));
      }
      // Create new person (no embedded event — events are added separately)
      const payload: Record<string, unknown> = {
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
      };

      const result = (await window.api.persons.createWithEvent(payload)) as { person: Person };
      person = result.person;
      savedPersonId.value = person.id;
    }

    // Create relationship (when addRelatedTo is set)
    if (props.addRelatedTo) {
      const targetPersonId = (props.addRelatedTo && entryMode.value === 'existing')
        ? existingPersonId.value!
        : (savedPersonId.value ?? person.id);

      const relData: Record<string, unknown> = {};
      const m = props.addRelatedTo.mode;
      if (m === 'father' || m === 'mother') {
        relData.type = 'parent_child';
        relData.person1_id = targetPersonId;        // parent
        relData.person2_id = props.addRelatedTo.personId; // child
        relData.subtype = form.subtype;
      } else if (m === 'child' || m === 'son' || m === 'daughter') {
        relData.type = 'parent_child';
        relData.person1_id = props.addRelatedTo.personId; // parent
        relData.person2_id = targetPersonId;        // child
        relData.subtype = form.subtype;
      } else {
        relData.type = 'couple';
        relData.person1_id = props.addRelatedTo.personId;
        relData.person2_id = targetPersonId;
        relData.subtype = form.subtype;
      }
      await window.api.relationships.create(relData);

      // Child/son/daughter mode: also link to the second parent (the selected partner) if any.
      if ((m === 'child' || m === 'son' || m === 'daughter') && secondParentId.value && secondParentId.value !== targetPersonId) {
        await window.api.relationships.create({
          type: 'parent_child',
          person1_id: secondParentId.value,
          person2_id: targetPersonId,
          subtype: form.subtype,
        });
      }
    }

    emit('saved', person);
    if (props.addRelatedTo) emit('close');
  } catch (err) {
    console.error('[PersonModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function loadPartners() {
  if (!isChildMode.value) return;
  if (!window.api) return;
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
</script>

<style scoped>
.ep-spacer {
  height: var(--space-sm);
}
</style>
