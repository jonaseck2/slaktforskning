<!--
  Not migrated to EntityPanel: ExportOptionsPanel is NOT a right-side panel.
  It is an embedded options form rendered inline inside GedcomExportSection
  (a card on the Settings → Export tab), not a panel hosted by a list view
  with a drag handle. The "Panel" suffix is historical naming. EntityPanel's
  collapse-button / role-label / surface-radius shell would be wrong here:
  there is no entity, no close affordance, and no list-view parent.

  The class `.export-options-panel` is unique (not in shared.css) so there
  is no collision risk per .claude/rules/renderer.md "Class-name collision
  check". Leaving as-is is the correct call per the all-or-nothing rule's
  documented exception path.
-->
<template>
  <div class="export-options-panel">
    <h4>{{ $t('exportOptions.title') }}</h4>

    <label class="checkbox-row">
      <input type="checkbox" v-model="opts.excludeLiving" @change="emitUpdate" />
      {{ $t('exportOptions.excludeLiving') }}
    </label>

    <label class="checkbox-row">
      <input type="checkbox" v-model="opts.includeNotes" @change="emitUpdate" />
      {{ $t('exportOptions.includeNotes') }}
    </label>

    <label class="checkbox-row">
      <input type="checkbox" v-model="opts.includeSources" @change="emitUpdate" />
      {{ $t('exportOptions.includeSources') }}
    </label>

    <label class="checkbox-row">
      <input type="checkbox" v-model="opts.includeMedia" @change="emitUpdate" />
      {{ $t('exportOptions.includeMedia') }}
    </label>

    <details class="branch-filter" @toggle="handleBranchToggle">
      <summary>{{ $t('exportOptions.branchFilterTitle') }}</summary>
      <div class="branch-filter-content">
        <label>{{ $t('exportOptions.focalPerson') }}</label>
        <PersonPicker
          :model-value="branchPersonId"
          :placeholder="$t('exportOptions.pickPerson')"
          @update:model-value="setBranchPerson"
        />

        <label>{{ $t('exportOptions.direction') }}</label>
        <div class="direction-radios">
          <label>
            <input type="radio" value="ancestors" v-model="branchDirection" @change="emitUpdate" />
            {{ $t('exportOptions.ancestors') }}
          </label>
          <label>
            <input type="radio" value="descendants" v-model="branchDirection" @change="emitUpdate" />
            {{ $t('exportOptions.descendants') }}
          </label>
          <label>
            <input type="radio" value="both" v-model="branchDirection" @change="emitUpdate" />
            {{ $t('exportOptions.both') }}
          </label>
        </div>

        <label>{{ $t('exportOptions.generations') }}</label>
        <input
          type="number"
          v-model.number="branchGenerations"
          min="1"
          max="50"
          :placeholder="$t('exportOptions.generationsPlaceholder')"
          @input="emitUpdate"
        />
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import PersonPicker from './PersonPicker.vue';

export interface ExportOptions {
  excludeLiving: boolean;
  includeMedia: boolean;
  includeNotes: boolean;
  includeSources: boolean;
  branchFilter?: {
    personId: string;
    direction: 'ancestors' | 'descendants' | 'both';
    generations?: number;
  };
}

const emit = defineEmits<{
  'update:options': [options: ExportOptions];
}>();

const opts = reactive({
  excludeLiving: false,
  includeMedia: true,
  includeNotes: true,
  includeSources: true,
});

const branchEnabled = ref(false);
const branchPersonId = ref<string | null>(null);
const branchDirection = ref<'ancestors' | 'descendants' | 'both'>('both');
const branchGenerations = ref<number | undefined>(undefined);

function setBranchPerson(id: string | null) {
  branchPersonId.value = id;
  emitUpdate();
}

function handleBranchToggle(e: Event) {
  branchEnabled.value = (e.target as HTMLDetailsElement).open;
  emitUpdate();
}

function emitUpdate() {
  const options: ExportOptions = {
    excludeLiving: opts.excludeLiving,
    includeMedia: opts.includeMedia,
    includeNotes: opts.includeNotes,
    includeSources: opts.includeSources,
  };
  if (branchEnabled.value && branchPersonId.value) {
    options.branchFilter = {
      personId: branchPersonId.value,
      direction: branchDirection.value,
      generations: branchGenerations.value || undefined,
    };
  }
  emit('update:options', options);
}
</script>

<style scoped>
.export-options-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-bg);
}
.export-options-panel h4 {
  margin: 0 0 4px 0;
  font-size: var(--font-md);
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-sm);
  cursor: pointer;
}
.branch-filter {
  margin-top: 4px;
}
.branch-filter summary {
  cursor: pointer;
  font-size: var(--font-sm);
  font-weight: 600;
}
.branch-filter-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 0 0;
}
.branch-filter-content > label {
  font-size: var(--font-sm);
  font-weight: 500;
}
.branch-filter-content input[type="number"] {
  width: 80px;
  padding: 4px 8px;
  font-size: var(--font-sm);
}
.direction-radios {
  display: flex;
  gap: 16px;
  font-size: var(--font-sm);
}
.direction-radios label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
</style>
