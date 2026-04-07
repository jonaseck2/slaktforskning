<template>
  <BaseModal @close="$emit('close')">
      <h3>{{ title }}</h3>
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
        </template>

        <!-- Subtype — both modes, spouse only -->
        <label v-if="mode === 'spouse'">{{ $t('personDetail.coupleSubtype') }}
          <select v-model="form.subtype">
            <option v-for="st in COUPLE_SUBTYPE_VALUES" :key="st" :value="st">{{ $t('coupleSubtypes.' + st) }}</option>
          </select>
        </label>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit" :disabled="entryMode === 'existing' && !existingPersonId">
            {{ $t('personDetail.addAndLink') }}
          </button>
        </div>
      </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { COUPLE_SUBTYPE_VALUES } from '../constants/eventTypes';
import PersonPicker from './PersonPicker.vue';
import { useToast } from '../composables/useToast';

const props = defineProps<{
  personId: string;
  mode: 'parent' | 'spouse' | 'child';
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();

const title = computed(() => {
  if (props.mode === 'parent') return t('personDetail.addParentTitle');
  if (props.mode === 'spouse') return t('personDetail.addSpouseTitle');
  return t('personDetail.addChildTitle');
});

const entryMode = ref<'new' | 'existing'>('new');
const existingPersonId = ref<string | null>(null);

const form = reactive({
  given_name: '',
  surname: '',
  sex: 'U' as 'M' | 'F' | 'U',
  living: true,
  subtype: 'unknown',
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
    }

    const relData: Record<string, unknown> = {};
    if (props.mode === 'parent') {
      relData.type = 'parent_child';
      relData.person1_id = targetPersonId;   // parent
      relData.person2_id = props.personId;   // child (current person)
      relData.subtype = 'biological';
    } else if (props.mode === 'child') {
      relData.type = 'parent_child';
      relData.person1_id = props.personId;   // parent (current person)
      relData.person2_id = targetPersonId;   // child
      relData.subtype = 'biological';
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
  background: #f8fafc;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #334155;
}
.toggle-btn.active { background: var(--color-primary); color: white; }
</style>
