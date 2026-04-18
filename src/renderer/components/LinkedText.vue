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
import { ref, computed, onMounted } from 'vue';
import { linkify, resolveRules, type LinkedSegment, type LinkRuleOverrides } from '../../api/source-linker';
import { svRules } from '../../api/link-rules/sv';
import { enRules } from '../../api/link-rules/en';
import { deRules } from '../../api/link-rules/de';
import { daRules } from '../../api/link-rules/da';
import { noRules } from '../../api/link-rules/no';
import { universalRules } from '../../api/link-rules/universal';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  text: string;
}>();

const allDefaults = [...universalRules, ...svRules, ...enRules, ...deRules, ...daRules, ...noRules];

const config = ref<LinkRuleOverrides>({ enabledLocales: ['sv'], overrides: {} });
const loaded = ref(false);

async function loadConfig() {
  try {
    const raw = await window.api.db.getSetting('link_rules_config') as string | null;
    if (raw) {
      config.value = JSON.parse(raw) as LinkRuleOverrides;
    }
  } catch {
    // keep default
  }
  loaded.value = true;
}

const segments = computed<LinkedSegment[]>(() => {
  if (!props.text || !loaded.value) return [];
  const rules = resolveRules(allDefaults, config.value);
  return linkify(props.text, rules);
});

function openExternal(url: string) {
  window.api.shell.openExternal(url);
}

onMounted(loadConfig);
</script>

<style scoped>
.source-link {
  color: var(--color-link);
  text-decoration: underline;
  text-decoration-style: dotted;
  cursor: pointer;
}
.source-link:hover {
  text-decoration-style: solid;
}
</style>
