<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path fill="currentColor" d="M9 3a1 1 0 0 0-1 1v1H4.5a.75.75 0 0 0 0 1.5h.6l1.18 13.06A2 2 0 0 0 8.27 21.5h7.46a2 2 0 0 0 1.99-1.94L18.9 6.5h.6a.75.75 0 0 0 0-1.5H16V4a1 1 0 0 0-1-1H9zm.5 2v-.5h5V5h-5z"/>
    <rect x="9.25" y="9" width="1.5" height="9" rx="0.5" fill="var(--surface)" opacity="0.55"/>
    <rect x="13.25" y="9" width="1.5" height="9" rx="0.5" fill="var(--surface)" opacity="0.55"/>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ size?: number | string }>();
</script>
