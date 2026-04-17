<template>
  <BaseModal @close="$emit('close')" title-id="modal-title-name">
      <h3 id="modal-title-name">{{ name ? $t('personDetail.editNameTitle') : $t('personDetail.addNameTitle') }}</h3>
      <form @submit.prevent="save">
        <label>
          {{ $t('persons.givenName') }}
          <input v-model="form.given_name" type="text" required autofocus />
          <small class="field-hint">{{ $t('persons.givenNameHint') }}</small>
        </label>
        <label>
          {{ $t('persons.surname') }}
          <input v-model="form.surname" type="text" />
        </label>
        <label>
          {{ $t('common.type') }}
          <select v-model="form.name_type">
            <option v-for="nt in NAME_TYPE_VALUES" :key="nt" :value="nt">
              {{ $t('nameTypes.' + nt) }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('names.prefix') }}
          <input v-model="form.name_prefix" type="text" :placeholder="$t('names.prefixPlaceholder')" />
        </label>
        <label>
          {{ $t('names.suffix') }}
          <input v-model="form.name_suffix" type="text" :placeholder="$t('names.suffixPlaceholder')" />
        </label>
        <label>
          {{ $t('names.qualifier') }}
          <select v-model="form.name_qualifier">
            <option value="">—</option>
            <option value="patronymic">{{ $t('names.qualifierPatronymic') }}</option>
            <option value="matronymic">{{ $t('names.qualifierMatronymic') }}</option>
            <option value="particle">{{ $t('names.qualifierParticle') }}</option>
          </select>
        </label>
        <label v-if="form.name_qualifier === 'patronymic' || form.name_qualifier === 'matronymic'">
          {{ $t('names.patronymicBase') }}
          <input v-model="form.patronymic_base" type="text" :placeholder="$t('names.patronymicBasePlaceholder')" />
        </label>
        <label v-if="form.name_type === 'birth'">
          {{ $t('persons.preferredName') }}
          <input v-model="form.preferred_name" type="text" :placeholder="$t('persons.preferredNamePlaceholder')" />
        </label>
        <label>
          {{ $t('persons.nickname') }}
          <input v-model="form.nickname" type="text" :placeholder="$t('persons.nicknamePlaceholder')" />
        </label>
        <div class="modal-actions">
          <AppButton variant="secondary" @click="$emit('close')">{{ $t('common.cancel') }}</AppButton>
          <AppButton variant="primary" type="submit">{{ name ? $t('common.save') : $t('common.create') }}</AppButton>
        </div>
      </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import { NAME_TYPE_VALUES } from '../constants/eventTypes';
import { parseAsteriskNotation } from '../utils/nameUtils';
import type { NameRow } from './PersonNamesTable.vue';

const props = defineProps<{
  personId: string;
  name: NameRow | null;
  defaultSurname?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const form = reactive({
  given_name: '',
  surname: '',
  name_type: 'married',
  name_prefix: '',
  name_suffix: '',
  name_qualifier: '',
  patronymic_base: '',
  preferred_name: '',
  nickname: '',
});

watch(() => props.name, (n) => {
  form.given_name = n?.given_name ?? '';
  form.surname = n?.surname ?? (props.defaultSurname || '');
  form.name_type = n?.name_type ?? 'married';
  form.name_prefix = n?.name_prefix ?? '';
  form.name_suffix = n?.name_suffix ?? '';
  form.name_qualifier = n?.name_qualifier ?? '';
  form.patronymic_base = n?.patronymic_base ?? '';
  form.preferred_name = n?.preferred_name ?? '';
  form.nickname = n?.nickname ?? '';
}, { immediate: true });

async function save() {
  const { given_name: parsedGiven, preferred_name: parsedPreferred } = parseAsteriskNotation(form.given_name);
  const resolvedPreferred = form.preferred_name || parsedPreferred || null;
  const payload = {
    given_name: parsedGiven,
    surname: form.surname,
    name_type: form.name_type,
    name_prefix: form.name_prefix || null,
    name_suffix: form.name_suffix || null,
    name_qualifier: form.name_qualifier || null,
    patronymic_base: form.patronymic_base || null,
    preferred_name: resolvedPreferred,
    nickname: form.nickname || null,
  };
  if (props.name) {
    await window.api.persons.updateName(props.name.id, payload);
  } else {
    await window.api.persons.addName(props.personId, payload);
  }
  emit('saved');
  emit('close');
}
</script>
