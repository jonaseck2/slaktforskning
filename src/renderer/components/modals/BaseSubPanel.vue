<template>
  <!-- STANDALONE: plain white modal — entity panel card only for sub-panels -->
  <BaseModal
    v-if="mode === 'standalone'"
    :title-id="titleId"
    :modal-class="hasSub ? 'modal--panel-host' : ''"
    @close="$emit('cancel')"
  >
    <div class="ep-host-row">
      <div class="ep-host-main">
        <h3 :id="titleId">{{ title }}</h3>
        <slot />
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('cancel')">
            {{ $t('common.cancel') }}
          </button>
          <button
            type="button"
            :style="{ background: color.fg, color: '#fff', padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 600 }"
            @click="$emit('save')"
          >
            {{ saveLabel ?? $t('common.save') }}
          </button>
        </div>
      </div>
      <slot name="subpanels" />
    </div>
  </BaseModal>

  <!-- SUBPANEL: entity-coloured card, no overlay, no dimming -->
  <div v-else class="entity-panel-wrap">
    <div class="entity-panel">
      <div class="ep-header" :style="headerStyle">
        <div class="ep-header-left">
          <span class="ep-label" :style="{ color: color.fg }">{{ label }}</span>
          <div class="ep-title">{{ title }}</div>
        </div>
        <button
          class="ep-close"
          type="button"
          @click="$emit('close')"
          :aria-label="$t('common.close')"
        >×</button>
      </div>
      <div class="ep-body">
        <slot />
      </div>
      <div class="ep-footer">
        <button type="button" class="btn-cancel" @click="$emit('cancel')">
          {{ $t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn-add"
          :style="{ background: color.fg, color: '#fff' }"
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
import BaseModal from '../BaseModal.vue';
import { ENTITY_COLORS, type EntityType } from '../../constants/entityColors';

const props = withDefaults(defineProps<{
  entityType: EntityType;
  label: string;
  title: string;
  mode?: 'standalone' | 'subpanel';
  saveLabel?: string;
  hasSub?: boolean;
}>(), {
  mode: 'standalone',
  hasSub: false,
});

defineEmits<{
  cancel: [];
  save: [];
  close: [];
}>();

const color = computed(() => ENTITY_COLORS[props.entityType]);
const titleId = computed(() => `${props.entityType}-panel-title`);
const headerStyle = computed(() => ({
  background: color.value.hd,
  borderBottom: `1px solid ${color.value.border}`,
}));
</script>
