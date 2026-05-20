<template>
  <BaseSubPanel
    entity-type="relationship"
    :title="displayTitle"
    :mode="mode"
    :save-disabled="!canSave"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- Fields -->
    <div class="ep-fields">
      <!-- Type segmented control -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('common.type') }}</span>
        <div class="ep-seg">
          <button
            v-for="rt in RELATIONSHIP_TYPE_VALUES"
            :key="rt"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.type === rt }"
            @click="selectType(rt)"
          >{{ $t('relTypes.' + rt) }}</button>
        </div>
      </div>

      <!-- Subtype: couple → enum dropdown, parent_child → role-direction dropdown,
           any other type → free-text input (T19.2: sibling / godparent / other
           can have free-form subtype like 'half', 'step', 'best-friend'). -->
      <div v-if="form.type === 'couple'" class="ep-field">
        <label class="ep-field-label" for="relationship-field-1">{{ $t('relationshipDetail.subtype') }}</label>
        <select id="relationship-field-1" class="ep-input" v-model="form.subtype">
          <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">
            {{ $t('coupleSubtypes.' + st) }}
          </option>
        </select>
      </div>
      <div v-else-if="form.type === 'parent_child'" class="ep-field">
        <label class="ep-field-label" for="relationship-field-2">{{ $t('relationshipDetail.subtype') }}</label>
        <select id="relationship-field-2" class="ep-input" v-model="form.subtype">
          <!--
            person1 = parent by DB convention; the dropdown describes
            person1's role toward person2. Use parent-direction labels
            (e.g. "Fosterförälder", "Adoptivförälder") rather than the
            bare modifier "Foster" / "Adopterad".
          -->
          <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">
            {{ parentSubtypeOptionLabel(st) }}
          </option>
        </select>
      </div>
      <div v-else class="ep-field">
        <label class="ep-field-label" for="relationship-field-subtype-free">{{ $t('relationshipDetail.subtype') }}</label>
        <input
          id="relationship-field-subtype-free"
          class="ep-input"
          v-model="form.subtype"
          :placeholder="$t('relationshipDetail.subtypeFreePlaceholder')"
        />
      </div>

      <!-- Person 1 -->
      <div class="ep-field">
        <span class="ep-field-label">{{ person1Label }}</span>
        <PersonPicker
          v-model="form.person1_id"
          :placeholder="$t('relationships.searchPerson')"
          @select="onPerson1Select"
        />
      </div>

      <!-- Person 2 -->
      <div class="ep-field">
        <span class="ep-field-label">{{ person2Label }}</span>
        <PersonPicker
          v-model="form.person2_id"
          :placeholder="$t('relationships.searchPerson')"
          @select="onPerson2Select"
        />
      </div>

      <!-- Notes -->
      <div class="ep-field">
        <label class="ep-field-label" for="relationship-field-3">{{ $t('common.notes') }}</label>
        <textarea id="relationship-field-3"
          class="ep-input"
          v-model="form.notes"
          rows="3"
          :placeholder="$t('relationshipDetail.notesPlaceholder')"
        />
      </div>
    </div>

    <!-- Events section (only visible after first save) -->
    <template v-if="savedRelationshipId">
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
          readonly
          @click="openAddEvent"
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
      <div style="height:8px"></div>

      <!-- Sources section (T13) — citations attached directly to the relationship.
           Citations on events of this relationship live in the per-event citations
           list; this section is for evidence about the relationship itself. -->
      <div class="ep-sec-header" data-entity="citation">
        <div class="ep-sec-left">
          <span class="ep-sec-title">📚 {{ $t('relationshipSources.title') }}</span>
          <span class="ep-sec-count">{{ sourceCount }}</span>
        </div>
        <span class="ep-sec-open">›</span>
      </div>
      <div class="ep-sec-content">
        <input
          class="ep-search-input"
          :placeholder="$t('relationshipSources.add')"
          readonly
          @click="openAddCitation"
        />
        <RelationshipSourcesSection
          ref="sourcesSectionRef"
          :relationship-id="savedRelationshipId!"
          @add-source="openAddCitation"
          @edit-citation="onEditCitation"
        />
      </div>
      <div style="height:8px"></div>
    </template>

    <!-- Sub-panels -->
    <template #subpanels>
      <EventModal
        v-if="subPanel === 'event'"
        mode="subpanel"
        :relationship-id="savedRelationshipId ?? undefined"
        :editing-event="activeEvent || undefined"
        :default-event-type="form.type === 'couple' ? 'marriage' : 'other'"
        @cancel="onWeddingEventClosed"
        @close="onWeddingEventClosed"
        @saved="onWeddingEventSaved"
      />
      <CitationModal
        v-if="subPanel === 'citation' && savedRelationshipId"
        mode="subpanel"
        :relationship-id="savedRelationshipId"
        :editing-citation="editingCitation"
        @close="closeCitationModal"
        @cancel="closeCitationModal"
        @saved="onCitationSaved"
      />
    </template>
  </BaseSubPanel>

  <!-- Wedding offer (Part C of plan 2026-05-04-event-participants-and-marriage-flow).
       After saving a couple+marriage relationship with no linked wedding event
       yet, gently offer to record the wedding inline.
       PRIME DIRECTIVE: nothing is written if the user declines — the relationship
       was already saved before the offer; only the wedding event is in question. -->
  <ConfirmModal
    :visible="!!pendingOffer"
    :title="$t('relationships.offerWeddingTitle')"
    :message="$t('relationships.offerWeddingMessage')"
    tone="info"
    icon="💍"
    :confirm-label="$t('common.yes')"
    :cancel-label="$t('common.notNow')"
    @confirm="onAcceptOffer"
    @cancel="onDeclineOffer"
  />

  <!-- Overlap warning (Part D of plan 2026-05-04-event-participants-and-marriage-flow).
       Before persisting a NEW couple relationship, warn if person1 already has
       an unresolved partnership (no divorce event linked, other partner not
       deceased). The warning is informational; the user can still proceed.
       PRIME DIRECTIVE: nothing is written until the user confirms. Cancel
       leaves the modal open with no DB write. The check never modifies the
       existing relationship — that's what makes it Prime-Directive-safe. -->
  <ConfirmModal
    :visible="!!pendingOverlapWarning"
    :title="$t('relationships.overlapWarningTitle')"
    :message="pendingOverlapWarning ? $t('relationships.overlapWarningMessage', { partnerName: pendingOverlapWarning.partnerName }) : ''"
    tone="warning"
    icon="⚠️"
    :confirm-label="$t('relationships.overlapAddAnyway')"
    :cancel-label="$t('common.cancel')"
    @confirm="onAcceptOverlap"
    @cancel="onCancelOverlap"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import EventModal from './EventModal.vue';
