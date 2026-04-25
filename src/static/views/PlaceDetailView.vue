<template>
  <div class="static-detail-view">
    <PlacePanel
      :place-id="placeId"
      :readonly="true"
      @close="$router.push('/places')"
      @select-place="(id) => $router.push('/places/' + id)"
      @place-updated="() => {}"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PlacePanel from '../../renderer/components/PlacePanel.vue';

const route = useRoute();
const placeId = computed(() => route.params.id as string);
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
