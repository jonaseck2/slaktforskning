<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ $t('personDetail.editNotes') }}</h3>
      <form @submit.prevent="submit">
        <label>
          {{ $t('common.notes') }}
          <textarea
            v-model="noteText"
            rows="5"
            :placeholder="$t('personDetail.notesPlaceholder')"
            autofocus
          />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit">{{ $t('common.save') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  personId: string;
  currentNotes: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', notes: string): void;
}>();

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const noteText = ref(props.currentNotes);

async function submit() {
  await window.api.persons.update(props.personId, { notes: noteText.value });
  emit('saved', noteText.value);
}
</script>
