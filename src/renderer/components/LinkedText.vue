<template>
  <span class="linked-text">
    <template v-for="(seg, i) in segments" :key="i">
      <a
        v-if="seg.url"
        :href="seg.url"
        :title="seg.ruleName"
        class="source-link"
        @click.prevent="openExternal(seg.url!)"
      >{{ seg.text }}</a>
      <template v-else>{{ seg.text }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { linkify, type LinkedSegment } from '../../api/source-linker';
import { svRules } from '../../api/link-rules/sv';
import { enRules } from '../../api/link-rules/en';
import { universalRules } from '../../api/link-rules/universal';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  text: string;
}>();

const allRules = [...svRules, ...enRules, ...universalRules];

const segments = computed<LinkedSegment[]>(() => {
  if (!props.text) return [];
  return linkify(props.text, allRules);
});

function openExternal(url: string) {
  window.api.shell.openExternal(url);
}
</script>

<style scoped>
.source-link {
  color: var(--link-color, #4a9eff);
  text-decoration: underline;
  text-decoration-style: dotted;
  cursor: pointer;
}
.source-link:hover {
  text-decoration-style: solid;
}
</style>