import CitationModal from './CitationModal.vue';
import ConfirmModal from '../ConfirmModal.vue';
import PersonPicker from '../PersonPicker.vue';
import RelationshipSourcesSection, { type CitationRow } from '../RelationshipSourcesSection.vue';
import {
  RELATIONSHIP_TYPE_VALUES,
  COUPLE_SUBTYPE_VALUES,
  PARENT_CHILD_SUBTYPE_VALUES,
} from '../../constants/eventTypes';
import { useToast } from '../../composables/useToast';
import { useRelationshipForm, type RelationshipRow } from '../../composables/useRelationshipForm';
import { useRelationshipValidation } from '../../composables/useRelationshipValidation';
import { useRelationshipSave } from '../../composables/useRelationshipSave';
import { getParentChildRoleLabel } from '../../utils/relationshipLabels';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  editingRelationship?: RelationshipRow | null;
}>(), {
  mode: 'standalone',
  editingRelationship: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [relationship: RelationshipRow];
}>();

const { t } = useI18n();
const toast = useToast();

const savedRelationshipId = ref<string | null>(props.editingRelationship?.id ?? null);

// ── Form state (via useRelationshipForm composable) ───────────────────────
const { form, selectType } = useRelationshipForm({
  editingRelationship: props.editingRelationship,
});

// ── Validation (via useRelationshipValidation composable) ─────────────────
const { canSave } = useRelationshipValidation(form);

// Person names for the display title
const person1Name = ref<string | null>(null);
const person2Name = ref<string | null>(null);

const displayTitle = computed(() => {
  const p1 = person1Name.value;
  const p2 = person2Name.value;
  if (p1 && p2) return `${p1} & ${p2}`;
  if (p1) return p1;
  if (p2) return p2;
  return t('relationships.newRelationship');
});

const person1Label = computed(() => {
  if (form.type === 'parent_child') return t('relationships.parent');
  return t('relationships.person1');
});

const person2Label = computed(() => {
  if (form.type === 'parent_child') return t('relationships.child');
  return t('relationships.person2');
});

function parentSubtypeOptionLabel(subtype: string): string {
  // person1 is the parent; render the option as the parent's role.
  return getParentChildRoleLabel(t, 'parent', subtype);
}

function onPerson1Select(person: { given_name: string; surname: string }) {
  person1Name.value = [person.given_name, person.surname].filter(Boolean).join(' ') || null;
}

