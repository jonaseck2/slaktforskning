<template>
  <!-- STANDALONE: BaseModal provides overlay + focus trap; the entity card itself is the visible surface -->
  <BaseModal
    v-if="mode === 'standalone'"
    :title-id="titleId"
    modal-class="modal--panel-host"
    @close="$emit('cancel')"
  >
    <div class="entity-panel-wrap">
      <div class="entity-panel">
        <div class="ep-header" :style="headerStyle">
          <div class="ep-header-left">
            <span v-if="resolvedIcon" class="ep-icon" aria-hidden="true">{{ resolvedIcon }}</span>
            <div class="ep-header-text">
              <span v-if="resolvedLabel" class="ep-label" :style="{ color: visual.fg }">{{ resolvedLabel }}</span>
              <div :id="titleId" class="ep-title">{{ title }}</div>
            </div>
          </div>
        </div>
        <div class="ep-body">
          <slot />
        </div>
        <div class="ep-footer">
          <button type="button" class="btn-cancel" @click="$emit('cancel')">
            {{ cancelLabel ?? $t('common.cancel') }}
          </button>
          <button
            v-if="!hideSave"
            type="button"
            class="btn-add"
            :style="{ background: saveBg, color: '#fff' }"
            @click="$emit('save')"
          >
            {{ saveLabel ?? $t('common.save') }}
          </button>
        </div>
      </div>
      <slot name="subpanels" />
    </div>
  </BaseModal>

  <!-- SUBPANEL: floating card, no overlay; closes via × -->
  <div v-else class="entity-panel-wrap">
    <div class="entity-panel">
      <div class="ep-header" :style="headerStyle">
        <div class="ep-header-left">
          <span v-if="resolvedIcon" class="ep-icon" aria-hidden="true">{{ resolvedIcon }}</span>
          <div class="ep-header-text">
            <span v-if="resolvedLabel" class="ep-label" :style="{ color: visual.fg }">{{ resolvedLabel }}</span>
            <div class="ep-title">{{ title }}</div>
          </div>
        </div>
        <button
          class="ep-close"
          type="button"
          :aria-label="$t('common.close')"
          @click="$emit('close')"
        >×</button>
      </div>
      <div class="ep-body">
        <slot />
      </div>
      <div class="ep-footer">
        <button type="button" class="btn-cancel" @click="$emit('cancel')">
          {{ cancelLabel ?? $t('common.cancel') }}
        </button>
        <button
          v-if="!hideSave"
          type="button"
          class="btn-add"
          :style="{ background: saveBg, color: '#fff' }"
          @click="$emit('save')"
        >
          {{ saveLabel ?? $t('common.save') }}
        </button>
      </div>
    </div>
    <slot name="subpanels" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../BaseModal.vue';
import { ENTITY_VISUALS, type EntityType } from '../../constants/entityColors';

const props = withDefaults(defineProps<{
  entityType: EntityType;
  /** Title text shown as the second line of the header (entity name / event type / etc.) */
  title: string;
  /** Optional override for the small caps label above the title. Defaults to the entity's own labelKey. */
  label?: string;
  mode?: 'standalone' | 'subpanel';
  saveLabel?: string;
  /** When true, the save/primary button is hidden. Use for informational dialogs with only a close action. */
  hideSave?: boolean;
  /** Override label for the cancel/close button. Defaults to $t('common.cancel'). */
  cancelLabel?: string;
  /** Optional icon override — when provided, replaces the entity visual's default icon in the header. */
  icon?: string;
  /** Tone for the save button. 'danger' renders a red background using --error-text (#b91c1c). Default: 'info'. */
  tone?: 'info' | 'warning' | 'danger';
}>(), {
  mode: 'standalone',
  hideSave: false,
  tone: 'info',
});

defineEmits<{
  cancel: [];
  save: [];
  close: [];
}>();

const { t, te } = useI18n();

const visual = computed(() => ENTITY_VISUALS[props.entityType]);
const titleId = computed(() => `${props.entityType}-panel-title`);
const headerStyle = computed(() => ({
  background: visual.value.hd,
  borderBottom: `1px solid ${visual.value.border}`,
}));

const resolvedLabel = computed(() => {
  if (props.label !== undefined) return props.label;
  const key = visual.value.labelKey;
  if (!key) return '';
  return te(key) ? t(key) : '';
});

const resolvedIcon = computed(() => props.icon ?? visual.value.icon);

const saveBg = computed(() =>
  props.tone === 'danger' ? 'var(--error-text, #b91c1c)' : visual.value.fg
);
</script>
