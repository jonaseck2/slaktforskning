<template>
  <div>
    <div v-if="showPicker" class="add-row">
      <PlacePicker v-model="pickedId" :placeholder="$t('places.searchOrCreate')" />
      <AppButton variant="primary" size="sm" :disabled="!pickedId" @click="onAdd">{{ $t('common.add') }}</AppButton>
      <AppButton variant="ghost" size="sm" @click="cancelAdd">{{ $t('common.cancel') }}</AppButton>
    </div>
    <SectionEmpty v-if="rows.length === 0 && !showPicker" :message="$t('empty.places')" />
    <table v-else-if="rows.length > 0" class="data-table">
      <thead>
        <tr>
          <th>{{ $t('places.name') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.linkId">
          <td>
            <router-link :to="'/places/' + r.placeId" class="person-link" @click.stop>
              {{ r.name }}
            </router-link>
          </td>
          <td class="actions-cell">
            <AppButton
              variant="ghost"
              size="sm"
              :aria-label="$t('a11y.deleteItem', { item: r.name })"
              @click="emit('remove', r.linkId)"
            >✕</AppButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import PlacePicker from './PlacePicker.vue';
import AppButton from './ui/AppButton.vue';
import SectionEmpty from './ui/SectionEmpty.vue';

interface LinkInput { id: string; entity_id: string }
interface Row { linkId: string; placeId: string; name: string }

const props = defineProps<{
  links: LinkInput[];
  showPicker: boolean;
}>();

const emit = defineEmits<{
  add: [placeId: string];
  remove: [linkId: string];
  cancelPicker: [];
}>();

const rows = ref<Row[]>([]);
const pickedId = ref<string | null>(null);

watch(() => props.links, async (links) => {
  const out: Row[] = [];
  for (const l of links) {
    const place = await window.api.places.get(l.entity_id) as { name: string } | null;
    out.push({ linkId: l.id, placeId: l.entity_id, name: place?.name ?? '' });
  }
  rows.value = out;
}, { immediate: true, deep: true });

watch(() => props.showPicker, (v) => { if (!v) pickedId.value = null; });

function onAdd() {
  if (!pickedId.value) return;
  const id = pickedId.value;
  pickedId.value = null;
  emit('add', id);
}

function cancelAdd() {
  pickedId.value = null;
  emit('cancelPicker');
}
</script>

<style scoped>
.add-row {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-xs) 0;
}
.add-row > :first-child { flex: 1; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; }
</style>
