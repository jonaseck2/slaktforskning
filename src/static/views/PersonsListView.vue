<template>
  <div class="static-list-view">
    <PersonsListTab :embedded="true" @select="goTo" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import PersonsListTab from '../../renderer/views/PersonsListTab.vue';

const router = useRouter();
function goTo(personId: string) {
  router.push(`/persons/${personId}`);
}
</script>

<style scoped>
.static-list-view {
  padding: var(--space-lg);
  flex: 1;
  overflow-y: auto;
}
</style>
