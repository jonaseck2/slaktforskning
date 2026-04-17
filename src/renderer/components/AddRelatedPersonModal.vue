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

          <!-- Birth fields -->
          <details class="birth-section">
            <summary>{{ $t('eventTypes.birth') }}</summary>
            <label>{{ $t('addRelated.birthDate') }}
              <input v-model="birthForm.date_value" type="date" />
            </label>
            <label>{{ $t('addRelated.originalDate') }}
              <input v-model="birthForm.date_original" type="text" :placeholder="$t('addRelated.originalDate')" />
            </label>
            <label>{{ $t('addRelated.birthPlace') }}
              <PlacePicker v-model="birthForm.place_id" />
            </label>
            <label>{{ $t('citations.source') }}
              <SourcePicker v-model="birthSourceForm.source_id" />
            </label>
            <label>{{ $t('addRelated.page') }}
              <input v-model="birthSourceForm.page" type="text" :placeholder="$t('addRelated.page')" />
            </label>
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
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit" :disabled="entryMode === 'existing' && !existingPersonId">
            {{ entryMode === 'existing' ? $t('personDetail.linkExisting') : $t('personDetail.addAndLink') }}
          </button>
        </div>
      </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { COUPLE_SUBTYPE_VALUES, PARENT_CHILD_SUBTYPE_VALUES } from '../constants/eventTypes';
import PersonPicker from './PersonPicker.vue';
import PlacePicker from './PlacePicker.vue';
import SourcePicker from './SourcePicker.vue';
import { useToast } from '../composables/useToast';
import { useBirthEventCreation } from '../composables/useBirthEventCreation';
import { useSourceSession } from '../stores/sourceSession';

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
const { createBirthEvent } = useBirthEventCreation();
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

// Birth form state
const birthForm = reactive({
  date_value: '',
  date_original: '',
  place_id: null as string | null,
});
const birthSourceForm = reactive({ source_id: null as string | null, page: '' });

onMounted(async () => {
  if (sourceSession.lastSourceId) {
    birthSourceForm.source_id = sourceSession.lastSourceId;
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
      const newPerson = (await window.api.persons.create({
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
        living: form.living,
      })) as { id: string };
      targetPersonId = newPerson.id;

      // Create birth event if any birth data was provided
      await createBirthEvent(targetPersonId, {
        date_value: birthForm.date_value || undefined,
        date_original: birthForm.date_original || undefined,
        place_id: birthForm.place_id,
        source_id: birthSourceForm.source_id || undefined,
        page: birthSourceForm.page || undefined,
      });
      if (birthSourceForm.source_id) {
        sourceSession.setLastUsed(birthSourceForm.source_id, birthSourceForm.page);
      }
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
  border: 1px solid #cbd5e1;
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
.birth-section {
  border: 1px solid var(--color-border, #ddd);
  border-radius: 6px;
  padding: 8px 12px;
  margin-top: 4px;
}
.birth-section summary {
  cursor: pointer;
  font-weight: 600;
  font-size: var(--font-sm);
  color: var(--color-text);
}
.birth-section > label,
.birth-section > .checkbox-label {
  margin-top: 8px;
}
</style>
