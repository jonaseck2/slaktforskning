<template>
  <div class="static-detail-view">
    <PersonPanel
      :person-id="personId"
      :readonly="true"
      @close="$router.push('/persons')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PersonPanel from '../../renderer/components/PersonPanel.vue';

const route = useRoute();
const personId = computed(() => route.params.id as string);
</script>

<style scoped>
.static-detail-view {
  flex: 1;
  overflow-y: auto;
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-lg);
}
</style>
