<template>
  <div class="website-export-view">
    <h2>{{ $t('htmlSite.title') }}</h2>

    <section class="export-section">
      <h3>{{ $t('htmlSite.subject') }}</h3>
      <PersonPicker v-model="focusPersonId" />
      <p class="hint">{{ $t('htmlSite.subjectHint') }}</p>
    </section>

    <section class="export-section">
      <h3>{{ $t('htmlSite.scope') }}</h3>
      <label class="radio-label">
        <input type="radio" v-model="scopeMode" value="focus" />
        {{ $t('htmlSite.scopeFocus') }}
      </label>
      <label class="radio-label">
        <input type="radio" v-model="scopeMode" value="everyone" />
        {{ $t('htmlSite.scopeEveryone') }}
      </label>
      <div v-if="scopeMode === 'focus'" class="indent">
        <label class="select-label">
          {{ $t('htmlSite.ancestors') }}
          <select v-model.number="ancestors">
            <option v-for="n in [3,4,5,6,7,8,9,10]" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label class="select-label">
          {{ $t('htmlSite.descendants') }}
          <select v-model.number="descendants">
            <option v-for="n in [1,2,3,4,5,6]" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
      </div>
    </section>

    <section class="export-section">
      <h3>{{ $t('htmlSite.privacy') }}</h3>
      <label class="check-label">
        <input type="checkbox" v-model="excludeLiving" />
        {{ $t('htmlSite.excludeLiving') }}
      </label>
      <label class="check-label">
        <input type="checkbox" v-model="redactLiving" />
        {{ $t('htmlSite.redactLiving') }}
      </label>
    </section>

    <section class="export-section">
      <h3>{{ $t('htmlSite.include') }}</h3>
      <label class="check-label">
        <input type="checkbox" v-model="includeMedia" />
        {{ $t('htmlSite.includeMedia') }}
      </label>
      <label class="check-label">
        <input type="checkbox" v-model="includeReports" />
        {{ $t('htmlSite.includeReports') }}
      </label>
      <label class="check-label">
        <input type="checkbox" v-model="includePrints" />
        {{ $t('htmlSite.includePrints') }}
      </label>
    </section>

    <section class="export-section">
      <h3>{{ $t('htmlSite.site') }}</h3>
      <label class="field-label">
        {{ $t('htmlSite.siteTitle') }}
        <input v-model="siteTitle" class="ep-input" />
      </label>
    </section>

    <AppButton
      variant="primary"
      :disabled="exporting || !focusPersonId"
      @click="exportSite"
    >
      {{ exporting ? $t('htmlSite.exporting') : $t('htmlSite.export') }}
    </AppButton>

    <p v-if="lastOutput" class="success-hint">
      {{ $t('htmlSite.exportedTo') }} <code>{{ lastOutput }}</code>
    </p>
    <p v-if="bundleMissing" class="error-hint">
      {{ $t('htmlSite.bundleMissing') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PersonPicker from '../components/PersonPicker.vue';
import AppButton from '../components/ui/AppButton.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const focusPersonId = ref<string | null>(null);
const scopeMode = ref<'focus' | 'everyone'>('focus');
const ancestors = ref(5);
const descendants = ref(3);
const excludeLiving = ref(false);
const redactLiving = ref(true);
const includeMedia = ref(true);
const includeReports = ref(true);
const includePrints = ref(true);
const siteTitle = ref('Family Tree');
const exporting = ref(false);
const lastOutput = ref<string | null>(null);
const bundleMissing = ref(false);

onMounted(async () => {
  const id = await window.api.db.getSetting('default_person_id');
  if (id) focusPersonId.value = id as string;
});

async function exportSite() {
  exporting.value = true;
  lastOutput.value = null;
  bundleMissing.value = false;
  try {
    const res = await window.api.website.export({
      siteTitle: siteTitle.value,
      focusPersonId: focusPersonId.value,
      scope: scopeMode.value === 'everyone'
        ? { everyone: true }
        : { focusId: focusPersonId.value, ancestors: ancestors.value, descendants: descendants.value },
      options: {
        includeMedia: includeMedia.value,
        includeReports: includeReports.value,
        includePrints: includePrints.value,
        excludeLiving: excludeLiving.value,
        redactLiving: redactLiving.value,
      },
    }) as { canceled?: boolean; outputDir?: string; bundleMissing?: boolean } | null;
    if (res?.bundleMissing) {
      bundleMissing.value = true;
    } else if (res && !res.canceled && res.outputDir) {
      lastOutput.value = res.outputDir;
    }
  } catch (e) {
    console.error('Export failed', e);
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.website-export-view {
  padding: var(--space-xl);
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}
.export-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.export-section h3 {
  font-size: var(--font-md);
  font-weight: 600;
  margin: 0;
}
.hint, .success-hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin: 0;
}
.success-hint {
  color: var(--success-text);
}
.error-hint {
  color: var(--error-text);
}
.radio-label, .check-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}
.select-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
.ep-input {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  font-size: var(--font-base);
}
.indent {
  margin-left: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
</style>
