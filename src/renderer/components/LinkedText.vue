<template>
  <span class="linked-text">
    <template v-if="!enabled">{{ props.text }}</template>
    <template v-else>
      <template v-for="(seg, i) in segments" :key="i">
        <a
          v-if="seg.url"
          :href="seg.url"
          :title="seg.ruleName"
          class="source-link"
          @click.stop.prevent="openExternal(seg.url!)"
        >{{ seg.text }}</a>
        <template v-else>{{ seg.text }}</template>
      </template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { linkify, type LinkedSegment } from '../../api/source-linker';
import { useLinkRulesStore } from '../stores/linkRules';

const props = withDefaults(defineProps<{
  text: string;
  enabled?: boolean;
}>(), {
  enabled: true,
});

const store = useLinkRulesStore();
// Lazy init — safe to call repeatedly; resolves once.
store.init();

const segments = computed<LinkedSegment[]>(() => {
  if (!props.text || !store.loaded) return props.text ? [{ text: props.text }] : [];
  return linkify(props.text, store.rules);
});

function openExternal(url: string) {
  (globalThis as unknown as { api?: { shell?: { openExternal?: (url: string) => void } } })
    .api?.shell?.openExternal?.(url);
}
</script>

<style scoped>
.source-link {
  color: var(--color-link, var(--accent));
  text-decoration: underline;
  text-decoration-style: dotted;
  cursor: pointer;
}
.source-link:hover {
  text-decoration-style: solid;
}
</style>
