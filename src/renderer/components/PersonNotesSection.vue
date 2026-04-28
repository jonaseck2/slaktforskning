<template>
  <textarea
    ref="textareaRef"
    :value="notes"
    :rows="rows ?? 3"
    :class="{ 'notes-mono': monospaced }"
    :placeholder="$t('personDetail.notesPlaceholder')"
    :style="storedHeight ? { height: storedHeight + 'px' } : undefined"
    @blur="onBlur(($event.target as HTMLTextAreaElement).value)"
    @mouseup="persistHeight"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../composables/useToast';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { useEntityData } from '../composables/useEntityData';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const { t } = useI18n();
const toast = useToast();

const props = defineProps<{ personId: string; rows?: number; monospaced?: boolean }>();

const notes = ref('');
const { textareaRef, storedHeight, persistHeight } = useTextareaHeight('person-notes');

const idRef = computed(() => props.personId ?? null);
const { data } = useEntityData<{ notes: string | null } | null>(idRef, async (id) => {
  return (await window.api.persons.get(id)) as { notes: string | null } | null;
});

// Sync notes ref from loaded data (clears on id change, populates on load)
watch(data, (raw) => {
  notes.value = raw?.notes ?? '';
}, { immediate: true });

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
</script>
