<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-add-related">
      <h3 id="modal-title-add-related">{{ title }}</h3>
      <form @submit.prevent="save">
        <!-- Toggle -->
        <div class="entry-mode-toggle">
          <button type="button" :class="['toggle-btn', { active: entryMode === 'new' }]"
            @click="entryMode = 'new'; existingPersonId = null">
            {{ $t('addRelated.newPerson') }}
          </button>
          <button type="button" :class="['toggle-btn', { active: entryMode === 'existing' }]"
            @click="entryMode = 'existing'">
            {{ $t('addRelated.existingPerson') }}
          </button>
        </div>

        <!-- Existing person -->
        <template v-if="entryMode === 'existing'">
          <label>
            {{ $t('addRelated.selectPerson') }}
            <PersonPicker :model-value="existingPersonId" :placeholder="$t('addRelated.searchPlaceholder')"
              @update:model-value="existingPersonId = $event" />
          </label>
        </template>

        <!-- New person -->
        <template v-else>
          <label>{{ $t('persons.givenName') }}
            <input v-model="form.given_name" type="text" required :placeholder="$t('persons.givenName')" />
          </label>
          <label>{{ $t('persons.surname') }}
            <input v-model="form.surname" type="text" :placeholder="$t('persons.surname')" />
          </label>
          <label>{{ $t('persons.sex') }}
            <select v-model="form.sex">
              <option value="U">{{ $t('persons.sexUnknown') }}</option>
              <option value="M">{{ $t('persons.male') }}</option>
              <option value="F">{{ $t('persons.female') }}</option>
            </select>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.living" />{{ $t('persons.living') }}
          </label>

          <!-- Event fields -->
          <details class="event-section" :open="eventSectionOpen" @toggle="onEventToggle">
            <summary>{{ $t('events.addEvent') }}</summary>
            <EventFormBody
              v-model:event="eventForm"
              v-model:citation="citationForm"
              context="person"
            />
          </details>
        </template>

        <!-- Subtype -->
        <label v-if="mode === 'spouse'">{{ $t('personDetail.coupleSubtype') }}
          <select v-model="form.subtype">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
          </select>
        </label>
        <label v-else>{{ $t('relationshipDetail.subtype') }}
          <select v-model="form.subtype">
            <option v-for="st in PARENT_CHILD_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('parentChildSubtypes.' + st) }}</option>
          </select>
        </label>

        <div class="modal-actions">
          <AppButton variant="secondary" @click="$emit('close')">{{ $t('common.cancel') }}</AppButton>
          <AppButton variant="primary" type="submit" :disabled="entryMode === 'existing' && !existingPersonId">
            {{ entryMode === 'existing' ? $t('personDetail.linkExisting') : $t('personDetail.addAndLink') }}
          </AppButton>
        </div>
      </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import { COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';
import PersonPicker from './PersonPicker.vue';
import EventFormBody from './EventFormBody.vue';
import type { CitationFieldsModel } from './CitationFields.vue';
import { useToast } from '../composables/useToast';
import { useSourceSession } from '../stores/sourceSession';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  personId: string;
  personSex?: 'M' | 'F' | 'U';
  personSurname?: string;
  mode: 'father' | 'mother' | 'spouse' | 'child';
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();

const title = computed(() => {
  if (props.mode === 'father') return t('personDetail.addFatherTitle');
  if (props.mode === 'mother') return t('personDetail.addMotherTitle');
  if (props.mode === 'spouse') return t('personDetail.addSpouseTitle');
  return t('personDetail.addChildTitle');
});

const entryMode = ref<'new' | 'existing'>('new');
const existingPersonId = ref<string | null>(null);

// Compute default sex based on mode
function defaultSex(): 'M' | 'F' | 'U' {
  if (props.mode === 'father') return 'M';
  if (props.mode === 'mother') return 'F';
  if (props.mode === 'spouse') {
    if (props.personSex === 'M') return 'F';
    if (props.personSex === 'F') return 'M';
    return 'U';
  }
  return 'U';
}

// Compute default surname based on mode
function defaultSurname(): string {
  if (props.mode === 'child' && props.personSurname) return props.personSurname;
  return '';
}

const form = reactive({
  given_name: '',
  surname: defaultSurname(),
  sex: defaultSex(),
  living: true,
  subtype: props.mode === 'spouse' ? 'unknown' : 'biological',
});

// Event + citation form state
const eventSectionOpen = ref(false);
const eventForm = reactive({
  event_type: 'birth',
  date_type: 'exact',
  date_value: '',
  date_value_end: '',
  date_original: '',
  place_id: null as string | null,
  description: '',
  cause: '',
});
const citationForm = reactive<CitationFieldsModel>({
  source_id: null,
  page: '',
  confidence: 2,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});

function onEventToggle(e: Event) {
  eventSectionOpen.value = (e.target as HTMLDetailsElement).open;
}

onMounted(async () => {
  if (sourceSession.lastSourceId) {
    citationForm.source_id = sourceSession.lastSourceId;
    if (sourceSession.lastPage) citationForm.page = sourceSession.lastPage;
  }
});

async function save() {
  if (!window.api) return;
  try {
    let targetPersonId: string;
    if (entryMode.value === 'existing') {
      if (!existingPersonId.value) return;
      targetPersonId = existingPersonId.value;
    } else {
      const payload: Record<string, unknown> = {
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
        living: form.living,
      };

      if (eventSectionOpen.value && eventForm.event_type) {
        payload.event = {
          event_type: eventForm.event_type,
          date_type: eventForm.date_type,
          date_value: eventForm.date_value || null,
          date_value_end: eventForm.date_type === 'between' ? (eventForm.date_value_end || null) : null,
          date_original: eventForm.date_original,
          place_id: eventForm.place_id,
          place_name: null,
          description: eventForm.description,
          cause: eventForm.event_type === 'death' ? (eventForm.cause || null) : null,
        };
        if (citationForm.source_id) {
          payload.citation = {
            source_id: citationForm.source_id,
            page: citationForm.page,
            confidence: citationForm.confidence,
            transcription: citationForm.transcription,
            notes: citationForm.notes,
            date_accessed: citationForm.date_accessed,
          };
          sourceSession.setLastUsed(citationForm.source_id, citationForm.page);
        }
      }

      const result = (await window.api.persons.createWithEvent(payload)) as { person: { id: string } };
      targetPersonId = result.person.id;
    }

    const relData: Record<string, unknown> = {};
    if (props.mode === 'father' || props.mode === 'mother') {
      relData.type = 'parent_child';
      relData.person1_id = targetPersonId;   // parent
      relData.person2_id = props.personId;   // child (current person)
      relData.subtype = form.subtype;
    } else if (props.mode === 'child') {
      relData.type = 'parent_child';
      relData.person1_id = props.personId;   // parent (current person)
      relData.person2_id = targetPersonId;   // child
      relData.subtype = form.subtype;
    } else {
      relData.type = 'couple';
      relData.person1_id = props.personId;
      relData.person2_id = targetPersonId;
      relData.subtype = form.subtype;
    }

    await window.api.relationships.create(relData);
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[AddRelatedPersonModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>

<style scoped>
.checkbox-label {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.entry-mode-toggle {
  display: flex;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 4px;
}
.toggle-btn {
  flex: 1;
  padding: 6px 12px;
  background: var(--color-bg-subtle);
  border: none;
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--color-text);
}
.toggle-btn.active { background: var(--color-primary); color: white; }
.event-section {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 8px 12px;
  margin-top: 4px;
}
.event-section > summary {
  cursor: pointer;
  font-weight: 600;
  font-size: var(--font-sm);
  color: var(--color-text);
}
.event-section[open] > :not(summary) {
  margin-top: 8px;
}
</style>
