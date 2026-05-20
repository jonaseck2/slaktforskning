<template>
  <BaseSubPanel
    entity-type="name"
    :title="displayTitle"
    :save-label="editingName ? $t('common.save') : $t('common.create')"
    :mode="mode"
    :save-disabled="!canSave || saving"
    @cancel="$emit('cancel')"
    @save="onSaveAttempt"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <!-- Given name -->
      <div class="ep-field">
        <span class="ep-field-label">
          {{ $t('persons.givenName') }}
          <span v-if="givenNameRequired" class="ep-required-asterisk" aria-hidden="true">*</span>
        </span>
        <input
          ref="givenNameRef"
          class="ep-input"
          :class="{ 'ep-input--flash': flashedField === 'given_name' }"
          v-model="form.given_name"
          type="text"
          :placeholder="$t('persons.givenName')"
          :aria-required="givenNameRequired || undefined"
          :aria-invalid="givenNameRequired || undefined"
          :aria-describedby="givenNameRequired ? givenNameHelperId : undefined"
          @keydown.enter.prevent="onSaveAttempt"
        />
        <span class="ep-field-hint">{{ $t('persons.givenNameHint') }}</span>
        <span
          v-if="givenNameRequired"
          :id="givenNameHelperId"
          class="ep-field-required-helper"
        >{{ $t('common.required') }}</span>
      </div>

      <!-- Surname -->
      <div class="ep-field">
        <span class="ep-field-label">
          {{ $t('persons.surname') }}
          <span v-if="surnameRequired" class="ep-required-asterisk" aria-hidden="true">*</span>
        </span>
        <input
          ref="surnameRef"
          class="ep-input"
          :class="{ 'ep-input--flash': flashedField === 'surname' }"
          v-model="form.surname"
          type="text"
          :placeholder="$t('persons.surname')"
          :aria-required="surnameRequired || undefined"
          :aria-invalid="surnameRequired || undefined"
          :aria-describedby="surnameRequired ? surnameHelperId : undefined"
          @keydown.enter.prevent="onSaveAttempt"
        />
        <span
          v-if="surnameRequired"
          :id="surnameHelperId"
          class="ep-field-required-helper"
        >{{ $t('common.required') }}</span>
      </div>

      <!-- Name type segmented (alphabetical by translation) -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('names.nameType') }}</span>
        <div class="ep-seg">
          <button
            v-for="nt in sortedNameTypes"
            :key="nt"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.name_type === nt }"
            @click="onNameTypeChange(nt)"
          >{{ $t('nameTypes.' + nt) }}</button>
        </div>
      </div>

      <!-- Date from — shown for every non-birth name type -->
      <div v-if="form.name_type !== 'birth'" class="ep-field">
        <span class="ep-field-label">{{ $t('names.dateFrom') }}</span>
        <SimpleDateInput v-model="form.date_from" />
        <span class="ep-field-hint">{{ $t('names.dateFromHint') }}</span>
      </div>

      <!-- Preferred name (only for birth names) -->
      <div v-if="form.name_type === 'birth'" class="ep-field">
        <label class="ep-field-label" for="personname-field-1">{{ $t('persons.preferredName') }}</label>
        <input id="personname-field-1"
          class="ep-input"
          v-model="form.preferred_name"
          type="text"
          :placeholder="$t('persons.preferredNamePlaceholder')"
          @keydown.enter.prevent="handleSave"
        />
      </div>

      <!-- Nickname -->
      <div class="ep-field">
        <label class="ep-field-label" for="personname-field-2">{{ $t('persons.nickname') }}</label>
        <input id="personname-field-2"
          class="ep-input"
          v-model="form.nickname"
          type="text"
          :placeholder="$t('persons.nicknamePlaceholder')"
          @keydown.enter.prevent="handleSave"
        />
      </div>

      <!-- Prefix + Suffix (T16: surfaced from buried <details> so they're authorable) -->
      <div class="ep-field-row">
        <div class="ep-field">
          <label class="ep-field-label" for="personname-field-5">{{ $t('names.prefix') }}</label>
          <input id="personname-field-5"
            class="ep-input"
            v-model="form.name_prefix"
            type="text"
            :placeholder="$t('names.prefixPlaceholder')"
            @keydown.enter.prevent="handleSave"
          />
        </div>
        <div class="ep-field">
          <label class="ep-field-label" for="personname-field-6">{{ $t('names.suffix') }}</label>
          <input id="personname-field-6"
            class="ep-input"
            v-model="form.name_suffix"
            type="text"
            :placeholder="$t('names.suffixPlaceholder')"
            @keydown.enter.prevent="handleSave"
          />
        </div>
      </div>

      <!-- Qualifier (T16: surfaced from buried <details>) -->
      <div class="ep-field">
        <label class="ep-field-label" for="personname-field-3">{{ $t('names.qualifier') }}</label>
        <select id="personname-field-3" class="ep-input" v-model="form.name_qualifier">
          <option value="">—</option>
          <option value="patronymic">{{ $t('names.qualifierPatronymic') }}</option>
          <option value="matronymic">{{ $t('names.qualifierMatronymic') }}</option>
          <option value="particle">{{ $t('names.qualifierParticle') }}</option>
        </select>
      </div>

      <!-- Patronymic base (only when qualifier is patronymic/matronymic) -->
      <div v-if="form.name_qualifier === 'patronymic' || form.name_qualifier === 'matronymic'" class="ep-field">
        <label class="ep-field-label" for="personname-field-4">{{ $t('names.patronymicBase') }}</label>
        <input id="personname-field-4"
          class="ep-input"
          v-model="form.patronymic_base"
          type="text"
          :placeholder="$t('names.patronymicBasePlaceholder')"
          @keydown.enter.prevent="handleSave"
        />
      </div>

      <!-- Advanced / rare fields -->
      <details class="ep-details">
        <summary class="ep-details-summary">{{ $t('common.more') }}</summary>

        <!--
          Date to (rare). Hidden for `birth` and `name_change`:
          - birth: a birth name doesn't end; it's superseded by `married` /
            `name_change` rows that have their own date_from.
          - name_change: the name change date marks when the new name took
            effect. The name doesn't expire — the *next* name change ends it.

          PRIME DIRECTIVE: hiding the input is NOT consent to null the value
          on save. If a legacy row was authored with `date_to` filled, the
          save handler builds the payload from `form.date_to` which is still
          populated; we never overwrite it with null based on UI mode. See
          the `name-change-with-legacy-date-to` test.
        -->
        <div v-if="showDateTo" class="ep-field">
          <span class="ep-field-label">{{ $t(dateToLabelKey) }}</span>
          <SimpleDateInput v-model="form.date_to" />
        </div>
      </details>

      <!-- Citations / Hänvisning. Mirrors EventModal's pattern: in add mode
           (no editingName.id yet) we buffer pending citations and persist
           them after the name row is created. In edit mode we attach
           directly to the existing name's id via citations.create with
           person_name_id. -->
      <div class="ep-sec-header" data-entity="citation">
        <div class="ep-sec-left">
          <span class="ep-sec-title">📖 {{ $t('citations.title') }}</span>
          <span class="ep-sec-count">{{ allCitationRows.length }}</span>
        </div>
        <button type="button" class="ep-sec-action" @click="openAddCitation">
          + {{ $t('sourceDetail.addCitation') }}
        </button>
      </div>
      <div class="ep-sec-content">
        <div v-if="allCitationRows.length === 0" class="ep-sec-empty">{{ $t('empty.citations') }}</div>
        <div
          v-for="cit in allCitationRows"
          :key="cit.key"
          class="ep-entity-row"
          @click="cit.isPending ? openEditPendingCitation(cit.id) : openEditCitation(cit.id)"
        >
          <div class="ep-entity-main">
            <div class="ep-entity-name">
              <span v-if="cit.confidence != null" :class="'confidence-badge confidence-' + cit.confidence">
                {{ $t('confidenceLevels.' + cit.confidence) }}
              </span>
              <LinkedText v-if="cit.page" :text="cit.page" class="ep-cit-page" />
              <span v-else class="ep-cit-page">{{ $t('citations.noPage') }}</span>
            </div>
            <div class="ep-entity-sub">{{ cit.sourceTitle }}</div>
          </div>
          <button
            type="button"
            class="btn-sm btn-delete"
            style="flex-shrink:0"
            :aria-label="$t('common.remove')"
            @click.stop="cit.isPending ? removePendingCitation(cit.id) : deleteCitation(cit.id)"
          >✕</button>
        </div>
      </div>
    </div>

    <!-- Sub-panels -->
    <template #subpanels>
      <CitationModal
        v-if="subPanel === 'citation'"
        mode="subpanel"
        :person-name-id="savedNameId || undefined"
        :editing-citation="editingCitation"
        :defer="!savedNameId"
        :editing-pending="editingPendingCitation"
        @deferred-save="onPendingCitationSaved"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onCitationSaved"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import BaseSubPanel from './BaseSubPanel.vue';
import CitationModal, { type DeferredCitationPayload } from './CitationModal.vue';
import SimpleDateInput from '../SimpleDateInput.vue';
import LinkedText from '../LinkedText.vue';
import { usePersonNameForm } from '../../composables/usePersonNameForm';
import { usePersonNameValidation } from '../../composables/usePersonNameValidation';
import { usePersonNameSave } from '../../composables/usePersonNameSave';
import { NAME_TYPE_VALUES } from '../../constants/eventTypes';
import { pickDisplayedName } from '../../utils/nameUtils';
import type { NameRow } from '../PersonNamesTable.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId: string;
  editingName?: NameRow | null;
  defaultSurname?: string;
  defaultGivenName?: string;
}>(), {
  mode: 'standalone',
  editingName: null,
  defaultSurname: undefined,
  defaultGivenName: undefined,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();

// Name types alphabetically sorted by translation in the current locale.
const sortedNameTypes = computed(() => {
  return [...NAME_TYPE_VALUES].sort((a, b) =>
    t('nameTypes.' + a).localeCompare(t('nameTypes.' + b))
  );
});
const givenNameRef = ref<HTMLInputElement | null>(null);
const surnameRef = ref<HTMLInputElement | null>(null);

// ── Form state (via usePersonNameForm composable) ─────────────────────────
const { form } = usePersonNameForm({
  editingName: props.editingName,
  defaultGivenName: props.defaultGivenName,
  defaultSurname: props.defaultSurname,
  editingNameSource: () => props.editingName,
});

// ── Prefill given_name + surname from the most-recent existing name ──────
//
// User goal: when adding a name to a person who already has prior names,
// open with both fields pre-populated from the displayed name (today's
// behaviour for surname; new for given_name). The user can then edit just
// the parts that change for the new name event.
//
// PRIME DIRECTIVE: this is a *suggestion*, never persisted on its own. The
// save handler writes exactly what's in the form fields when the user
// presses Save (or Cancel writes nothing).
async function prefillFromCurrentName() {
  if (props.editingName) return;
  if (form.given_name || form.surname) return; // already has values (caller-supplied or user-typed)
  if (!window.api) return;
  try {
    const [namesResp, eventsResp] = await Promise.all([
      window.api.persons.getNames(props.personId) as Promise<Array<NameRow & { date_from: string | null }>>,
      window.api.events.forPerson(props.personId) as Promise<Array<{ event_type: string; date_value: string | null }>>,
    ]);
    if (namesResp.length === 0) return;
    const current = pickDisplayedName(namesResp, eventsResp);
    if (!current) return;
    form.given_name = current.given_name ?? '';
    form.surname = current.surname ?? '';
  } catch { /* ignore */ }
}

// Visibility + label of the optional Date-to field, by name type.
// `birth` and `name_change` hide it (a birth name doesn't end, and a
// name-change row's "end" is implied by the next change). `married` keeps
// the generic "Valid until" wording. `alias` / `aka` use "Used until" since
// those names live for a period rather than being formally retired.
const showDateTo = computed(() => form.name_type !== 'birth' && form.name_type !== 'name_change');
const dateToLabelKey = computed(() => {
  if (form.name_type === 'alias' || form.name_type === 'aka') return 'names.dateToUsed';
  return 'names.dateTo';
});

/**
 * Switching to `married` or `name_change` on a freshly-opened add form
 * pre-fills given_name + surname from the current displayed name so the
 * user can edit just the parts that change.
 */
async function onNameTypeChange(nt: string) {
  form.name_type = nt;
  if (props.editingName) return; // edit mode → no prefill
  if (nt !== 'married' && nt !== 'name_change') return;
  if (form.given_name || form.surname) return; // user already typed
  try {
    const [namesResp, eventsResp] = await Promise.all([
      window.api.persons.getNames(props.personId) as Promise<Array<NameRow & { date_from: string | null }>>,
      window.api.events.forPerson(props.personId) as Promise<Array<{ event_type: string; date_value: string | null }>>,
    ]);
    if (namesResp.length === 0) return;
    const current = pickDisplayedName(namesResp, eventsResp);
    if (!current) return;
    form.given_name = current.given_name ?? '';
    form.surname = current.surname ?? '';
    form.preferred_name = current.preferred_name ?? '';
  } catch { /* ignore */ }
}

const personName = ref('');

const displayTitle = computed(() => {
  const full = [form.given_name, form.surname].filter(Boolean).join(' ');
  if (full) return full;
  const base = props.editingName ? t('personDetail.editNameTitle') : t('personDetail.addNameTitle');
  return personName.value ? t('persons.titleFor', { title: base, name: personName.value }) : base;
});

async function loadPersonName() {
  if (!window.api) return;
  try {
    const names = (await window.api.persons.getNames(props.personId)) as Array<{ given_name: string; surname: string }>;
    const primary = names[0];
    if (primary) personName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
  } catch { /* ignore */ }
}

// ---- Citation flow (kept inline; uses citations.forPersonName, not the
// EventModal-shaped citations.forEvent — distinct IPC channels make the
// generalized composable not a fit yet) -----------------------------------
//
// `savedNameId` is the id of the persisted person_names row the citation
// attaches to. In edit mode it's set immediately from props; in add mode
// it remains null until handleSave creates the row, at which point any
// pending citations are flushed.
const savedNameId = ref<string | null>(props.editingName?.id ?? null);

watch(() => props.editingName, (n) => {
  savedNameId.value = n?.id ?? null;
});

interface CitationRow { id: string; sourceTitle: string; page: string | null; confidence: number | null; }
interface EditingCitation {
  id: string;
  page: string;
  confidence: number;
  transcription: string;
  notes: string;
  date_accessed: string;
}
const citations = ref<CitationRow[]>([]);
const pendingCitations = ref<DeferredCitationPayload[]>([]);

const subPanel = ref<'citation' | null>(null);
const editingCitation = ref<EditingCitation | null>(null);
const editingPendingCitation = ref<DeferredCitationPayload | null>(null);

function openAddCitation() {
  editingCitation.value = null;
  editingPendingCitation.value = null;
  subPanel.value = 'citation';
}

async function openEditCitation(citationId: string) {
  if (!window.api) return;
  try {
    const c = (await window.api.citations.get(citationId)) as EditingCitation | null;
    if (!c) return;
    editingCitation.value = c;
    editingPendingCitation.value = null;
    subPanel.value = 'citation';
  } catch { /* ignore */ }
}

function openEditPendingCitation(tempId: string) {
  const found = pendingCitations.value.find((c) => c.tempId === tempId);
  if (!found) return;
  editingCitation.value = null;
  editingPendingCitation.value = found;
  subPanel.value = 'citation';
}

function closeSubPanel() {
  subPanel.value = null;
  editingCitation.value = null;
  editingPendingCitation.value = null;
}

async function loadCitations() {
  if (!savedNameId.value || !window.api) return;
  try {
    const raw = (await window.api.citations.forPersonName(savedNameId.value)) as Array<{
      id: string; source_id: string; page: string | null; confidence: number | null;
    }>;
    const rows: CitationRow[] = [];
    for (const c of raw) {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      rows.push({
        id: c.id,
        sourceTitle: src?.title ?? c.source_id,
        page: c.page,
        confidence: c.confidence,
      });
    }
    citations.value = rows;
  } catch { /* ignore */ }
}

async function onCitationSaved() {
  closeSubPanel();
  await loadCitations();
}

function onPendingCitationSaved(payload: DeferredCitationPayload) {
  if (payload.tempId) {
    const i = pendingCitations.value.findIndex((c) => c.tempId === payload.tempId);
    if (i >= 0) pendingCitations.value.splice(i, 1, payload);
  } else {
    pendingCitations.value.push({
      ...payload,
      tempId: 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    });
  }
  closeSubPanel();
}

function removePendingCitation(tempId: string) {
  const i = pendingCitations.value.findIndex((c) => c.tempId === tempId);
  if (i >= 0) pendingCitations.value.splice(i, 1);
}

interface MergedCitationRow {
  key: string;
  id: string;
  isPending: boolean;
  sourceTitle: string;
  page: string | null;
  confidence: number | null;
}
const allCitationRows = computed<MergedCitationRow[]>(() => {
  const saved = citations.value.map((c): MergedCitationRow => ({
    key: 'saved:' + c.id,
    id: c.id,
    isPending: false,
    sourceTitle: c.sourceTitle,
    page: c.page,
    confidence: c.confidence,
  }));
  const pending = pendingCitations.value.map((c): MergedCitationRow => ({
    key: 'pending:' + (c.tempId ?? ''),
    id: c.tempId ?? '',
    isPending: true,
    sourceTitle: c.sourceTitle,
    page: c.page,
    confidence: c.confidence,
  }));
  return [...saved, ...pending];
});

async function deleteCitation(id: string) {
  if (!window.api) return;
  try {
    await window.api.citations.delete(id);
    await loadCitations();
  } catch { /* ignore */ }
}

// ── Validation (via usePersonNameValidation composable) ───────────────────
const { validation, canSave } = usePersonNameValidation(form);

const givenNameRequired = computed(() => !validation.value.ok);
const surnameRequired = computed(() => !validation.value.ok);

const givenNameHelperId = `${useId()}-given-required`;
const surnameHelperId = `${useId()}-surname-required`;

const flashedField = ref<'given_name' | 'surname' | null>(null);
function flashField(field: 'given_name' | 'surname') {
  flashedField.value = field;
  setTimeout(() => {
    if (flashedField.value === field) flashedField.value = null;
  }, 1500);
  const el = field === 'given_name' ? givenNameRef.value : surnameRef.value;
  el?.focus();
}

// ── Save orchestration (via usePersonNameSave composable) ─────────────────
const { save: composableSave, saving } = usePersonNameSave({
  form,
  pendingCitations: pendingCitations as unknown as Parameters<typeof usePersonNameSave>[0]['pendingCitations'],
  savedNameIdRef: savedNameId,
  personId: props.personId,
  isEdit: () => !!props.editingName,
  canSave,
  emit: (name) => {
    if (name === 'saved') emit('saved');
    else if (name === 'close') emit('close');
  },
});

async function handleSave() {
  try {
    await composableSave();
  } catch (err) {
    console.error('[PersonNameModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

// BaseSubPanel applies `:disabled` to the save button, so a normal mouse
// click on a disabled button never reaches us. Keyboard / screen-reader
// users CAN dispatch click events on `aria-disabled` buttons; this handler
// also catches the Enter-key path bound on each input.
function onSaveAttempt() {
  if (!validation.value.ok) {
    const field = validation.value.firstFailField;
    if (field) flashField(field);
    // The composable returns i18n keys; the modal translates here so the
    // composable stays test-friendly without an i18n provider.
    toast.error(t(validation.value.firstFailReason));
    return;
  }
  void handleSave();
}

onMounted(async () => {
  await loadPersonName();
  await prefillFromCurrentName();
  await loadCitations();
  await nextTick();
  givenNameRef.value?.focus();
});
</script>

<style scoped>
.ep-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}
.ep-details {
  margin-top: var(--space-xs);
}
.ep-details-summary {
  font-size: var(--font-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--space-xs) 0;
  user-select: none;
}
.ep-details-summary:hover {
  color: var(--text-secondary);
}
.ep-details[open] .ep-details-summary {
  margin-bottom: var(--space-sm);
}
.ep-field-hint {
  display: block;
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: var(--space-xs);
}
.ep-required-asterisk {
  color: var(--error-text);
  font-weight: 700;
  margin-left: 2px;
}
.ep-field-required-helper {
  display: block;
  font-size: var(--font-xs);
  color: var(--error-text);
  font-weight: 600;
  margin-top: var(--space-xs);
}
.ep-input--flash {
  border-color: var(--error-text) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--error-text) 30%, transparent) !important;
  animation: ep-input-flash 1.5s ease-out;
}
@keyframes ep-input-flash {
  0%   { background: color-mix(in srgb, var(--error-text) 12%, var(--surface-bg)); }
  100% { background: var(--surface-bg); }
}
</style>
