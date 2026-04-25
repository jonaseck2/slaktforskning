<template>
  <!-- ── STANDALONE: centred overlay via BaseModal ── -->
  <BaseModal
    v-if="mode === 'standalone'"
    :title-id="titleId"
    @close="$emit('cancel')"
  >
    <div class="entity-panel-wrap">
      <div class="entity-panel" :class="{ 'entity-panel--dim': hasSub }">
        <div class="ep-header" :style="headerStyle">
          <div class="ep-header-left">
            <span class="ep-label" :style="{ color: color.fg }">{{ label }}</span>
            <div :id="titleId" class="ep-title">{{ title }}</div>
          </div>
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
  </BaseModal>

  <!-- ── SUBPANEL: floating card, no overlay ── -->
  <div v-else class="entity-panel-wrap">
    <div class="entity-panel" :class="{ 'entity-panel--dim': hasSub }">
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
