<!-- Patch: notes section inside the "Person Details" detail-section (lines 16–50 of PersonDetailView.vue) -->
<!-- Shows only the modified section. The rest of the file is unchanged. -->

    <!-- Person Details -->
    <section class="detail-section">
      <div class="section-header">
        <h4>{{ $t('personDetail.detailsTitle') }}</h4>
      </div>
      <div class="field-grid">
        <label>
          {{ $t('persons.sex') }}
          <select
            :class="'sex-select sex-' + editSex"
            v-model="editSex"
            @change="updateSex(editSex)"
          >
            <option value="M">{{ $t('sex.M') }}</option>
            <option value="F">{{ $t('sex.F') }}</option>
            <option value="U">{{ $t('sex.U') }}</option>
          </select>
        </label>
        <label>
          {{ $t('personDetail.statusLabel') }}
          <select v-model="editLiving" @change="updateLiving(editLiving)">
            <option :value="1">{{ $t('personDetail.statusLiving') }}</option>
            <option :value="0">{{ $t('personDetail.statusDeceased') }}</option>
          </select>
        </label>
      </div>
      <!-- Notes row: label + "Add Note" button side by side, textarea below -->
      <div class="notes-header">
        <span class="notes-label-text">{{ $t('common.notes') }}</span>
        <button type="button" class="btn-add" @click="showAddNoteModal = true">
          + {{ $t('personDetail.addNote') }}
        </button>
      </div>
      <textarea
        v-model="notesText"
        rows="3"
        :placeholder="$t('personDetail.notesPlaceholder')"
        @blur="saveNotes"
      />
    </section>

    <!-- Add Note Modal -->
    <AddNoteModal
      v-if="showAddNoteModal"
      :person-id="personId"
      :initial-notes="notesText"
      @close="showAddNoteModal = false"
      @saved="onNoteSaved"
    />

<!--
  === Script additions (to be merged into <script setup> in PersonDetailView.vue) ===

  1. Import:
       import AddNoteModal from '../components/AddNoteModal.vue';

  2. Reactive state:
       const showAddNoteModal = ref(false);

  3. Handler:
       function onNoteSaved(notes: string) {
         notesText.value = notes;
         if (person.value) person.value.notes = notes;
       }

  === Style additions (to be merged into <style scoped>) ===

  .notes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    margin-bottom: 4px;
  }
  .notes-label-text {
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--color-text-muted);
  }
-->
