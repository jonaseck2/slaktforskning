<template>
  <div class="static-list-view">
    <div class="header">
      <h2>{{ $t('places.title') }}</h2>
    </div>
    <AppLoadingState v-if="loading" :rows="5" />
    <AppEmptyState v-else-if="places.length === 0" icon="📍" :title="$t('empty.places')" />
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('places.name') }}</th>
          <th>{{ $t('places.type') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="place in places"
          :key="place.id"
          class="clickable-row"
          @click="goTo(place.id)"
        >
          <td>{{ place.name }}</td>
          <td>{{ place.place_type ?? '' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppLoadingState from '../../renderer/components/ui/AppLoadingState.vue';
import AppEmptyState from '../../renderer/components/ui/AppEmptyState.vue';

declare const window: Window & { api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> };

const router = useRouter();
const places = ref<Array<{ id: string; name: string; place_type: string | null }>>([]);
const loading = ref(true);

onMounted(async () => {
  places.value = (await window.api.places.list()) as typeof places.value;
  loading.value = false;
});

function goTo(placeId: string) {
  router.push(`/places/${placeId}`);
}
</script>

<style scoped>
.static-list-view {
  padding: var(--space-lg);
  flex: 1;
  overflow-y: auto;
}
</style>
