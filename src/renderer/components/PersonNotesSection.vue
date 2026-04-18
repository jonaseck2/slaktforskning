<template>
  <textarea
    ref="textareaRef"
    :value="notes"
    :rows="rows ?? 3"
    :placeholder="$t('personDetail.notesPlaceholder')"
    :style="savedHeight ? { height: savedHeight + 'px' } : undefined"
    @blur="save(($event.target as HTMLTextAreaElement).value)"
  />
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{ personId: string; rows?: number }>();

const notes = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const savedHeight = ref<number | null>(null);

async function load(id: string) {
  // Capture current height before reload
  if (textareaRef.value) {
    savedHeight.value = textareaRef.value.offsetHeight;
  }
  const raw = (await window.api.persons.get(id)) as { notes: string | null } | null;
  if (props.personId !== id) return;
  notes.value = raw?.notes ?? '';
  // Reapply saved height after DOM update
  if (savedHeight.value) {
    await nextTick();
    if (textareaRef.value) {
      textareaRef.value.style.height = savedHeight.value + 'px';
    }
  }
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
