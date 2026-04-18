<template>
  <textarea
    ref="textareaRef"
    :value="notes"
    :rows="rows ?? 3"
    :placeholder="$t('personDetail.notesPlaceholder')"
    :style="storedHeight ? { height: storedHeight + 'px' } : undefined"
    @blur="onBlur(($event.target as HTMLTextAreaElement).value)"
    @mouseup="persistHeight"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';
import { useTextareaHeight } from '../composables/useTextareaHeight';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{ personId: string; rows?: number }>();

const notes = ref('');
const { textareaRef, storedHeight, persistHeight } = useTextareaHeight('person-notes');

async function load(id: string) {
  const raw = (await window.api.persons.get(id)) as { notes: string | null } | null;
  if (props.personId !== id) return;
  notes.value = raw?.notes ?? '';
}

function onBlur(value: string) {
  persistHeight();
  save(value);
}

async function save(value: string) {
  const trimmed = value.trim();
  try {
    await window.api.persons.update(props.personId, { notes: trimmed });
    notes.value = trimmed;
  } catch (err) {
    console.error('[PersonNotesSection] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

watch(() => props.personId, (id) => {
  notes.value = '';
  if (id) load(id);
}, { immediate: true });
</script>
