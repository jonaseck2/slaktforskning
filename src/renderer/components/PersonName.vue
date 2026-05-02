<template>
  <span class="person-name">
    <template v-for="(part, i) in parts" :key="i">
      <u v-if="part.underline" class="preferred-token">{{ part.text }}</u>
      <span v-else>{{ part.text }}</span>
    </template>
    <span v-if="showBirthSuffix" class="birth-suffix"> ({{ bornAbbrev }} {{ props.birthSurname }})</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fullNameParts } from '../utils/nameUtils';

const props = withDefaults(defineProps<{
  givenName: string | null;
  surname?: string | null;
  preferredName: string | null;
  nickname?: string | null;
  birthSurname?: string | null;
  showBirthNameParenthetical?: boolean;
}>(), {
  showBirthNameParenthetical: true,
});

const { t } = useI18n();

const parts = computed(() => fullNameParts(props.givenName ?? null, props.surname ?? null, props.preferredName, props.nickname ?? null));

const bornAbbrev = computed(() => t('common.bornAbbrev'));

const showBirthSuffix = computed(() => {
  if (props.showBirthNameParenthetical === false) return false;
  const birth = (props.birthSurname ?? '').trim();
  if (!birth) return false;
  const current = (props.surname ?? '').trim();
  if (birth === current) return false;
  return true;
});
</script>

<style scoped>
.person-name {
  display: inline;
}
.preferred-token {
  text-decoration: underline;
  text-decoration-style: solid;
}
.birth-suffix {
  /* Plain non-underlined text — keeps the preferred-token underline isolated. */
  text-decoration: none;
}
</style>
