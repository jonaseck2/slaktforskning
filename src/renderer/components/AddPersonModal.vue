<template>
  <BaseModal @close="emit('close')" title-id="modal-title-add-person">
    <h3 id="modal-title-add-person">+ {{ $t('persons.addPerson') }}</h3>
    <form @submit.prevent="submit">
      <label>{{ $t('persons.givenName') }}
        <input v-model="form.given_name" type="text" required autofocus />
      </label>
      <label>{{ $t('persons.surname') }}
        <input v-model="form.surname" type="text" />
      </label>
      <div class="form-row-2col">
        <label>{{ $t('persons.sex') }}
          <select v-model="form.sex">
            <option value="U">{{ $t('persons.sexUnknown') }}</option>
            <option value="M">{{ $t('persons.male') }}</option>
            <option value="F">{{ $t('persons.female') }}</option>
          </select>
        </label>
        <label class="checkbox-label">
          {{ $t('persons.living') }}
          <div class="checkbox-wrap">
            <input type="checkbox" v-model="form.living" />
            {{ form.living ? $t('personDetail.statusLiving') : $t('personDetail.statusDeceased') }}
          </div>
        </label>
      </div>
      <div class="modal-actions">
        <AppButton variant="secondary" @click="emit('close')">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" type="submit">{{ $t('common.create') }}</AppButton>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Person { id: string; sex: string; living: boolean; }

const emit = defineEmits<{ close: []; saved: [person: Person] }>();

const form = reactive({ given_name: '', surname: '', sex: 'U', living: true });

async function submit() {
  const person = await window.api.persons.create({
    given_name: form.given_name,
    surname: form.surname,
    sex: form.sex,
    living: form.living,
  }) as Person;
  emit('saved', person);
}
</script>
