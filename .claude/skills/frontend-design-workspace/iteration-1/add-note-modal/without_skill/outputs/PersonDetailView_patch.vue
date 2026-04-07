<!-- PATCH: Replace the notes section inside the "Person Details" <section class="detail-section"> -->
<!-- This replaces the existing <label class="notes-label">...</label> block -->

<!-- Before (lines 41-49 in PersonDetailView.vue):
      <label class="notes-label">
        {{ $t('common.notes') }}
        <textarea
          v-model="notesText"
          rows="3"
          :placeholder="$t('personDetail.notesPlaceholder')"
          @blur="saveNotes"
        />
      </label>
-->

<!-- After: -->
      <div class="notes-section-header">
        <span class="notes-label-text">{{ $t('common.notes') }}</span>
        <button type="button" class="btn-add" @click="showAddNoteModal = true">{{ $t('personDetail.editNotes') }}</button>
      </div>
      <div v-if="notesText" class="notes-display">{{ notesText }}</div>
      <div v-else class="empty-hint">{{ $t('personDetail.notesPlaceholder') }}</div>

<!-- Also add the modal at the bottom of the template (alongside other modals): -->
    <AddNoteModal
      v-if="showAddNoteModal"
      :person-id="personId"
      :current-notes="notesText"
      @close="showAddNoteModal = false"
      @saved="onNotesSaved"
    />

<!-- Script additions: -->
<!--
  // Import at top of <script setup>:
  import AddNoteModal from '../components/AddNoteModal.vue';

  // New ref:
  const showAddNoteModal = ref(false);

  // New handler:
  function onNotesSaved(notes: string) {
    notesText.value = notes;
    if (person.value) person.value.notes = notes;
    showAddNoteModal.value = false;
  }
-->

<!-- Style additions (in <style scoped>): -->
<!--
.notes-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  margin-bottom: 4px;
}
.notes-label-text {
  font-size: var(--font-sm);
  font-weight: 600;
  color: #555;
}
.notes-display {
  font-size: var(--font-base);
  white-space: pre-wrap;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 8px;
}
-->
