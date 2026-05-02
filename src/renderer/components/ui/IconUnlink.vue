<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
    <path d="M15 7h2a5 5 0 0 1 4.546 7.071"/>
    <line x1="3" y1="3" x2="21" y2="21"/>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ size?: number | string }>();
</script>