function onPerson2Select(person: { given_name: string; surname: string }) {
  person2Name.value = [person.given_name, person.surname].filter(Boolean).join(' ') || null;
}

// Events section
const events = ref<EventRow[]>([]);

async function loadEvents() {
  if (!savedRelationshipId.value || !window.api) return;
  try {
    events.value = (await window.api.events.forRelationship(savedRelationshipId.value)) as EventRow[];
  } catch { /* ignore */ }
}

// Sub-panel state
const subPanel = ref<'event' | 'citation' | null>(null);
const activeEvent = ref<EventRow | null>(null);

function openAddEvent() {
  activeEvent.value = null;
  subPanel.value = 'event';
}

function openEditEvent(ev: EventRow) {
  activeEvent.value = ev;
  subPanel.value = 'event';
}

function closeSubPanel() {
  subPanel.value = null;
  activeEvent.value = null;
}

// ── Sources section (T13) ───────────────────────────────────────────────────
const sourcesSectionRef = ref<InstanceType<typeof RelationshipSourcesSection> | null>(null);
const sourceCount = computed(() => sourcesSectionRef.value?.count ?? 0);
const editingCitation = ref<CitationRow | null>(null);

function openAddCitation() {
  editingCitation.value = null;
  subPanel.value = 'citation';
}
function onEditCitation(cit: CitationRow) {
  editingCitation.value = cit;
  subPanel.value = 'citation';
}
function closeCitationModal() {
  subPanel.value = null;
  editingCitation.value = null;
}
async function onCitationSaved() {
  closeCitationModal();
  await sourcesSectionRef.value?.reload();
}

// Load person names when editing an existing relationship
async function loadPersonNames() {
  if (!window.api) return;
  if (form.person1_id) {
    try {
      const names = (await window.api.persons.getNames(form.person1_id)) as Array<{ given_name: string; surname: string }>;
      if (names.length > 0) {
        person1Name.value = [names[0].given_name, names[0].surname].filter(Boolean).join(' ') || null;
      }
    } catch { /* ignore */ }
  }
  if (form.person2_id) {
    try {
      const names = (await window.api.persons.getNames(form.person2_id)) as Array<{ given_name: string; surname: string }>;
      if (names.length > 0) {
        person2Name.value = [names[0].given_name, names[0].surname].filter(Boolean).join(' ') || null;
      }
    } catch { /* ignore */ }
  }
}

// Wedding offer (Part C of plan 2026-05-04-event-participants-and-marriage-flow).
//
// When the genealogist saves a couple+marriage relationship that has no
// linked wedding event yet, we gently offer to record the wedding inline —
// rather than forcing them to remember to open EventModal afterward. Decline
// writes nothing (Prime Directive); the relationship was already saved
// before the offer is shown.
const pendingOffer = ref<RelationshipRow | null>(null);

// Wedding ceremonies are stored with event_type='marriage' (label "Vigsel")
// in this codebase; 'wedding' (label "Bröllop") also exists. Treat either
// linked event as "already recorded" so we don't pester users.
async function shouldOfferWedding(rel: RelationshipRow): Promise<boolean> {
  if (rel.type !== 'couple' || rel.subtype !== 'marriage') return false;
  if (!window.api) return false;
  try {
    const existing = (await window.api.events.forRelationship(rel.id)) as Array<{ event_type: string }>;
    return !existing.some((e) => e.event_type === 'marriage' || e.event_type === 'wedding');
  } catch {
    return false;
  }
}

function onAcceptOffer() {
  if (!pendingOffer.value) return;
  // Keep pendingOffer set until the EventModal closes so the parent doesn't
  // emit `saved` and tear us down before the user finishes recording the
  // wedding.
  activeEvent.value = null;
  subPanel.value = 'event';
}

function onDeclineOffer() {
  // Decline path — the relationship is already saved, the wedding event is
  // not. Emit `saved` once and finish.
  const rel = pendingOffer.value;
  pendingOffer.value = null;
  if (rel) emit('saved', rel);
}

async function onWeddingEventSaved() {
  const rel = pendingOffer.value;
  pendingOffer.value = null;
  closeSubPanel();
  await loadEvents();
  if (rel) emit('saved', rel);
}

function onWeddingEventClosed() {
  // User cancelled / closed the EventModal during the offer flow. Treat as
  // an implicit decline — relationship stays saved, no wedding event.
  if (pendingOffer.value) {
    const rel = pendingOffer.value;
    pendingOffer.value = null;
    closeSubPanel();
    emit('saved', rel);
    return;
  }
  // Otherwise this is a normal events-section close (Add / Edit Event), not
  // tied to the wedding offer — fall through to the regular handler.
  closeSubPanel();
}

