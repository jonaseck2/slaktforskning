<template>
  <component
    :is="href ? 'a' : 'div'"
    :href="href || undefined"
    class="face-tag-box"
    :class="[
      `vis-${visibility}`,
      themed ? 'themed' : 'unthemed',
      identified ? 'identified' : 'unidentified',
      state !== 'normal' ? `state-${state}` : '',
    ]"
    :style="boxStyle"
  >
    <slot />
    <span v-if="label" class="face-tag-box__label">{{ label }}</span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  rect: { x: number; y: number; width: number; height: number };
  identified: boolean;
  label?: string | null;
  /** 'always': border + label visible at all times (media viewer).
   *  'hover': border + label invisible until pointer hovers (reports). */
  visibility: 'always' | 'hover';
  /** true: use theme tokens (--accent). false: use a fixed neutral color
   *  that doesn't depend on the active theme — used in printable reports. */
  themed?: boolean;
  href?: string | null;
  state?: 'normal' | 'highlighted' | 'editing';
}>(), {
  label: null,
  themed: true,
  href: null,
  state: 'normal',
});

const boxStyle = computed(() => ({
  left: (props.rect.x * 100) + '%',
  top: (props.rect.y * 100) + '%',
  width: (props.rect.width * 100) + '%',
  height: (props.rect.height * 100) + '%',
}));
</script>

<style scoped>
/* Single shared geometry for both views — only colors differ. */
.face-tag-box {
  --face-tag-color: var(--accent);
  --face-tag-text: var(--accent-text);

  position: absolute;
  border: 3px dashed var(--face-tag-color);
  border-radius: var(--radius-sm);
  pointer-events: auto;
  text-decoration: none;
}

/* Unthemed: a fixed neutral color so prints look the same regardless of the
   user's chosen theme. */
.face-tag-box.unthemed {
  --face-tag-color: #4a9eff;
  --face-tag-text: #ffffff;
}

.face-tag-box.unidentified {
  --face-tag-color: var(--warning-text);
  --face-tag-text: var(--warning-bg);
}
.face-tag-box.unthemed.unidentified {
  --face-tag-color: #f5a623;
  --face-tag-text: #2b1c00;
}

/* hover visibility (reports): box hidden until hovered */
.face-tag-box.vis-hover {
  border-color: transparent;
  transition: border-color 0.15s;
}
.face-tag-box.vis-hover:hover {
  border-color: var(--face-tag-color);
}

/* --- Label pill below the box — same shape in every view --- */
.face-tag-box__label {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-sm);
  color: var(--face-tag-text);
  background: var(--face-tag-color);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  pointer-events: none;
}

/* hover-mode: fade label in/out together with the box */
.face-tag-box.vis-hover .face-tag-box__label {
  opacity: 0;
  transition: opacity 0.15s;
}
.face-tag-box.vis-hover:hover .face-tag-box__label {
  opacity: 1;
}
</style>
