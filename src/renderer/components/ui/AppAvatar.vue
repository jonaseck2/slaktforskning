<template>
  <div :class="['app-avatar', `app-avatar--${size}`]" :style="avatarStyle">
    <img v-if="effectiveSrc" :src="effectiveSrc" :alt="altText" class="app-avatar__img" />
    <span v-else>{{ initials }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { usePersonProfilePic } from '../../composables/usePersonProfilePic';

const props = withDefaults(defineProps<{
  personId?: string | null;
  givenName?: string;
  surname?: string;
  preferredName?: string | null;
  sex?: 'M' | 'F' | 'U';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'auto';
  src?: string | null;
}>(), {
  personId: null,
  givenName: '',
  surname: '',
  preferredName: null,
  sex: 'U',
  size: 'md',
  src: null,
});

const { src: storeSrc } = usePersonProfilePic(toRef(props, 'personId'));

const effectiveSrc = computed<string | null>(() => {
  if (props.src) return props.src;
  return storeSrc.value;
});

const initials = computed(() => {
  const g = props.givenName.trim();
  const s = props.surname.trim();
  // Prefer the tilltalsnamn's first letter when it appears within the given names.
  const pref = (props.preferredName ?? '').trim();
  const givenFirst = pref && g.toLowerCase().split(/\s+/).includes(pref.toLowerCase())
    ? pref[0]
    : (g[0] ?? '');
  if (givenFirst && s) return (givenFirst + s[0]).toUpperCase();
  if (givenFirst) return (givenFirst + (g[1] ?? '')).toUpperCase();
  if (s) return s.slice(0, 2).toUpperCase();
  return '?';
});

const altText = computed(() => {
  const full = [props.givenName, props.surname].map(p => p.trim()).filter(Boolean).join(' ');
  return full || initials.value;
});

const avatarStyle = computed(() => {
  if (effectiveSrc.value) return {};
  const map: Record<string, { background: string; color: string }> = {
    F: { background: 'var(--sex-f-bg)', color: 'var(--sex-f-text)' },
    M: { background: 'var(--sex-m-bg)', color: 'var(--sex-m-text)' },
    U: { background: 'var(--sex-u-bg)', color: 'var(--sex-u-text)' },
  };
  return map[props.sex] ?? map['U'];
});
</script>

<style scoped>
.app-avatar {
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: var(--font-weight-bold);
  user-select: none;
  overflow: hidden;
  aspect-ratio: 1 / 1;
}

/* Sizes */
.app-avatar--sm   { width: 20px; height: 20px; font-size: 8px;  }
.app-avatar--md   { width: 28px; height: 28px; font-size: 10px; }
.app-avatar--lg   { width: 36px; height: 36px; font-size: 13px; }
.app-avatar--xl   { width: 56px; height: 56px; font-size: 18px; }
.app-avatar--2xl  { width: 64px; height: 64px; font-size: 22px; }
/* `auto` lets the parent size the avatar via width/height (used by chart/print contexts). */
.app-avatar--auto { width: 100%; height: 100%; font-size: inherit; }

.app-avatar__img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
</style>