// Overlap warning (Part D of plan 2026-05-04-event-participants-and-marriage-flow).
//
// PRIME DIRECTIVE: this check NEVER writes anything. Cancel keeps the modal
// open with no DB write; Add Anyway proceeds with the create exactly as
// authored. The existing relationship is never auto-modified.
const pendingOverlapWarning = ref<{ partnerName: string } | null>(null);

async function findUnresolvedPartnership(person1Id: string): Promise<{ partnerId: string; partnerName: string } | null> {
  if (!window.api) return null;
  const rels = (await window.api.relationships.getForPerson(person1Id)) as Array<{
    id: string;
    type: string;
    person1_id: string | null;
    person2_id: string | null;
  }>;
  for (const rel of rels.filter((r) => r.type === 'couple')) {
    const otherId = rel.person1_id === person1Id ? rel.person2_id : rel.person1_id;
    if (!otherId) continue;
    // Has the relationship been ended by a divorce event?
    const relEvents = (await window.api.events.forRelationship(rel.id)) as Array<{ event_type: string }>;
    if (relEvents.some((e) => e.event_type === 'divorce')) continue;
    // Has the other partner died?
    const otherEvents = (await window.api.events.forPerson(otherId)) as Array<{ event_type: string }>;
    if (otherEvents.some((e) => e.event_type === 'death')) continue;
    // Unresolved: return name for the warning.
    const names = (await window.api.persons.getNames(otherId)) as Array<{ given_name: string; surname: string }>;
    const primary = names[0];
    const partnerName = primary
      ? [primary.given_name, primary.surname].filter(Boolean).join(' ') || otherId
      : otherId;
    return { partnerId: otherId, partnerName };
  }
  return null;
}

function onAcceptOverlap() {
  pendingOverlapWarning.value = null;
  // Continue the save the user already initiated.
  void performSave();
}

function onCancelOverlap() {
  pendingOverlapWarning.value = null;
}

// ── Save orchestration (via useRelationshipSave composable) ───────────────
//
// The composable owns the core persist. handleSave() runs the modal-specific
// pre-flight (different-persons toast, overlap warning) before invoking it,
// and performSave() runs the modal-specific post-save (wedding offer) after.
const { save: composableSave } = useRelationshipSave({
  form,
  savedRelationshipIdRef: savedRelationshipId,
  canSave,
  emit: (name, payload) => {
    if (name === 'saved') emit('saved', payload as RelationshipRow);
    else if (name === 'close') emit('close');
  },
});

async function handleSave() {
  if (!window.api) return;
  if (!form.person1_id || !form.person2_id) {
    toast.error(t('relationships.pickBothPersons'));
    return;
  }
  if (form.person1_id === form.person2_id) {
    toast.error(t('relationships.differentPersons'));
    return;
  }
  // Overlap warning: only on CREATE of a new couple relationship.
  if (props.editingRelationship === null && form.type === 'couple' && form.person1_id) {
    try {
      const overlap = await findUnresolvedPartnership(form.person1_id);
      if (overlap) {
        pendingOverlapWarning.value = { partnerName: overlap.partnerName };
        return;
      }
    } catch (err) {
      console.warn('[RelationshipModal] overlap check failed:', err);
    }
  }
  await performSave();
}

async function performSave() {
  try {
    const rel = await composableSave();
    if (!rel) return;
    // Marriage offer — only after the relationship is persisted. If the
    // helper returns true we hold the `saved` emit until the user resolves
    // the offer (Yes records a wedding event; No / cancel just finishes).
    if (await shouldOfferWedding(rel)) {
      pendingOffer.value = rel;
      return;
    }
    emit('saved', rel);
  } catch (err) {
    // Surface the underlying error message so the user (and beta tester
    // reports) can see WHY save failed — a silent "Could not save" toast
    // is the worst-case UX. The console.error stays for full stack trace.
    console.error('[RelationshipModal] save failed:', err);
    const detail = (err instanceof Error && err.message) ? err.message : String(err ?? 'unknown');
    // Em-dash separator reads cleanly after the i18n prefix's trailing period
    // ('Could not save. Please try again. — <detail>') instead of the
    // 'Please try again.: <detail>' shape colon-separation produced.
    toast.error(`${t('errors.saveFailed')} — ${detail}`);
  }
}

// Watch person1_id changes to clear name when picker is cleared
watch(() => form.person1_id, (id) => {
  if (!id) person1Name.value = null;
});

watch(() => form.person2_id, (id) => {
  if (!id) person2Name.value = null;
});

onMounted(async () => {
  await loadPersonNames();
  await loadEvents();
});
</script>
