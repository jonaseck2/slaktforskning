<template>
  <div>
    <SectionEmpty
      v-if="notes.length === 0 && !addChoice"
      :message="$t('notes.empty')"
    />
    <div v-else-if="notes.length > 0" class="notes-list">
      <div
        v-for="n in notes"
        :key="n.id"
        class="note-row clickable-row"
        @click="openEditModal(n)"
      >
        <div class="note-preview">
          <span class="note-text">{{ previewOf(n.text) }}</span>
          <span v-if="n.language" class="note-lang-badge">[{{ n.language }}]</span>
        </div>
        <AppButton
          v-if="!props.readonly"
          variant="ghost"
          size="sm"
          class="unlink-btn"
          :aria-label="$t('a11y.unlinkItem', { item: previewOf(n.text) })"
          :title="$t('notes.unlinkConfirm')"
          @click.stop="askUnlink(n)"
        >
          <IconUnlink :size="14" />
        </AppButton>
      </div>
    </div>

    <!-- Add-choice strip (Skapa ny / Länka befintlig). Opens when the
         parent section's `+ Anteckning` triggers `openAddChoice()`. -->
    <div v-if="!props.readonly && addChoice" class="note-add-choice">
      <AppButton variant="soft" size="sm" @click="openCreateModal">
        {{ $t('notes.addNew') }}
      </AppButton>
      <AppButton variant="soft" size="sm" @click="openPicker">
        {{ $t('notes.linkExisting') }}
      </AppButton>
      <AppButton variant="ghost" size="sm" @click="addChoice = false">
        {{ $t('common.cancel') }}
      </AppButton>
    </div>

    <!-- Note edit/create modal -->
    <NoteModal
      v-if="showModal"
      :editing-note="editingNote"
      @cancel="closeModal"
      @close="closeModal"
      @saved="onNoteSaved"
      @deleted="onNoteDeleted"
    />

    <!-- Note picker (link existing) -->
    <NotePicker
      v-if="showPicker"
      :exclude-ids="notes.map(n => n.id)"
      @picked="onNotePicked"
      @cancel="showPicker = false"
      @close="showPicker = false"
    />

    <ConfirmModal
      :visible="unlink.visible.value"
      :title="$t('notes.unlinkConfirm')"
      :message="$t('notes.unlinkConfirm')"
      tone="warning"
      icon="🔗"
      :confirm-label="$t('common.remove')"
      @cancel="unlink.cancel"
      @confirm="unlink.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import SectionEmpty from './ui/SectionEmpty.vue';
import AppButton from './ui/AppButton.vue';
import IconUnlink from './ui/IconUnlink.vue';
import ConfirmModal from './ConfirmModal.vue';
import NoteModal from './modals/NoteModal.vue';
import NotePicker from './modals/NotePicker.vue';
import { useEntityData } from '../composables/useEntityData';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useToast } from '../composables/useToast';
import type { Note, NoteEntityType } from '../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = withDefaults(defineProps<{
  entityType: NoteEntityType;
  entityId: string;
  readonly?: boolean;
}>(), { readonly: false });

const { t } = useI18n();
const toast = useToast();

const idRef = toRef(props, 'entityId');
const { data, reload } = useEntityData<Note[]>(idRef, async (id) => {
  if (!id || !window.api?.notes) return [];
  return (await window.api.notes.forEntity(props.entityType, id)) as Note[];
});

const notes = computed(() => data.value ?? []);
const count = computed(() => notes.value.length);

// Preview is the first 100 characters of the note text — long enough to
// recognise the note, short enough that the row stays one-line in the
// panel surface. Newlines collapse to single spaces so a paragraph break
// in the middle of the preview doesn't break row layout.
function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= 100) return flat;
  return flat.slice(0, 100) + '…';
}

// ── Add-choice / modal state ────────────────────────────────────────────────

const addChoice = ref(false);
const showModal = ref(false);
const showPicker = ref(false);
const editingNote = ref<Note | null>(null);

function openAddChoice() {
  addChoice.value = true;
}

function openCreateModal() {
  editingNote.value = null;
  addChoice.value = false;
  showModal.value = true;
}

function openEditModal(n: Note) {
  editingNote.value = n;
  showModal.value = true;
}

function openPicker() {
  addChoice.value = false;
  showPicker.value = true;
}

function closeModal() {
  showModal.value = false;
  editingNote.value = null;
}

async function onNoteSaved(saved: Note, wasCreate: boolean) {
  closeModal();
  if (wasCreate && saved?.id) {
    // Auto-link freshly created note to the host entity. NoteModal itself
    // creates the row but doesn't know the host context — we lift it here.
    try {
      await window.api.noteLinks.link(saved.id, props.entityType, props.entityId);
    } catch (err) {
      console.error('[EntityNotesSection] link failed:', err);
      toast.error(t('errors.saveFailed'));
    }
  }
  await reload();
}

async function onNoteDeleted() {
  closeModal();
  await reload();
}

async function onNotePicked(noteId: string) {
  showPicker.value = false;
  try {
    await window.api.noteLinks.link(noteId, props.entityType, props.entityId);
    await reload();
  } catch (err) {
    console.error('[EntityNotesSection] link existing failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

// ── Unlink ──────────────────────────────────────────────────────────────────

const unlink = useDeleteConfirm<Note>(async (n) => {
  try {
    await window.api.noteLinks.unlink(n.id, props.entityType, props.entityId);
    await reload();
  } catch (err) {
    console.error('[EntityNotesSection] unlink failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});

function askUnlink(n: Note) { unlink.ask(n); }

defineExpose({ count, reload, openAddChoice });
</script>

<style scoped>
.notes-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.note-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-bg);
  cursor: pointer;
}

.note-row:hover {
  background: var(--surface-hover);
}

.note-preview {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
}

.note-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--font-sm);
  color: var(--text-primary);
  min-width: 0;
}

.note-lang-badge {
  flex-shrink: 0;
  font-size: var(--font-xs);
  color: var(--text-muted);
  background: var(--surface-hover);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

.unlink-btn {
  flex-shrink: 0;
}

.note-add-choice {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
}
</style>
