<template>
  <div class="pedigree-list-view">
    <ul v-if="tree" class="ancestor-list">
      <PedigreeListNode :tree="tree" :ahnentafel="1" />
    </ul>
    <p v-else class="empty">{{ $t('common.loading') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchPedigreeTree } from '../../utils/chartData';
import type { PedigreeTree } from '../../utils/chart-layout';
import PedigreeListNode from './PedigreeListNode.vue';

useI18n();

const props = defineProps<{ personId: string | undefined }>();

const tree = ref<PedigreeTree | null>(null);

async function load() {
  if (!props.personId) { tree.value = null; return; }
  tree.value = await fetchPedigreeTree(props.personId);
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.pedigree-list-view {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}
.ancestor-list {
  list-style: none;
  padding: 0;
}
</style>
