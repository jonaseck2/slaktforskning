<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { COUPLE_SUBTYPE_VALUES } from '../constants/eventTypes';
import PersonPicker from './PersonPicker.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  personId: string;
  mode: 'parent' | 'spouse' | 'child';
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const { t } = useI18n();

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

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
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0 0 16px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
input[type='text'],
select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}
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
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}
.modal-actions button[type='submit'] {
  background: #2c3e50;
  color: white;
}
.btn-cancel {
  background: #e0e0e0;
  color: #333;
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
.toggle-btn.active { background: #2c3e50; color: white; }
</style>
