<template>
  <div class="entity-panel side-panel">
    <div v-if="!entity" class="panel-empty">{{ $t('panel.selectToView') }}</div>
    <template v-else>
      <button
        class="panel-collapse-btn"
        :aria-label="$t('common.close')"
        :title="$t('common.close')"
        data-testid="entity-close"
        @click="$emit('close')"
      >▶</button>
      <h3 class="panel-role-label">{{ label }}</h3>
      <div class="panel-header">
        <div class="panel-header-content">
          <slot name="header">
            <div class="panel-name-row">
              <div class="panel-name">{{ entity?.id ?? '' }}</div>
            </div>
          </slot>
        </div>
      </div>
      <button
        v-if="editable"
        class="btn-add"
        data-testid="entity-edit"
        @click="$emit('edit')"
      >{{ $t('common.edit') }}</button>
      <slot />
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  entityType: 'person' | 'place' | 'source' | 'relationship' | 'group' | 'task' | 'media';
  entity: { id: string } | null;
  label: string;
  editable?: boolean;
}>();
defineEmits<{ close: []; edit: [] }>();
</script>
