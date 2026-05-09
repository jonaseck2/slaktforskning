<!-- Empty-state coaching N/A: WebsitePanel is a configuration form (export options, generation depth picker, redaction toggles), not a list-shaped section. The v-for usages are inside <select><option> elements for numeric choice ranges. See docs/plans/2026-05-09-onboarding-design.md §Scope deviations. -->
<template>
  <EntityPanel
    entity-type="website"
    :entity="{ id: 'website' }"
    :label="$t('panel.manageWebsite')"
    @close="emit('close')"
  >
    <template #empty>{{ $t('panel.selectToView') }}</template>
    <template #header>
      <div class="panel-name-row">
        <div class="panel-name">{{ $t('htmlSite.title') }}</div>
      </div>
    </template>

    <div class="panel-body">

      <!-- Focus person -->
      <div class="panel-section">
        <SectionHeader :title="$t('htmlSite.focusPerson')" :collapsed="!open.subject" @toggle="toggleSection('subject')" />
        <div v-if="open.subject" class="panel-section-body">
          <PersonPicker :model-value="focusPersonId ?? null" @update:model-value="focusPersonId = $event" />
          <p class="panel-hint">{{ $t('htmlSite.focusPersonHint') }}</p>
        </div>
      </div>

      <!-- Scope -->
      <div class="panel-section">
        <SectionHeader :title="$t('htmlSite.scope')" :collapsed="!open.scope" @toggle="toggleSection('scope')" />
        <div v-if="open.scope" class="panel-section-body">
          <label class="panel-radio">
            <input type="radio" :checked="scopeMode === 'focus'" @change="scopeMode = 'focus'" />
            {{ $t('htmlSite.scopeFocus') }}
          </label>
          <label class="panel-radio">
            <input type="radio" :checked="scopeMode === 'everyone'" @change="scopeMode = 'everyone'" />
            {{ $t('htmlSite.scopeEveryone') }}
          </label>
          <div v-if="scopeMode === 'focus'" class="panel-control">
            <label class="panel-label">{{ $t('htmlSite.ancestors') }}</label>
            <select :value="ancestors" class="panel-select" @change="ancestors = Number(($event.target as HTMLSelectElement).value)">
              <option v-for="n in [3,4,5,6,7,8,9,10]" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>
          <div v-if="scopeMode === 'focus'" class="panel-control">
            <label class="panel-label">{{ $t('htmlSite.descendants') }}</label>
            <select :value="descendants" class="panel-select" @change="descendants = Number(($event.target as HTMLSelectElement).value)">
              <option v-for="n in [1,2,3,4,5,6]" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Privacy -->
      <div class="panel-section">
        <SectionHeader :title="$t('htmlSite.privacy')" :collapsed="!open.privacy" @toggle="toggleSection('privacy')" />
        <div v-if="open.privacy" class="panel-section-body">
          <label class="panel-checkbox"><input type="checkbox" v-model="excludeLiving"> {{ $t('htmlSite.excludeLiving') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="redactLiving" :disabled="excludeLiving"> {{ $t('htmlSite.redactLiving') }}</label>
          <label class="panel-checkbox"><input type="checkbox" v-model="mediaPersonOnly"> {{ $t('htmlSite.mediaPersonOnly') }}</label>
        </div>
      </div>

      <!-- Include -->
      <div class="panel-section">
        <SectionHeader :title="$t('htmlSite.include')" :collapsed="!open.include" @toggle="toggleSection('include')" />
        <div v-if="open.include" class="panel-section-body">
          <label class="panel-checkbox">
            <input type="checkbox" v-model="includeMedia">
            {{ $t('htmlSite.includeMedia') }}
            <span v-if="includeMedia && mediaCount !== null && mediaCount !== undefined" class="media-count">
              ({{ $t('htmlSite.mediaCount', { count: mediaCount }, mediaCount) }})
            </span>
          </label>
        </div>
      </div>

      <!-- Site -->
      <div class="panel-section">
        <SectionHeader :title="$t('htmlSite.site')" :collapsed="!open.site" @toggle="toggleSection('site')" />
        <div v-if="open.site" class="panel-section-body">
          <div class="panel-control">
            <label class="panel-label">{{ $t('htmlSite.siteTitle') }}</label>
            <input v-model="siteTitle" class="panel-input" />
          </div>
        </div>
      </div>

    </div>

    <div class="panel-actions">
      <AppButton
        variant="primary"
        class="panel-action-btn"
        :disabled="exporting || !focusPersonId"
        @click="emit('export')"
      >
        {{ exporting ? $t('htmlSite.exporting') : $t('htmlSite.export') }}
      </AppButton>
      <p v-if="lastOutput" class="panel-success-hint">
        {{ $t('htmlSite.exportedTo') }} <code>{{ lastOutput }}</code>
      </p>
      <p v-if="bundleMissing" class="panel-error-hint">
        {{ $t('htmlSite.bundleMissing') }}
      </p>
    </div>
  </EntityPanel>
</template>

<script setup lang="ts">
import EntityPanel from './EntityPanel.vue';
import SectionHeader from './ui/SectionHeader.vue';
import AppButton from './ui/AppButton.vue';
import PersonPicker from './PersonPicker.vue';
import { usePanelSections } from '../composables/usePanelSections';

const focusPersonId = defineModel<string | null>('focusPersonId');
const scopeMode = defineModel<'focus' | 'everyone'>('scopeMode', { required: true });
const ancestors = defineModel<number>('ancestors', { required: true });
const descendants = defineModel<number>('descendants', { required: true });
const excludeLiving = defineModel<boolean>('excludeLiving', { required: true });
const redactLiving = defineModel<boolean>('redactLiving', { required: true });
const mediaPersonOnly = defineModel<boolean>('mediaPersonOnly', { required: true });
const includeMedia = defineModel<boolean>('includeMedia', { required: true });
const siteTitle = defineModel<string>('siteTitle', { required: true });

withDefaults(defineProps<{
  exporting: boolean;
  lastOutput: string | null;
  bundleMissing: boolean;
  mediaCount?: number | null;
}>(), {
  mediaCount: null,
});

const emit = defineEmits<{ export: []; close: [] }>();

const { sections: open, toggleSection } = usePanelSections(
  'website-panel-section-',
  { subject: true, scope: true, privacy: true, include: true, site: true },
);
</script>

<style scoped>
.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.panel-section { border-bottom: 1px solid var(--surface-border-subtle); padding: 0 var(--space-lg); }
.panel-section:last-child { border-bottom: none; }
.panel-section-body {
  padding: var(--space-xs) 0 var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.panel-checkbox,
.panel-radio {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-sm);
  color: var(--text-primary);
  cursor: pointer;
}
.panel-checkbox input[type="checkbox"],
.panel-radio input[type="radio"] {
  accent-color: var(--accent);
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
.panel-select,
.panel-input {
  width: 100%;
  font-size: var(--font-sm);
  padding: 3px var(--space-xs);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface-bg);
  color: var(--text-primary);
}
.panel-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-bottom: 2px;
  display: block;
}
.panel-control { display: flex; flex-direction: column; gap: 2px; }
.panel-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin: 0;
}
.panel-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.panel-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
}
.panel-actions {
  flex-shrink: 0;
  padding: var(--space-sm) var(--space-lg);
  border-top: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  background: var(--surface);
}
.panel-action-btn { width: 100%; }
.panel-success-hint {
  font-size: var(--font-xs);
  color: var(--success-text);
  margin: 0;
  word-break: break-all;
}
.panel-error-hint {
  font-size: var(--font-xs);
  color: var(--error-text);
  margin: 0;
}
.media-count {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-left: var(--space-xs);
}
</style>
