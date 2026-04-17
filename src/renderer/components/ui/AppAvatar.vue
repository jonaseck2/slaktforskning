<template>
  <div :class="['app-avatar', `app-avatar--${size}`]" :style="avatarStyle">
    <img v-if="src" :src="src" :alt="initials" class="app-avatar__img" />
    <span v-else>{{ initials }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  givenName?: string;
  surname?: string;
  sex?: 'M' | 'F' | 'U';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string | null;
}>(), {
  givenName: '',
  surname: '',
  sex: 'U',
  size: 'md',
  src: null,
});

const initials = computed(() => {
  const g = props.givenName.trim();
  const s = props.surname.trim();
  if (g && s) return (g[0] + s[0]).toUpperCase();
  if (g) return g.slice(0, 2).toUpperCase();
  if (s) return s.slice(0, 2).toUpperCase();
  return '?';
});

const avatarStyle = computed(() => {
  if (props.src) return {};
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
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: var(--font-weight-bold);
  user-select: none;
  overflow: hidden;
}

/* Sizes */
.app-avatar--sm  { width: 20px; height: 20px; font-size: 8px;  }
.app-avatar--md  { width: 28px; height: 28px; font-size: 10px; }
.app-avatar--lg  { width: 36px; height: 36px; font-size: 13px; }
.app-avatar--xl  { width: 56px; height: 56px; font-size: 18px; }

.app-avatar__img {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full);
  object-fit: cover;
}
</style>
