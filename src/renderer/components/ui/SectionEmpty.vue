<template>
  <div :class="['section-empty', { 'section-empty--coaching': isCoachingMode }]">
    <template v-if="isCoachingMode">
      <p class="section-empty__purpose">{{ t(purposeKey!) }}</p>
      <p v-if="secondaryHintKey" class="section-empty__hint">{{ t(secondaryHintKey) }}</p>
      <slot name="cta">
        <button
          v-if="actionLabelKey"
          class="section-empty__action section-empty__action--primary"
          @click="$emit('action')"
        >
          {{ t(actionLabelKey) }}
        </button>
      </slot>
    </template>
    <template v-else>
      <span class="section-empty__text">{{ message }}</span>
      <button v-if="actionLabel" class="section-empty__action" @click="$emit('action')">
        {{ actionLabel }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  message?: string;
  actionLabel?: string;
  purposeKey?: string;
  actionLabelKey?: string;
  secondaryHintKey?: string;
}>();

defineEmits<{ action: [] }>();

const { t } = useI18n();
const isCoachingMode = computed(() => Boolean(props.purposeKey));
</script>

<style scoped>
.section-empty {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.section-empty--coaching {
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-md);
  text-align: center;
}

.section-empty__text {
  flex: 1;
}

.section-empty__purpose {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-base);
  line-height: 1.5;
  max-width: 48ch;
}

.section-empty__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
  max-width: 48ch;
}

.section-empty__action {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--accent);
  font-size: var(--font-sm);
  font-family: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  line-height: inherit;
}

.section-empty__action:hover {
  color: var(--accent-hover);
}

.section-empty__action--primary {
  padding: var(--space-sm) var(--space-md);
  background: var(--accent);
  color: var(--accent-text);
  border-radius: var(--radius-md);
  text-decoration: none;
}

.section-empty__action--primary:hover {
  background: var(--accent-hover);
  color: var(--accent-text);
}
</style>
