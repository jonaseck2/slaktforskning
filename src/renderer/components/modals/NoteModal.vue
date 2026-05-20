<template>
  <BaseSubPanel
    entity-type="note"
    :title="modalTitle"
    :mode="mode"
    :tone="tone"
    :save-disabled="!form.text.trim()"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <label class="ep-field-label" for="note-field-text">{{ $t('notes.text') }}</label>
        <textarea
          id="note-field-text"
          ref="textRef"
          class="ep-textarea"
          v-model="form.text"
          rows="5"
          required
        />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="note-field-lang">{{ $t('notes.language') }}</label>
        <input
          id="note-field-lang"
          class="ep-input"
          v-model="form.language"
          :placeholder="$t('notes.languageHint')"
          maxlength="32"
        />
      </div>

      <!-- Delete row — only when editing an existing note. Cascades unlink
           the note from every entity it is linked to (per T04 ON DELETE
           CASCADE on note_links.note_id). The confirm message spells out
           that cascade so the user isn't surprised. -->
      <div v-if="savedId" class="ep-danger-row">
        <AppButton
          variant="ghost"
          size="sm"
          class="btn-delete-note"
          :aria-label="$t('notes.deleteTitle')"
          @click="askDelete"
        >
          <IconTrash :size="14" />
          <span class="del-label">{{ $t('notes.deleteTitle') }}</span>
        </AppButton>
      </div>
    </div>

    <ConfirmModal
      :visible="confirmDelete"
      :title="$t('notes.deleteTitle')"
      :message="$t('notes.deleteWarning')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="confirmDelete = false"
      @confirm="handleDelete"
    />
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import AppButton from '../ui/AppButton.vue';
import IconTrash from '../ui/IconTrash.vue';
import ConfirmModal from '../ConfirmModal.vue';
import { useToast } from '../../composables/useToast';
import type { Note } from '../../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  editingNote?: Note | null;
  tone?: 'info' | 'warning' | 'danger';
}>(), {
  mode: 'standalone',
  editingNote: null,
  tone: 'info',
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [note: Note, wasCreate: boolean];
  deleted: [id: string];
}>();

const { t } = useI18n();
const toast = useToast();
const textRef = ref<HTMLTextAreaElement | null>(null);
const savedId = ref<string | null>(props.editingNote?.id ?? null);
const confirmDelete = ref(false);

const form = reactive({
  text: props.editingNote?.text ?? '',
  language: props.editingNote?.language ?? '',
});

const modalTitle = computed(() =>
  savedId.value ? t('notes.editTitle') : t('notes.addTitle'),
);

async function handleSave() {
  if (!window.api?.notes) return;
  const trimmedText = form.text.trim();
  if (!trimmedText) return;
  try {
    const payload = {
      text: trimmedText,
      language: form.language.trim(),
    };
    let note: Note;
    const wasCreate = !savedId.value;
    if (savedId.value) {
      note = (await window.api.notes.update(savedId.value, payload)) as Note;
    } else {
      note = (await window.api.notes.create(payload)) as Note;
      savedId.value = note.id;
    }
    emit('saved', note, wasCreate);
  } catch (err) {
    console.error('[NoteModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

function askDelete() {
  if (!savedId.value) return;
  confirmDelete.value = true;
}

async function handleDelete() {
  confirmDelete.value = false;
  if (!savedId.value) return;
  try {
    await window.api.notes.delete(savedId.value);
    emit('deleted', savedId.value);
  } catch (err) {
    console.error('[NoteModal] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

onMounted(() => {
  nextTick(() => textRef.value?.focus());
});
</script>

<style scoped>
.ep-danger-row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-sm);
}

.btn-delete-note {
  color: var(--error-text);
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.del-label {
  font-size: var(--font-sm);
}
</style>
