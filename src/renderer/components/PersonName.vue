<template>
  <span class="person-name">
    <template v-for="(part, i) in parts" :key="i">
      <u v-if="part.underline" class="preferred-token">{{ part.text }}</u>
      <span v-else>{{ part.text }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fullNameParts } from '../utils/nameUtils';

const props = defineProps<{
  givenName: string | null;
  surname?: string | null;
  preferredName: string | null;
}>();

const parts = computed(() => fullNameParts(props.givenName ?? null, props.surname ?? null, props.preferredName));
</script>

<style scoped>
.person-name {
  display: inline;
}
.preferred-token {
  text-decoration: underline;
  text-decoration-style: solid;
}
</style>
