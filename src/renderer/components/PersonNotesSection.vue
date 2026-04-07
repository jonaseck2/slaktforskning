<template>
  <textarea
    :value="notes"
    rows="3"
    :placeholder="$t('personDetail.notesPlaceholder')"
    @blur="save(($event.target as HTMLTextAreaElement).value)"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

useI18n();

const props = defineProps<{ personId: string }>();

const notes = ref('');

async function load(id: string) {
  const raw = (await window.api.persons.get(id)) as { notes: string | null } | null;
  if (props.personId !== id) return;
  notes.value = raw?.notes ?? '';
}

async function save(value: string) {
  const trimmed = value.trim() || null;
  await window.api.persons.update(props.personId, { notes: trimmed });
  notes.value = trimmed ?? '';
}

watch(() => props.personId, (id) => {
  notes.value = '';
  if (id) load(id);
}, { immediate: true });
</script>
