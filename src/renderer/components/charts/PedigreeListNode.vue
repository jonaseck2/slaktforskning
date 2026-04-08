<template>
  <li>
    <router-link v-if="person" :to="'/persons/' + person.id" class="person-link">
      {{ ((person.givenName || '') + ' ' + (person.surname || '')).trim() || $t('common.unknown') }}
    </router-link>
    <span v-if="person?.birthDate || person?.deathDate" class="dates">
      ({{ person.birthDate || '?' }}–{{ person.deathDate || '' }})
    </span>
    <span v-if="!person" class="unknown">{{ $t('common.unknown') }}</span>
    <ul v-if="father || mother">
      <PedigreeListNode v-if="father" :tree="tree" :ahnentafel="ahnentafel * 2" />
      <PedigreeListNode v-if="mother" :tree="tree" :ahnentafel="ahnentafel * 2 + 1" />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PedigreeTree } from '../../utils/chartLayout';

useI18n();

const props = defineProps<{
  tree: PedigreeTree;
  ahnentafel: number;
}>();

const person = computed(() => props.tree.nodes.get(props.ahnentafel) ?? null);
const father = computed(() => props.tree.nodes.get(props.ahnentafel * 2) ?? null);
const mother = computed(() => props.tree.nodes.get(props.ahnentafel * 2 + 1) ?? null);
</script>

<style scoped>
li { padding: 4px 0; }
ul {
  list-style: none;
  padding-left: 24px;
  border-left: 1px solid var(--color-border);
}
.dates {
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  margin-left: 4px;
}
.unknown {
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
